// CloudEarn FaucetPay payout worker (hardened 2026-07-07).
// - Insufficient FaucetPay balance: keep status='pending' for retry.
// - Invalid / unverified FaucetPay email: refund, status='rejected', DM user with reason.
// - Success: status='paid', post channel + DM user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FAUCETPAY_API_KEY = Deno.env.get("FAUCETPAY_API_KEY") ?? "";
const FAUCETPAY_CURRENCY = Deno.env.get("FAUCETPAY_CURRENCY") ?? "USDT";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const PAYMENT_CHANNEL_ID = Deno.env.get("PAYMENT_CHANNEL_ID") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
  status: s,
  headers: { ...cors, "content-type": "application/json" },
});

const md = (s: string) => String(s).replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, (m) => `\\${m}`);
const formatNum = (n: number) => Number.isFinite(n) ? n.toFixed(6).replace(/\.?0+$/, "") : "0";

function invalidRecipientMessage(message: string) {
  return /not associated|invalid address|no faucetpay account|does not belong|not registered|no account|not belong|not verified|unverified|email.*verify|verify.*email|address.*user|user.*address/i.test(String(message || ""));
}

function insufficientFundsMessage(message: string) {
  return /sufficient funds|not have sufficient|insufficient|balance.*low|low.*balance/i.test(String(message || ""));
}

async function sendUserDM(uid: number, text: string) {
  if (!BOT_TOKEN || !uid) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: uid, text, parse_mode: "MarkdownV2", disable_web_page_preview: true }),
  }).catch(() => {});
}

async function postSuccessToChannel(wd: any, payoutId: string) {
  if (!BOT_TOKEN || !PAYMENT_CHANNEL_ID) return;
  const net = formatNum(Number(wd.amount_net_usdt ?? wd.amount_usdt));
  const text = [
    "✅ *Withdrawal Approved\\!*",
    "",
    "Great news\\! Your withdrawal has been processed successfully\\.",
    "",
    `💰 *Amount:* ${md(net)} USDT`,
    "📝 *Method:* FaucetPay",
    `👤 *User:* \`${wd.user_tg_id}\``,
    `🧾 *Payout ID:* \`${md(payoutId)}\``,
    "",
    "Thank you for using CloudEarn \\! 🎉",
  ].join("\n");
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: PAYMENT_CHANNEL_ID, text, parse_mode: "MarkdownV2", disable_web_page_preview: true }),
  }).catch(() => {});
}

async function fpForm(endpoint: string, fields: Record<string, string>) {
  const form = new FormData();
  form.set("api_key", FAUCETPAY_API_KEY);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const r = await fetch(`https://faucetpay.io/api/v1/${endpoint}`, { method: "POST", body: form });
  let data: any = null;
  try { data = await r.json(); } catch { data = { message: await r.text().catch(() => "") }; }
  return { httpOk: r.ok, status: r.status, data };
}

async function getDashboardBalance(): Promise<number | null> {
  const { data } = await fpForm("checkbalance", { currency: FAUCETPAY_CURRENCY });
  if (Number(data?.status) !== 200) return null;
  const sat = Number(data?.balance ?? data?.payout_user_balance ?? 0);
  return Number.isFinite(sat) ? sat / 100_000_000 : null;
}

async function checkRecipient(addressOrEmail: string): Promise<{ ok: true } | { ok: false; reason: string } | null> {
  const { data } = await fpForm("getuserinfo", { address: addressOrEmail, currency: FAUCETPAY_CURRENCY });
  const status = Number(data?.status);
  if (status === 200) return { ok: true };
  const msg = String(data?.message || "");
  if (status === 456 || invalidRecipientMessage(msg)) {
    return { ok: false, reason: msg || "FaucetPay email is not registered or not verified" };
  }
  return null;
}

type SendResult =
  | { kind: "ok"; payoutId: string }
  | { kind: "insufficient_funds"; detail: string }
  | { kind: "invalid_address"; detail: string }
  | { kind: "transient"; detail: string };

async function sendFaucetPay(wd: any): Promise<SendResult> {
  if (!FAUCETPAY_API_KEY) return { kind: "transient", detail: "FAUCETPAY_API_KEY missing" };
  const net = Number(wd.amount_net_usdt ?? wd.amount_usdt);
  const units = Math.round(net * 100_000_000);
  if (!Number.isFinite(net) || units <= 0) return { kind: "transient", detail: "amount_zero" };

  const { data, httpOk, status } = await fpForm("send", {
    amount: String(units),
    to: String(wd.destination),
    currency: FAUCETPAY_CURRENCY,
  });
  if (httpOk && Number(data?.status) === 200) return { kind: "ok", payoutId: String(data?.payout_id ?? "sent") };
  const msg = String(data?.message || `FaucetPay error ${status}`);
  if (insufficientFundsMessage(msg)) return { kind: "insufficient_funds", detail: msg };
  if (invalidRecipientMessage(msg)) return { kind: "invalid_address", detail: msg };
  return { kind: "transient", detail: msg };
}

