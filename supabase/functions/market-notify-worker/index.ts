// CloudEarn — Market claim-ready notifier.
// Scheduled every 5 minutes. For each user with `notify_market = true`,
// finds Clouds whose hourly cycle just finished AND haven't been notified
// for the current cycle yet. Sends one Telegram DM per ready machine
// and stamps `last_notified_at` so we never spam.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

const PRODUCT_NAMES: Record<string, string> = {
  tiny: "Tiny Cloud",
  river: "River Cloud",
  gold: "Gold Cloud",
  royal: "Royal Cloud",
  commit: "Commit Cloud",
};

function todayUtcKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

async function tgSend(chatId: number, text: string) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    return r.ok;
  } catch { return false; }
}

function buildMessage(name: string): string {
  // Unique CloudEarn wording (intentionally different from other bots).
  return [
    "⛅️ <b>CloudEarn — Harvest Alert</b>",
    "",
    `Your <b>${name}</b> just finished a full hourly cycle and is holding a fresh ☁️ payload.`,
    "",
    "Tap the app to collect it before the next cycle takes its slot.",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "misconfigured" }), { status: 500, headers: CORS });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  // Everyone who opted in.
  const { data: users } = await supabase.from("users")
    .select("tg_id,notify_market,status").eq("notify_market", true).neq("status", "banned");
  if (!users?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: CORS });

  const ids = users.map((u: any) => Number(u.tg_id));
  const { data: clouds } = await supabase.from("user_clouds")
    .select("id,user_tg_id,product_id,last_claim_at,ads_progress,last_notified_at,daily_claims,expires_at")
    .in("user_tg_id", ids)
    .gt("expires_at", nowIso);

  const RECENT_WINDOW_MS = 15 * 60 * 1000; // sadece son 15 dk içinde biten cycle'lar bildirilir

  const ready = (clouds ?? []).filter((c: any) => {
    const nextAt = new Date(c.last_claim_at).getTime() + 3600 * 1000;
    if (nextAt > nowMs) return false; // süre henüz dolmadı
    if (nowMs - nextAt > RECENT_WINDOW_MS) return false; // çok önceden dolmuş, "eski/unutulmuş" — atlanır
    const lastN = c.last_notified_at ? new Date(c.last_notified_at).getTime() : 0;
    if (lastN >= nextAt) return false; // already notified this cycle
    const key = todayUtcKey();
    const used = Number(((c.daily_claims ?? {}) as any)[key] ?? 0);
    if (used >= 7) return false; // capped for the day
    return true;
  });
  if (!ready.length) return new Response(JSON.stringify({ sent: 0 }), { headers: CORS });

  // Send with concurrency cap of 10.
  let sent = 0;
  const okIds: string[] = [];
  const CHUNK = 10;
  for (let i = 0; i < ready.length; i += CHUNK) {
    const batch = ready.slice(i, i + CHUNK);
    const results = await Promise.all(batch.map(async (c: any) => {
      const name = PRODUCT_NAMES[c.product_id] || "Cloud";
      const ok = await tgSend(Number(c.user_tg_id), buildMessage(name));
      return { id: String(c.id), ok };
    }));
    for (const r of results) if (r.ok) { sent++; okIds.push(r.id); }
  }

  if (okIds.length) {
    await supabase.from("user_clouds").update({ last_notified_at: nowIso }).in("id", okIds);
  }
  return new Response(JSON.stringify({ sent }), { headers: { ...CORS, "content-type": "application/json" } });
});
