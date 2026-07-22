// CloudEarn announce worker.
// Picks the next 'draft' announcement, sends it to all eligible users in
// batches respecting Telegram rate limits. Re-invoke (cron) until status='sent'.
//
// Deploy: supabase functions deploy announce-worker --no-verify-jwt
// Secrets: TELEGRAM_BOT_TOKEN
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { ...cors, "content-type": "application/json" },
});

type Btn = { text: string; url: string };

async function tg(method: string, body: any) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return await r.json().catch(() => ({}));
}

function buildReplyMarkup(btns: Btn[] | null) {
  if (!btns?.length) return undefined;
  return { inline_keyboard: btns.map((b) => [{ text: b.text, url: b.url }]) };
}

async function send(an: any, chatId: number) {
  const reply_markup = buildReplyMarkup(an.buttons as Btn[] | null);
  if (an.mode === "custom") {
    if (an.photo_url) {
      return await tg("sendPhoto", { chat_id: chatId, photo: an.photo_url, caption: an.text ?? "", parse_mode: "HTML", reply_markup });
    }
    return await tg("sendMessage", { chat_id: chatId, text: an.text ?? "", parse_mode: "HTML", reply_markup, disable_web_page_preview: false });
  }
  // copy mode: silent copy (no "forwarded from"). from_chat_id may be either
  // a numeric id (source_chat_id) or "@username" stored in source_chat_text.
  const fromChat = an.source_chat_id ?? an.source_chat_text;
  return await tg("copyMessage", {
    chat_id: chatId,
    from_chat_id: fromChat,
    message_id: an.source_message_id,
    reply_markup,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!SUPABASE_URL || !SERVICE_KEY || !BOT_TOKEN) return json({ error: "misconfigured" }, 500);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: an } = await supabase.from("announcements")
    .select("*").in("status", ["draft", "sending"])
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!an) return json({ ok: true, processed: 0 });

  if (an.status === "draft") {
    await supabase.from("announcements").update({ status: "sending", started_at: new Date().toISOString() }).eq("id", an.id);
  }

  const batchSize = Math.min(Math.max(Number(an.batch_size) || 25, 1), 30);
  const delayMs = Math.max(Number(an.delay_seconds) || 1, 1) * 1000;
  const sentCount = Number(an.sent_count) || 0;

  const { data: users } = await supabase.from("users")
    .select("tg_id").eq("status", "active")
    .order("tg_id", { ascending: true })
    .range(sentCount, sentCount + batchSize - 1);

  if (!users?.length) {
    await supabase.from("announcements").update({ status: "sent", finished_at: new Date().toISOString() }).eq("id", an.id);
    return json({ ok: true, processed: 0, done: true });
  }

  let sent = 0; let failed = 0;
  for (const u of users) {
    try {
      const r = await send(an, Number(u.tg_id));
      if (r?.ok) sent++; else failed++;
    } catch { failed++; }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  await supabase.from("announcements").update({
    sent_count: sentCount + sent,
    failed_count: Number(an.failed_count ?? 0) + failed,
  }).eq("id", an.id);
  return json({ ok: true, processed: sent + failed, sent, failed });
});