async function rejectAndRefund(supabase: any, wd: any, detail: string) {
  const reason = detail || "FaucetPay email is not registered or not verified";
  const { data: rows, error } = await supabase.from("withdrawals").update({
    status: "rejected",
    last_error: reason.slice(0, 200),
    processed_at: new Date().toISOString(),
    batch_id: null,
    queued_at: null,
  }).eq("id", wd.id).in("status", ["pending", "queued", "processing", "approved"]).select("*");
  if (error || !rows?.length) return false;
  const row = rows[0];
  const { data: u } = await supabase.from("users").select("balance_usdt").eq("tg_id", row.user_tg_id).maybeSingle();
  if (u) {
    await supabase.from("users").update({
      balance_usdt: Number(u.balance_usdt) + Number(row.amount_usdt),
    }).eq("tg_id", row.user_tg_id);
  }
  await sendUserDM(row.user_tg_id, [
    "❌ *Withdrawal Rejected*",
    "",
    "Your withdrawal request has been rejected and the balance has been refunded\\.",
    "",
    `💰 *Amount:* ${md(formatNum(Number(row.amount_usdt)))} USDT`,
    `🚨 *Reason:* ${md(reason)}`,
  ].join("\n"));
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "server_misconfigured" }, 500);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    let specificId: string | null = null;
    let batchId: string | null = null;
    try { const b = await req.json(); specificId = b?.id ?? null; batchId = b?.batch_id ?? null; } catch {}

    const dashBalance = await getDashboardBalance();
    let processed = 0, skippedBalance = 0, rejectedAddr = 0, transient = 0;

    for (let i = 0; i < 50; i++) {
      let row: any = null;
      if (specificId) {
        const { data } = await supabase.from("withdrawals").select("*").eq("id", specificId).eq("method", "faucetpay").maybeSingle();
        if (data && ["queued", "pending", "approved"].includes(String(data.status))) {
          await supabase.from("withdrawals").update({ status: "processing" }).eq("id", data.id);
          row = data;
        }
      } else {
        const { data: locked } = await supabase.rpc("faucetpay_lock_next_payout", { _batch_id: batchId });
        row = Array.isArray(locked) ? locked[0] : locked;
      }
      if (!row) break;

      const net = Number(row.amount_net_usdt ?? row.amount_usdt);
      if (dashBalance != null && net > dashBalance + 1e-8) {
        await supabase.from("withdrawals").update({ status: "pending", last_error: "insufficient_funds_dashboard", batch_id: null, queued_at: null }).eq("id", row.id);
        skippedBalance += 1;
        if (specificId) break; else continue;
      }

      const recipient = await checkRecipient(String(row.destination));
      if (recipient?.ok === false) {
        if (await rejectAndRefund(supabase, row, recipient.reason)) rejectedAddr += 1;
        if (specificId) break; else continue;
      }

      const result = await sendFaucetPay(row);
      if (result.kind === "ok") {
        await supabase.from("withdrawals").update({ status: "paid", tx_id: result.payoutId, processed_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
        await postSuccessToChannel(row, result.payoutId);
        await sendUserDM(row.user_tg_id, [
          "✅ *Withdrawal Approved\\!*", "",
          "Great news\\! Your withdrawal has been processed successfully\\.", "",
          `💰 *Amount:* ${md(formatNum(Number(row.amount_net_usdt ?? row.amount_usdt)))} USDT`,
          "📝 *Method:* FaucetPay",
          `🧾 *Payout ID:* \`${md(result.payoutId)}\``, "",
          "Thank you for using CloudEarn \\! 🎉",
        ].join("\n"));
        processed += 1;
      } else if (result.kind === "insufficient_funds") {
        await supabase.from("withdrawals").update({ status: "pending", last_error: "insufficient_funds_dashboard", batch_id: null, queued_at: null }).eq("id", row.id);
        skippedBalance += 1;
      } else if (result.kind === "invalid_address") {
        if (await rejectAndRefund(supabase, row, result.detail)) rejectedAddr += 1;
      } else {
        await supabase.from("withdrawals").update({ status: "pending", last_error: ("transient:" + result.detail).slice(0, 200), batch_id: null, queued_at: null }).eq("id", row.id);
        transient += 1;
      }
      if (specificId) break;
    }
    return json({ ok: true, processed, skippedBalance, rejectedAddr, transient, dashBalance });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});