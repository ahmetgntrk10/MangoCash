// MangoCash unified API Edge Function (v3 — 2026-06-26).
// Validates Telegram WebApp initData via HMAC, then performs all DB ops with service_role.
// Deploy: supabase functions deploy api --no-verify-jwt --project-ref <REF>
// Required secret: TELEGRAM_BOT_TOKEN
// Optional secrets: PAYMENT_CHANNEL_ID, FAUCETPAY_API_KEY, PROXYCHECK_API_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const PAYMENT_CHANNEL_ID = Deno.env.get("PAYMENT_CHANNEL_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BOT_USERNAME = (Deno.env.get("BOT_USERNAME") || "MangoCashBot").replace(/^@/, "");
const APP_START_LINK = Deno.env.get("APP_START_LINK")
  || `https://t.me/${BOT_USERNAME}/earn?startapp=5640381390`;

const REF_COMMISSION_PCT = 10;
const DAILY_REWARD = 80;
const BANNER_VIEW_WINDOW_MS = 12 * 60 * 60 * 1000;
const BANNER_DISMISS_HIDE_MS = 12 * 60 * 60 * 1000;
const PROXYCHECK_API_KEY = Deno.env.get("PROXYCHECK_API_KEY") ?? "";
const PROXYCHECK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // re-check at most weekly per IP
const BIO_REWARD = 60;
const MINING_RATE_PER_HOUR = 50;
const MINING_BASE_HOURS = 1;
const MINING_MAX_HOURS = 6;
const MINING_CHANNEL = (Deno.env.get("MINING_CHANNEL") || "mangocashnews").replace(/^@/, "");
const GATE_NEWS_CHANNEL = (Deno.env.get("GATE_NEWS_CHANNEL") || "mangocashnews").replace(/^@/, "");
const GATE_PAYMENT_CHANNEL = (Deno.env.get("GATE_PAYMENT_CHANNEL") || "mangocashpayments").replace(/^@/, "");
const REF_BONUS_SIGNUP = 200;
const REF_BONUS_DAY = 300;
const REF_BONUS_DAYS_REQUIRED = 10;
const REF_BONUS_DAILY_ADS_REQUIRED = 10;

// ─── Mango Market ────────────────────────────────────────────
// Server is source of truth for product prices/rates. Any drift with the
// client `MANGO_MARKET` array is corrected against this table.
const MARKET_PRODUCTS: Record<string, { cost: number; hourlyRate: number; adsRequired: number }> = {
  tiny:   { cost:  8000, hourlyRate: 115, adsRequired: 1 },
  river:  { cost: 11000, hourlyRate: 160, adsRequired: 2 },
  gold:   { cost: 14000, hourlyRate: 195, adsRequired: 2 },
  royal:  { cost: 16500, hourlyRate: 210, adsRequired: 3 },
  commit: { cost: 18500, hourlyRate: 235, adsRequired: 3 },
};
const MARKET_EXPIRY_MS = 30 * 24 * 3600 * 1000;

/**
 * Reasons that DO earn 15% commission for the referrer.
 * Explicitly excludes: daily, promo, market_claim, and social (channel) tasks.
 */
function commissionable(reason: string): boolean {
  if (!reason) return false;
  if (reason === "mining") return true;
  if (reason.startsWith("ad_")) return true;    // task-page ad views
  if (reason === "exclusive_task") return true; // paid exclusive tasks only
  return false;
}

// Per-network ad cooldown enforced server-side (ms).
const AD_COOLDOWN_MS: Record<string, number> = {
  adsgram: 10_000, monetag: 5_000, richads: 15_000, onclicka: 5_000, gigapup: 5_000, towerads: 5_000,
};
const AD_DAILY_LIMITS: Record<string, number> = {
  adsgram: 10, monetag: 8, richads: 8, onclicka: 8, gigapup: 5, towerads: 10,
};
const AD_REWARDS: Record<string, number> = {
  adsgram: 80, monetag: 25, richads: 25, onclicka: 20, gigapup: 20, towerads: 20,
};
const AD_TICKET_TTL_MS = 120_000;

// Exclusive task economics: invitee gets 45 % of the budget, platform keeps 55 %.
const EXCLUSIVE_USER_SHARE = 0.20;
const EXCLUSIVE_TASK_PRICE_USDT = 0.005;
// Anti-bot: tg_id threshold above which an account is considered "fresh".
const TG_ID_FRESH_THRESHOLD = Number(Deno.env.get("TG_ID_FRESH_THRESHOLD") || "8500000000");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-telegram-init-data",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

async function validateInitData(initData: string) {
  if (!initData || !BOT_TOKEN) return { valid: false as const };
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash"); if (!hash) return { valid: false as const };
    params.delete("hash");
    const dcs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`).join("\n");
    const enc = new TextEncoder();
    const sk = await crypto.subtle.importKey("raw", enc.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const secret = await crypto.subtle.sign("HMAC", sk, enc.encode(BOT_TOKEN));
    const key = await crypto.subtle.importKey("raw", secret,
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(dcs));
    const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hex !== hash) return { valid: false as const };
    const userStr = params.get("user");
    const user = userStr ? JSON.parse(userStr) : null;
    return { valid: true as const, userId: user?.id as number, user, startParam: params.get("start_param") };
  } catch { return { valid: false as const }; }
}

async function lookupCountry(ip: string | null): Promise<{ country: string | null; country_code: string | null }> {
  if (!ip) return { country: null, country_code: null };
  try {
    const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { country: null, country_code: null };
    const j = await r.json();
    return { country: j?.country_name ?? null, country_code: j?.country_code ?? null };
  } catch { return { country: null, country_code: null }; }
}

async function proxycheckIP(ip: string | null) {
  if (!ip || !PROXYCHECK_API_KEY) return null;
  try {
    const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${encodeURIComponent(PROXYCHECK_API_KEY)}&vpn=3&asn=1&risk=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) return null;
    const j = await r.json();
    const row = j?.[ip] || {};
    const proxyFlag = String(row?.proxy || "no").toLowerCase() === "yes";
    const vpnFlag = String(row?.type || "").toLowerCase().includes("vpn");
    const riskRaw = row?.risk;
    return {
      country_code: row?.isocode ?? null,
      country_name: row?.country ?? null,
      is_vpn: proxyFlag || vpnFlag,
      risk_score: typeof riskRaw === "number" ? riskRaw : (Number(riskRaw) || null),
    };
  } catch { return null; }
}

/**
 * Minimum seconds that must elapse between ad_ticket_issue and consume.
 * This is the server-side proof that an ad actually played long enough to be legit.
 * Frontend already enforces the same values; the server refuses shorter windows
 * so a hacked client can't skip the watch.
 */
const TICKET_MIN_WATCH_SEC: Record<string, number> = {
  daily:          10,
  withdraw:       10,
  promo:          10,
  task_ads:       10,
  mining_claim:   10,
  mining_extend:  10,
  market_ad:      10,
  market_claim:   10,
  taptap:         10, // interstitial non-click; still requires 10s minimum
};

/** Single-use ad ticket lookup+consume. Returns ok if ticket is valid & flips it consumed. */
async function consumeTicket(
  supabase: any, tgId: number, ticketId: string | undefined | null, purpose: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!ticketId) return { ok: false, reason: "no_ticket" };
  const { data: t } = await supabase.from("ad_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) return { ok: false, reason: "ticket_not_found" };
  if (t.user_tg_id !== tgId) return { ok: false, reason: "ticket_owner" };
  if (t.purpose !== purpose) return { ok: false, reason: "ticket_purpose" };
  if (t.consumed_at) return { ok: false, reason: "ticket_consumed" };
  if (new Date(t.expires_at).getTime() < Date.now()) return { ok: false, reason: "ticket_expired" };
  // Server-side minimum watch time — prevents "issue then instantly consume" abuse.
  const minSec = TICKET_MIN_WATCH_SEC[purpose] ?? 10;
  const ageMs = Date.now() - new Date(t.created_at).getTime();
  if (ageMs < minSec * 1000 - 250) {
    return { ok: false, reason: "ticket_too_early" };
  }
  // Atomic flip — guarded by consumed_at IS NULL so a race can't double-consume.
  const { data: upd, error } = await supabase.from("ad_tickets")
    .update({ consumed_at: new Date().toISOString(), consumed_ok: true })
    .eq("id", ticketId).is("consumed_at", null).select("id");
  if (error || !upd?.length) return { ok: false, reason: "ticket_race" };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "server_misconfigured" }, 500);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";
    let body: Record<string, any> = {};
    try { body = await req.json(); } catch {}

    // ───── Public Telegram webhook (no initData required) ─────
    if (action === "tg_webhook" || (body && (body.update_id || body.message || body.edited_message))) {
      try { await handleTelegramUpdate(supabase, body); } catch (e) { console.error("tg_webhook", e); }
      return json({ ok: true });
    }

    const initData = req.headers.get("x-telegram-init-data") || "";
    const v = await validateInitData(initData);
    if (!v.valid || !v.userId) return json({ error: "unauthorized" }, 401);

    const tgId = v.userId;
    const tgUser = v.user || {};

    // Block Telegram bot accounts at the door (validated by Telegram itself).
    if (tgUser && tgUser.is_bot === true) return json({ error: "bot_account" }, 403);

    const isAdmin = async (id: number) => {
      const { data } = await supabase.from("admins").select("tg_id").eq("tg_id", id).maybeSingle();
      return !!data;
    };
    const requireAdmin = async () => {
      if (!(await isAdmin(tgId))) throw new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    };
    const getUser = async () => {
      const { data } = await supabase.from("users").select("*").eq("tg_id", tgId).maybeSingle();
      return data;
    };

    switch (action) {

      // ───── AD TICKETS (single-use credit gate) ─────
      case "ad_ticket_issue": {
        const purpose = String(body.purpose || "");
        const network = body.network ? String(body.network) : null;
        if (!["daily","withdraw","promo","task_ads","mining_claim","mining_extend","market_ad","market_claim","taptap"].includes(purpose))
          return json({ error: "bad_purpose" }, 400);
        // Invalidate any prior unconsumed ticket for this (user, purpose) so a client
        // can't stockpile tickets and consume them all after a single 10s wait.
        await supabase.from("ad_tickets")
          .update({ consumed_at: new Date().toISOString(), consumed_ok: false })
          .eq("user_tg_id", tgId).eq("purpose", purpose).is("consumed_at", null);

        // Rate-limit: max 30 issues per minute per (user, purpose).
        const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
        const { count: recent } = await supabase.from("ad_tickets")
          .select("id", { count: "exact", head: true })
          .eq("user_tg_id", tgId).eq("purpose", purpose)
          .gte("created_at", oneMinAgo);
        if ((recent ?? 0) >= 30) return json({ error: "ticket_rate_limit" }, 429);

        const { data, error } = await supabase.from("ad_tickets").insert({
          user_tg_id: tgId, purpose, network,
          expires_at: new Date(Date.now() + AD_TICKET_TTL_MS).toISOString(),
        }).select("id").single();
        if (error) return json({ error: error.message }, 500);
        return json({ ticket: data.id });
      }

        case "gate_channel_check": {
        const kind = String(body.kind || "");
        const ch = kind === "news" ? GATE_NEWS_CHANNEL : kind === "payment" ? GATE_PAYMENT_CHANNEL : "";
        if (!ch) return json({ ok: false, reason: "bad_kind" });
        if (!BOT_TOKEN) return json({ ok: false, reason: "server" });
        try {
          const r = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent("@" + ch)}&user_id=${tgId}`,
          );
          const j = await r.json();
          const st = j?.result?.status;
          const ok = ["member", "administrator", "creator"].includes(st);
          return json({ ok });
        } catch { return json({ ok: false, reason: "network" }); }
      }
      case "gate_channel_verify": {
        if (!BOT_TOKEN) return json({ ok: false, reason: "server" });
        const checkOne = async (ch: string) => {
          try {
            const r = await fetch(
              `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent("@" + ch)}&user_id=${tgId}`,
            );
            const j = await r.json();
            return ["member", "administrator", "creator"].includes(j?.result?.status);
          } catch { return false; }
        };
        const [okNews, okPay] = await Promise.all([
          checkOne(GATE_NEWS_CHANNEL),
          checkOne(GATE_PAYMENT_CHANNEL),
        ]);
        if (!okNews || !okPay) return json({ ok: false, okNews, okPay });
        await supabase.from("users").update({ channels_verified: true }).eq("tg_id", tgId);
        return json({ ok: true });
      }
        
      // ───── INIT / AUTH ─────
      case "init": {
        const startParam = body.start_param ?? v.startParam ?? null;
        const refTgId = startParam && /^\d+$/.test(String(startParam)) ? Number(startParam) : null;
        const partnerCode = startParam && /^partner_[A-Za-z0-9_-]+$/.test(String(startParam))
          ? String(startParam).replace(/^partner_/, "")
          : null;
        const fpHash = typeof body.fp_hash === "string" ? body.fp_hash : null;
        const webglHash = typeof body.webgl_hash === "string" ? body.webgl_hash : null;
        const audioHash = typeof body.audio_hash === "string" ? body.audio_hash : null;
        const cTz = typeof body.tz === "string" ? body.tz : null;
        const cLang = typeof body.lang === "string" ? body.lang : null;
        const cPlatform = typeof body.platform === "string" ? body.platform : null;
        const existing = await getUser();
        const isNew = !existing;
        let duplicateDevice = false;

        // ─── Weighted multi-signal duplicate detection ───
        // Never blocks the OLDEST (primary) account, only later ones.
        // Whitelisted tg_ids always pass.
        const fwdEarly = req.headers.get("x-forwarded-for") || "";
        const ipEarly = (fwdEarly.split(",")[0] || "").trim()
          || req.headers.get("cf-connecting-ip") || null;
        const ipSubnet = ipEarly && /^\d+\.\d+\.\d+\.\d+$/.test(ipEarly)
          ? ipEarly.split(".").slice(0, 3).join(".") + ".0/24"
          : null;
        {
          const { data: wl } = await supabase
            .from("auth_whitelist").select("tg_id").eq("tg_id", tgId).maybeSingle();
          if (!wl) {
            // Gather every candidate row that shares at least one signal.
            const seen = new Map<number, {
              tg_id: number; fp_hash: string|null; webgl_hash: string|null; audio_hash: string|null;
              tz: string|null; lang: string|null; platform: string|null; ip: string|null; ip_subnet24: string|null;
            }>();
            const push = (rows: any[] | null) => {
              for (const r of rows ?? []) {
                const id = Number(r.tg_id);
                if (!id || id === tgId) continue;
                seen.set(id, r);
              }
            };
            const orQueries: Promise<any>[] = [];
            if (fpHash) orQueries.push(supabase.from("user_devices")
              .select("tg_id,fp_hash,webgl_hash,audio_hash,tz,lang,platform,ip,ip_subnet24")
              .eq("fp_hash", fpHash).neq("tg_id", tgId).limit(20));
            if (webglHash) orQueries.push(supabase.from("user_devices")
              .select("tg_id,fp_hash,webgl_hash,audio_hash,tz,lang,platform,ip,ip_subnet24")
              .eq("webgl_hash", webglHash).neq("tg_id", tgId).limit(20));
            if (audioHash) orQueries.push(supabase.from("user_devices")
              .select("tg_id,fp_hash,webgl_hash,audio_hash,tz,lang,platform,ip,ip_subnet24")
              .eq("audio_hash", audioHash).neq("tg_id", tgId).limit(20));
            if (ipEarly) orQueries.push(supabase.from("user_devices")
              .select("tg_id,fp_hash,webgl_hash,audio_hash,tz,lang,platform,ip,ip_subnet24")
              .eq("ip", ipEarly).neq("tg_id", tgId).limit(20));
            if (ipSubnet) orQueries.push(supabase.from("user_devices")
              .select("tg_id,fp_hash,webgl_hash,audio_hash,tz,lang,platform,ip,ip_subnet24")
              .eq("ip_subnet24", ipSubnet).neq("tg_id", tgId).limit(20));
            const results = await Promise.all(orQueries);
            for (const r of results) push(r?.data ?? []);

            // Score each candidate.
            let bestScore = 0; let bestOther: number | null = null;
            for (const [otherId, d] of seen) {
              let s = 0;
              if (fpHash && d.fp_hash && d.fp_hash === fpHash) s += 40;
              if (webglHash && d.webgl_hash && d.webgl_hash === webglHash) s += 15;
              if (audioHash && d.audio_hash && d.audio_hash === audioHash) s += 10;
              if (cTz && d.tz && cTz === d.tz && cLang && d.lang && cLang === d.lang
                  && cPlatform && d.platform && cPlatform === d.platform) s += 5;
              if (ipEarly && d.ip && String(d.ip) === ipEarly) s += 25;
              else if (ipSubnet && d.ip_subnet24 && String(d.ip_subnet24) === ipSubnet) s += 10;
              if (s > bestScore) { bestScore = s; bestOther = otherId; }
            }

            if (bestScore >= 40 && bestOther) {
              // Determine whether THIS account is the oldest of the matched set.
              // Only the oldest (primary) account is ever allowed through.
              const { data: otherRows } = await supabase.from("users")
                .select("tg_id,created_at").in("tg_id", Array.from(seen.keys()));
              const currentCreated = existing?.created_at
                ? new Date(existing.created_at as string).getTime()
                : Date.now();
              const isOldest = (otherRows ?? []).every(
                (r: any) => new Date(r.created_at).getTime() >= currentCreated,
              );
              if (bestScore >= 60 && !isOldest) {
                duplicateDevice = true;
                try {
                  await supabase.from("duplicate_suspects").insert({
                    tg_id: tgId, matched_tg_id: bestOther, score: bestScore,
                  });
                } catch { /* ignore */ }
                return json({ blocked: true, reason: "duplicate_device" });
              }
              // Suspicious (40-59): log but let through.
              try {
                await supabase.from("duplicate_suspects").insert({
                  tg_id: tgId, matched_tg_id: bestOther, score: bestScore,
                });
              } catch { /* ignore */ }
            }
          }
        }

        const fwd = req.headers.get("x-forwarded-for") || "";
        const ip = (fwd.split(",")[0] || "").trim() || req.headers.get("cf-connecting-ip") || null;
        let country = existing?.country ?? null;
        let country_code = existing?.country_code ?? null;
        let country_name: string | null = (existing as any)?.country_name ?? null;
        let is_vpn: boolean = !!(existing as any)?.is_vpn;
        let risk_score: number | null = (existing as any)?.risk_score ?? null;
        // Only call Proxycheck on first sign-up, after IP changes, or after weekly TTL.
        const lastPCAt = (existing as any)?.proxycheck_checked_at ? new Date((existing as any).proxycheck_checked_at).getTime() : 0;
        const lastPCIp = (existing as any)?.proxycheck_ip ?? null;
        const ipChanged = ip && lastPCIp && ip !== lastPCIp;
        const ttlExpired = Date.now() - lastPCAt > PROXYCHECK_TTL_MS;
        const shouldProxycheck = !lastPCAt || ipChanged || ttlExpired;
        let pcUsed = false;
        if (shouldProxycheck) {
          const pc = await proxycheckIP(ip);
          if (pc) {
            pcUsed = true;
            country_code = pc.country_code ?? country_code;
            country_name = pc.country_name ?? country_name;
            country = pc.country_name ?? country;
            is_vpn = pc.is_vpn;
            risk_score = pc.risk_score;
          } else if (!country_code) {
            const lk = await lookupCountry(ip);
            country = lk.country ?? country;
            country_code = lk.country_code ?? country_code;
            country_name = lk.country ?? country_name;
          }
        }

        const payload: any = {
          tg_id: tgId,
          username: tgUser.username ?? null,
          first_name: tgUser.first_name ?? null,
          last_name: tgUser.last_name ?? null,
          language_code: tgUser.language_code ?? "en",
          photo_url: tgUser.photo_url ?? null,
          ip_address: ip,
          country, country_code, country_name, is_vpn, risk_score,
          last_active_at: new Date().toISOString(),
        };
        if (pcUsed) {
          payload.proxycheck_checked_at = new Date().toISOString();
          payload.proxycheck_ip = ip;
        }
        if (isNew && refTgId && refTgId !== tgId && !partnerCode) payload.referred_by = refTgId;
        if (isNew && partnerCode) payload.partner_code = partnerCode;
        if (tgUser && typeof tgUser.is_premium === "boolean") payload.is_premium = !!tgUser.is_premium;

        const { error: upErr } = await supabase.from("users").upsert(payload, { onConflict: "tg_id" });
        if (upErr) throw upErr;

        // Banned users are blocked from the API surface.
        {
          const banned = (existing as any)?.status === "banned";
          if (banned) return json({ error: "banned" }, 403);
        }

        // Free 3-month Tiny Mango gift for every new user (if they don't already have one active).
        if (isNew) {
          try {
            const { data: hasTiny } = await supabase.from("user_clouds")
              .select("id").eq("user_tg_id", tgId).eq("product_id", "tiny")
              .gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
            if (!hasTiny) {
              const nowIso = new Date().toISOString();
              const giftExpiry = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
              await supabase.from("user_clouds").insert({
                user_tg_id: tgId, product_id: "tiny",
                purchased_at: nowIso, last_claim_at: nowIso,
                ads_progress: 0, expires_at: giftExpiry, is_gift: true,
              });
            }
          } catch { /* ignore */ }
        }

        if (fpHash) {
          try {
            await supabase.from("device_fingerprints").upsert(
              { tg_id: tgId, fp_hash: fpHash, user_agent: req.headers.get("user-agent") ?? null },
              { onConflict: "fp_hash,tg_id" },
            );
          } catch { /* ignore */ }
        }

        // Persist the full device-signal bundle for every init call.
        // Manual update-or-insert avoids relying on the previous expression-
        // based unique index (which silently rejected every upsert).
        try {
          let existingDev: { id: string } | null = null;
          {
            let q = supabase.from("user_devices").select("id").eq("tg_id", tgId).limit(1);
            q = fpHash ? q.eq("fp_hash", fpHash) : q.is("fp_hash", null);
            q = ip ? q.eq("ip", ip) : q.is("ip", null);
            const { data } = await q.maybeSingle();
            existingDev = data ?? null;
          }
          if (existingDev?.id) {
            await supabase.from("user_devices").update({
              webgl_hash: webglHash, audio_hash: audioHash,
              tz: cTz, lang: cLang, platform: cPlatform,
              ip_subnet24: ipSubnet,
              last_seen: new Date().toISOString(),
            }).eq("id", existingDev.id);
          } else {
            await supabase.from("user_devices").insert({
              tg_id: tgId,
              fp_hash: fpHash, webgl_hash: webglHash, audio_hash: audioHash,
              tz: cTz, lang: cLang, platform: cPlatform,
              ip: ip, ip_subnet24: ipSubnet,
              last_seen: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error("user_devices persist failed", e);
        }

        if (isNew && partnerCode) {
          try {
            await supabase.rpc("inc_partner_signup", { _code: partnerCode });
          } catch {
            // Fallback: best-effort manual increment if rpc missing.
            const { data: p } = await supabase.from("partner_links").select("signup_count").eq("code", partnerCode).maybeSingle();
            if (p) await supabase.from("partner_links").update({ signup_count: Number(p.signup_count ?? 0) + 1 }).eq("code", partnerCode);
          }
        }

        if (isNew && refTgId && refTgId !== tgId && !partnerCode) {
          // Duplicate-device invitees count as ineligible — no reward / no referrals row.
          if (duplicateDevice) {
            try {
              await supabase.from("referrals").upsert({
                referee_tg_id: tgId, referrer_tg_id: refTgId,
                ads_completed: 0, bonus_unlocked: false,
                commission_total_cloud: 0, is_eligible: false,
              }, { onConflict: "referee_tg_id" });
            } catch { /* ignore */ }
          } else {
            // Real (non-duplicate) invitee: count IMMEDIATELY on signup.
            // Bot / alt protection lives in the duplicate scorer above — a
            // blocked alt never reaches this branch, so counting here is safe.
            const isPremium = !!tgUser?.is_premium;
            const ageOk = isPremium || tgId < TG_ID_FRESH_THRESHOLD;
            await supabase.from("referrals").upsert({
              referee_tg_id: tgId, referrer_tg_id: refTgId,
              ads_completed: 0, bonus_unlocked: true, commission_total_cloud: 0,
              is_eligible: true, account_age_ok: ageOk, is_premium: isPremium,
              mining_claimed_at: null,
            }, { onConflict: "referee_tg_id" });
            try {
              const { data: refUser } = await supabase.from("users")
                .select("referral_count").eq("tg_id", refTgId).maybeSingle();
              if (refUser) {
                await supabase.from("users")
                  .update({ referral_count: Number(refUser.referral_count ?? 0) + 1 })
                  .eq("tg_id", refTgId);
              }
            } catch { /* ignore */ }

            // Ref-bonus event: instant +300 Mango to referrer for a REAL (non-alt) invitee.
            try {
              await supabase.from("referral_bonus_progress").upsert({
                referee_tg_id: tgId, referrer_tg_id: refTgId,
                signup_bonus_credited: true, signup_bonus_credited_at: new Date().toISOString(),
              }, { onConflict: "referee_tg_id" });
              const { data: refU } = await supabase.from("users")
                .select("balance_cloud,total_earned_cloud")
                .eq("tg_id", refTgId).maybeSingle();
              if (refU) {
                await supabase.from("users").update({
                  balance_cloud: Number(refU.balance_cloud) + REF_BONUS_SIGNUP,
                  total_earned_cloud: Number(refU.total_earned_cloud) + REF_BONUS_SIGNUP,
                }).eq("tg_id", refTgId);
              }
            } catch (e) { console.error("ref-bonus signup", e); }
          }
        }
        const user = await getUser();
        return json({ user, isAdmin: await isAdmin(tgId), tg_id: tgId });
      }

      case "get_user": {
        const user = await getUser();
        return json({ user, isAdmin: await isAdmin(tgId) });
      }

      // ───── DAILY (UTC 00:00 reset + mandatory ad ticket) ─────
      case "claim_daily": {
        const u = await getUser(); if (!u) return json({ error: "no_user" }, 400);
        // UTC day check
        if (u.last_daily_reward_at) {
          const last = new Date(u.last_daily_reward_at);
          const lastUtc = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
          const now = new Date();
          const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
          if (lastUtc >= todayUtc) return json({ error: "cooldown" }, 400);
        }
        const tc = await consumeTicket(supabase, tgId, body.ad_ticket_id, "daily");
        if (!tc.ok) return json({ error: "ad_required", reason: tc.reason }, 400);
        await supabase.from("users").update({
          balance_cloud: Number(u.balance_cloud) + DAILY_REWARD,
          total_earned_cloud: Number(u.total_earned_cloud) + DAILY_REWARD,
          last_daily_reward_at: new Date().toISOString(),
        }).eq("tg_id", tgId);
        await commissionToReferrer(supabase, u.referred_by, tgId, DAILY_REWARD, "daily");
        return json({ ok: true, reward: DAILY_REWARD });
      }

      // ───── ADS (server-side cooldown + idempotent reward) ─────
      case "ad_stats": {
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase.from("ad_views").select("network")
          .eq("user_tg_id", tgId).eq("day", today);
        const counts: Record<string, number> = { adsgram: 0, monetag: 0, richads: 0, onclicka: 0, gigapup: 0 };
        for (const r of data ?? []) counts[r.network] = (counts[r.network] ?? 0) + 1;

        // Compute current cooldown (last view per network) so the client cannot bypass via reload.
        const cooldowns: Record<string, number> = {};
        for (const net of Object.keys(AD_COOLDOWN_MS)) {
          const { data: last } = await supabase.from("ad_view_attempts")
            .select("created_at").eq("user_tg_id", tgId).eq("network", net).eq("status", "ok")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          const lastTs = last?.created_at ? new Date(last.created_at).getTime() : 0;
          const cd = AD_COOLDOWN_MS[net] ?? 5000;
          const nextAt = lastTs + cd;
          cooldowns[net] = nextAt > Date.now() ? nextAt : 0;
        }
        return json({ data: counts, cooldowns });
      }

      case "record_ad_view": {
        const network = String(body.network || "");
        if (!AD_REWARDS[network]) return json({ error: "bad_network" }, 400);
        const today = new Date().toISOString().slice(0, 10);

        // Server cooldown gate.
        const { data: lastOk } = await supabase.from("ad_view_attempts")
          .select("created_at").eq("user_tg_id", tgId).eq("network", network).eq("status", "ok")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (lastOk?.created_at) {
          const elapsed = Date.now() - new Date(lastOk.created_at).getTime();
          const cd = AD_COOLDOWN_MS[network] ?? 5000;
          if (elapsed < cd - 250) return json({ error: "cooldown", remaining_ms: cd - elapsed }, 429);
        }

        // Daily cap.
        const { count } = await supabase.from("ad_views").select("id", { count: "exact", head: true })
          .eq("user_tg_id", tgId).eq("day", today).eq("network", network);
        if ((count ?? 0) >= AD_DAILY_LIMITS[network]) return json({ error: "limit_reached" }, 400);

        // Require ad ticket (proves click verification happened).
        const tc = await consumeTicket(supabase, tgId, body.ad_ticket_id, "task_ads");
        if (!tc.ok) {
          // Log failed attempt so analytics still has it.
          await supabase.from("ad_view_attempts").insert({
            user_tg_id: tgId, network, status: "failed", reason: tc.reason,
          });
          return json({ error: "ad_required", reason: tc.reason }, 400);
        }

        const reward = AD_REWARDS[network];
        await supabase.from("ad_views").insert({
          user_tg_id: tgId, network, day: today, reward_cloud: reward, clicked: true,
        });
        await supabase.from("ad_view_attempts").insert({
          user_tg_id: tgId, network, status: "ok", reason: null,
        });
        const u = await getUser(); if (!u) return json({ error: "no_user" }, 400);
        await supabase.from("users").update({
          balance_cloud: Number(u.balance_cloud) + reward,
          total_earned_cloud: Number(u.total_earned_cloud) + reward,
        }).eq("tg_id", tgId);
        await onAdWatched(supabase, tgId);
        await commissionToReferrer(supabase, u.referred_by, tgId, reward, "ad_" + network);

        // Ref-bonus: Adsgram click-verified ads count toward the 10-day bonus pool (non-consecutive OK).
        if (network === "adsgram" && u.referred_by) {
          try {
            const todayKey = new Date().toISOString().slice(0, 10);
            const { data: rp } = await supabase.from("referral_bonus_progress")
              .select("*").eq("referee_tg_id", tgId).maybeSingle();
            if (rp && rp.referrer_tg_id && Number(rp.days_completed ?? 0) < REF_BONUS_DAYS_REQUIRED) {
              const activeDate = rp.current_day_date as string | null;
              let currentCount = Number(rp.current_day_ads ?? 0);
              if (activeDate !== todayKey) {
                // New UTC day: yesterday's incomplete count (below 10) is lost, no penalty beyond that.
                currentCount = 1;
              } else {
                currentCount += 1;
              }
              const patch: any = { current_day_date: todayKey, current_day_ads: currentCount };
              if (currentCount >= REF_BONUS_DAILY_ADS_REQUIRED) {
                patch.days_completed = Number(rp.days_completed ?? 0) + 1;
                patch.current_day_ads = 0;
                patch.current_day_date = null;
                const { data: refU } = await supabase.from("users")
                  .select("balance_cloud,total_earned_cloud")
                  .eq("tg_id", rp.referrer_tg_id).maybeSingle();
                if (refU) {
                  await supabase.from("users").update({
                    balance_cloud: Number(refU.balance_cloud) + REF_BONUS_DAY,
                    total_earned_cloud: Number(refU.total_earned_cloud) + REF_BONUS_DAY,
                  }).eq("tg_id", rp.referrer_tg_id);
                }
              }
              await supabase.from("referral_bonus_progress")
                .update(patch).eq("referee_tg_id", tgId);
            }
          } catch (e) { console.error("ref-bonus ad", e); }
        }

        return json({ ok: true, reward });
      }

      case "log_failed_ad": {
        // Best-effort logging only. Never grants reward.
        const network = String(body.network || "");
        if (!AD_REWARDS[network]) return json({ ok: true });
        await supabase.from("ad_view_attempts").insert({
          user_tg_id: tgId, network,
          status: body.reason === "no-fill" ? "no-fill" : "failed",
          reason: String(body.reason || "").slice(0, 64) || null,
        });
        return json({ ok: true });
      }

      // XOX has been retired — legacy client cleanup only. Any old client
      // still calling xox_close_session gets a harmless ack.
      case "xox_close_session": { return json({ ok: true }); }

      // ───── TASKS ─────
      case "list_tasks": {
        const category = body.category;
        // Sweep expired channel-bot tasks (best-effort, cheap).
        await sweepExpiredTasks(supabase).catch(() => {});
        let q = supabase.from("tasks").select("*").eq("is_active", true).order("created_at", { ascending: false });
        if (category) q = q.eq("category", category);
        const { data } = await q;
        return json({ data: data ?? [] });
      }
      case "list_exclusive": {
        await sweepExpiredTasks(supabase).catch(() => {});
        let q = supabase.from("tasks").select("*")
          .eq("category", "exclusive").eq("is_active", true).order("created_at", { ascending: false });
        if (body.mine) q = q.eq("created_by_tg_id", tgId);
        const { data } = await q;
        return json({ data: data ?? [] });
      }
      case "my_task_completions": {
        const { data } = await supabase.from("task_completions").select("task_id").eq("user_tg_id", tgId);
        return json({ data: (data ?? []).map((r: any) => r.task_id) });
      }
      case "start_task": {
        const taskId = body.task_id;
        if (!taskId) return json({ error: "missing_task" }, 400);
        try {
          await supabase.from("task_starts").upsert(
            { user_tg_id: tgId, task_id: taskId, started_at: new Date().toISOString() },
            { onConflict: "user_tg_id,task_id" },
          );
        } catch { /* ignore */ }
        return json({ ok: true });
      }
      case "verify_task": {
        const taskId = body.task_id;
        if (!taskId) return json({ ok: false, reason: "missing_task" });
        const { data: task } = await supabase.from("tasks").select("*")
          .eq("id", taskId).eq("is_active", true).maybeSingle();
        if (!task) return json({ ok: false, reason: "task_not_found" });

        const { data: existing } = await supabase.from("task_completions")
          .select("id").eq("task_id", taskId).eq("user_tg_id", tgId).maybeSingle();
        if (existing) return json({ ok: false, reason: "already" });

        if (task.max_completions != null && Number(task.completions_count ?? 0) >= Number(task.max_completions)) {
          return json({ ok: false, reason: "limit" });
        }

        const isChannel = task.task_type === "channel" || task.verification === "channel";
        if (isChannel) {
          const ch = String((task as any).channel_username || "").trim().replace(/^@/, "");
          if (!ch) return json({ ok: false, reason: "invalid_channel" });
          if (!BOT_TOKEN) return json({ ok: false, reason: "server" });
          const chatRes = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getChat?chat_id=${encodeURIComponent("@" + ch)}`,
          ).then((r) => r.json()).catch(() => null);
          if (!chatRes?.ok) {
            await supabase.from("tasks").update({ bot_check_status: "pending_bot" }).eq("id", task.id);
            return json({ ok: false, reason: "bot_not_in_channel" });
          }
          if (task.bot_check_status !== "ok") {
            await supabase.from("tasks").update({ bot_check_status: "ok" }).eq("id", task.id);
          }
          const memRes = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent("@" + ch)}&user_id=${tgId}`,
          ).then((r) => r.json()).catch(() => null);
          const status = memRes?.result?.status;
          if (!memRes?.ok) return json({ ok: false, reason: "bot_not_in_channel" });
          if (!["member", "administrator", "creator"].includes(status)) {
            return json({ ok: false, reason: "not_member" });
          }
        } else {
          // Link/website/bot/miniapp: timer check.
          const wait = Math.max(5, Number(task.timer_seconds) || 10);
          try {
            const { data: started } = await supabase.from("task_starts")
              .select("started_at").eq("user_tg_id", tgId).eq("task_id", taskId).maybeSingle();
            if (!started) return json({ ok: false, reason: "not_started" });
            const elapsed = (Date.now() - new Date(started.started_at).getTime()) / 1000;
            if (elapsed < wait - 1) return json({ ok: false, reason: "too_soon" });
          } catch { /* ignore */ }
        }

        const { error: tcErr } = await supabase.from("task_completions")
          .insert({ task_id: taskId, user_tg_id: tgId });
        if (tcErr) {
          if ((tcErr as any).code === "23505" || /duplicate/i.test(tcErr.message)) {
            return json({ ok: false, reason: "already" });
          }
          return json({ ok: false, reason: "task_error" });
        }
        const u = await getUser();
        if (!u) return json({ ok: false, reason: "server" });
        const reward = Number(task.reward_cloud ?? 0);
        const rewardUsdt = Number((task as any).payout_usdt ?? task.reward_usdt ?? 0);
        if (reward > 0) {
          await supabase.from("users").update({
            balance_cloud: Number(u.balance_cloud) + reward,
            total_earned_cloud: Number(u.total_earned_cloud) + reward,
          }).eq("tg_id", tgId);
        }
        if (rewardUsdt > 0) {
          await supabase.from("users").update({
            balance_usdt: Number(u.balance_usdt) + rewardUsdt,
            total_earned_usdt: Number((u as any).total_earned_usdt ?? 0) + rewardUsdt,
          }).eq("tg_id", tgId);
        }
        const newCount = Number(task.completions_count ?? 0) + 1;
        const limit = task.max_completions != null ? Number(task.max_completions) : null;
        const reachedLimit = limit != null && newCount >= limit;
        await supabase.from("tasks").update({
          completions_count: newCount,
          ...(reachedLimit ? { is_active: false } : {}),
        }).eq("id", taskId);
        {
          const cat = String(task.category || "");
          const reason = cat === "exclusive" ? "exclusive_task" : "social_task";
          await commissionToReferrer(supabase, u?.referred_by ?? null, tgId, Number(task.reward_cloud), reason);
        }
        return json({ ok: true, reward: task.reward_cloud, reward_usdt: rewardUsdt });
      }
      case "create_exclusive_task": {
        const needed = Math.max(100, Number(body.needed) || 100);
        const cost = +(needed * EXCLUSIVE_TASK_PRICE_USDT).toFixed(8);
        const payoutPer = +(EXCLUSIVE_TASK_PRICE_USDT * EXCLUSIVE_USER_SHARE).toFixed(8); // 0.0045
        const feePer = +(EXCLUSIVE_TASK_PRICE_USDT - payoutPer).toFixed(8);              // 0.0055
        const u = await getUser();
        if (!u || Number(u.balance_usdt) < cost) return json({ error: "insufficient_balance", cost }, 400);
        const taskType = body.task_type === "channel" ? "channel" : "link";
        const channelUsername = body.channel_username ? String(body.channel_username).trim().replace(/^@/, "") : null;
        let botCheckStatus = "unknown";
        let botCheckDeadline: string | null = null;
        if (taskType === "channel") {
          if (!channelUsername) return json({ error: "channel_required" }, 400);
          // 2-hour grace window before auto-deletion.
          botCheckDeadline = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
          if (BOT_TOKEN) {
            const r = await fetch(
              `https://api.telegram.org/bot${BOT_TOKEN}/getChat?chat_id=${encodeURIComponent("@" + channelUsername)}`,
            ).then((r) => r.json()).catch(() => null);
            botCheckStatus = r?.ok ? "ok" : "pending_bot";
          }
        }
        const { error } = await supabase.from("tasks").insert({
          category: "exclusive", title: body.title, description: body.description,
          link: body.link, reward_usdt: payoutPer, reward_cloud: 0,
          payout_usdt: payoutPer, platform_fee_usdt: feePer,
          verification: taskType === "channel" ? "channel" : "timer",
          timer_seconds: taskType === "channel" ? null : 10,
          max_completions: needed,
          is_exclusive: true, created_by_tg_id: tgId, paid_usdt: cost,
          task_type: taskType,
          channel_username: channelUsername,
          bot_check_status: botCheckStatus,
          bot_check_deadline: botCheckDeadline,
        });
        if (error) return json({ error: error.message }, 400);
        await supabase.from("users").update({ balance_usdt: Number(u.balance_usdt) - cost }).eq("tg_id", tgId);
        return json({ ok: true });
      }
      case "complete_task": {
        // Legacy direct-complete (kept for backwards compat; routes through verify_task path).
        return json({ error: "use_verify_task" }, 400);
      }

      // ───── PROFILE ─────
      case "update_profile": {
        const updates: any = {};
        if (body.binance_uid !== undefined) updates.binance_uid = body.binance_uid || null;
        if (body.ton_address !== undefined) {
          const v = String(body.ton_address || "").trim();
          if (v && (v.length < 40 || v.length > 100 || !/^[A-Za-z0-9_:\-]+$/.test(v))) {
            return json({ error: "invalid_ton_address" }, 400);
          }
          updates.ton_address = v || null;
        }
        if (body.faucetpay_address !== undefined) {
          updates.faucetpay_address = body.faucetpay_address || null;
        }
        if (typeof body.language_code === "string" && body.language_code.length <= 8) {
          updates.language_code = body.language_code;
        }
        const { error } = await supabase.from("users").update(updates).eq("tg_id", tgId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "verify_bio": {
        const u = await getUser(); if (!u) return json({ error: "no_user" }, 400);
        // Short-circuit: once the one-shot reward is paid, never hit t.me again.
        if ((u as any).bio_reward_claimed) {
          return json({ ok: true, verified: !!(u as any).bio_verified, reward: 0, locked: true });
        }
        const uname = (tgUser?.username || u.username || "").replace(/^@/, "");
        if (!uname) return json({ ok: true, verified: false });
        const botUname = (Deno.env.get("VITE_TG_BOT_USERNAME") || BOT_USERNAME).toLowerCase();
try {
  const r = await fetch(`https://t.me/${uname}`, { signal: AbortSignal.timeout(3500) });
  const html = (await r.text()).toLowerCase();
  const verified = html.includes(`t.me/${botUname}`) || html.includes(`@${botUname}`);
          let rewarded = 0;
          const updates: any = { bio_verified: verified };
          if (verified && !(u as any).bio_reward_claimed) {
            rewarded = BIO_REWARD;
            updates.bio_reward_claimed = true;
            updates.balance_cloud = Number(u.balance_cloud) + BIO_REWARD;
            updates.total_earned_cloud = Number(u.total_earned_cloud) + BIO_REWARD;
          }
          await supabase.from("users").update(updates).eq("tg_id", tgId);
          return json({ ok: true, verified, reward: rewarded });
        } catch { return json({ ok: true, verified: false }); }
      }

      case "convert_cloud": {
        const cloud = Number(body.cloud) || 0;
        const u = await getUser(); if (!u) return json({ error: "no_user" }, 400);
        if (cloud <= 0 || cloud > Number(u.balance_cloud)) return json({ error: "invalid_amount" }, 400);
        const rate = 0.00001; const usdt = cloud * rate;
        await supabase.from("conversions").insert({ user_tg_id: tgId, cloud_amount: cloud, usdt_amount: usdt, rate });
        await supabase.from("users").update({
          balance_cloud: Number(u.balance_cloud) - cloud,
          balance_usdt: Number(u.balance_usdt) + usdt,
        }).eq("tg_id", tgId);
        return json({ ok: true, usdt });
      }

      case "request_withdrawal": {
        const method = body.method;
        const amt = Number(body.amount) || 0;
        if (!["faucetpay", "binance", "toncoin"].includes(method)) return json({ error: "bad_method" }, 400);
        const u = await getUser(); if (!u) return json({ error: "no_user" }, 400);
        if (Number(u.referral_count) < 2) return json({ error: "need_refs" }, 400);
        if (amt <= 0 || amt > Number(u.balance_usdt)) return json({ error: "invalid_amount" }, 400);
        const MIN_BY_METHOD: Record<string, number> = { faucetpay: 0.05, binance: 0.05, toncoin: 0.05 };
        const minOk = amt >= (MIN_BY_METHOD[method] ?? 0.2);
        if (!minOk) return json({ error: "below_minimum" }, 400);
        // Mandatory ad ticket
        const tc = await consumeTicket(supabase, tgId, body.ad_ticket_id, "withdraw");
        if (!tc.ok) return json({ error: "ad_required", reason: tc.reason }, 400);
        const FEE_BY_METHOD: Record<string, number> = { faucetpay: 0, binance: 0.01, toncoin: 0.05 };
        const feeRate = FEE_BY_METHOD[method] ?? 0;
        const fee = +(amt * feeRate).toFixed(8);
        const net = +(amt - fee).toFixed(8);
        const dest =
          method === "faucetpay" ? u.faucetpay_address :
          method === "toncoin"   ? u.ton_address :
          u.binance_uid;
        if (!dest) return json({ error: "no_address" }, 400);
        const { error } = await supabase.from("withdrawals").insert({
          user_tg_id: tgId, method, amount_usdt: amt, amount_net_usdt: net, fee_usdt: fee,
          destination: dest, status: "pending",
        });
        if (error) return json({ error: error.message }, 400);
        await supabase.from("users").update({ balance_usdt: Number(u.balance_usdt) - amt }).eq("tg_id", tgId);
        const methodLabel = method === "faucetpay" ? "FaucetPay" : method === "toncoin" ? "Toncoin" : "Binance Pay";
        await sendUserDM(tgId,
          `📤 *Withdrawal Request Submitted*\n\nYour withdrawal is now pending review by our team\\.\n\n💰 *Amount:* ${md(formatNum(amt))} USDT\n📝 *Method:* ${md(methodLabel)}\n\nYou will receive a notification once it is processed\\. ✅`,
        ).catch(() => {});
        return json({ ok: true });
      }

      case "list_history": {
        const [w, c] = await Promise.all([
          supabase.from("withdrawals").select("*").eq("user_tg_id", tgId)
            .order("created_at", { ascending: false }).limit(20),
          supabase.from("conversions").select("*").eq("user_tg_id", tgId)
            .order("created_at", { ascending: false }).limit(20),
        ]);
        return json({ withdrawals: w.data ?? [], conversions: c.data ?? [] });
      }

      // ───── PROMO ─────
      case "promo_check": {
        const code = String(body.code || "").trim().toUpperCase();
        if (!code) return json({ ok: false, reason: "missing_code", conditions: [] });
        const { data: p } = await supabase.from("promo_codes").select("*").eq("code", code).maybeSingle();
        if (!p) return json({ ok: false, reason: "invalid", conditions: [] });
        if (!p.is_active) return json({ ok: false, reason: "inactive", conditions: [] });
        if (p.expires_at && new Date(p.expires_at) < new Date()) return json({ ok: false, reason: "expired", conditions: [] });
        if (p.max_completions != null && p.completions_count >= p.max_completions) return json({ ok: false, reason: "limit", conditions: [] });
        const { data: red } = await supabase.from("promo_redemptions").select("id").eq("promo_id", p.id).eq("user_tg_id", tgId).maybeSingle();
        if (red) return json({ ok: false, reason: "already", conditions: [] });
        const conditions = await evaluatePromoConditions(supabase, tgId, p.conditions ?? []);
        const allOk = conditions.every((c) => c.ok);
        if (!allOk) return json({ ok: false, reason: "conditions_unmet", conditions });
        return json({ ok: true, conditions });
      }
      case "redeem_promo": {
        const code = String(body.code || "").trim().toUpperCase();
        if (!code) return json({ error: "missing_code" }, 400);
        // Re-validate conditions atomically before consuming the ad ticket.
        const { data: pc } = await supabase.from("promo_codes").select("conditions").eq("code", code).maybeSingle();
        if (pc?.conditions?.length) {
          const evald = await evaluatePromoConditions(supabase, tgId, pc.conditions);
          if (!evald.every((c) => c.ok)) {
            return json({ error: "conditions_unmet", conditions: evald }, 400);
          }
        }
        const tc = await consumeTicket(supabase, tgId, body.ad_ticket_id, "promo");
        if (!tc.ok) return json({ error: "ad_required", reason: tc.reason }, 400);
        const { data, error } = await supabase.rpc("redeem_promo_code", { _code: code, _user_tg_id: tgId });
        if (error) return json({ error: error.message }, 400);
        const u = await getUser();
        await commissionToReferrer(supabase, u?.referred_by ?? null, tgId, Number(data) || 0, "promo");
        return json({ ok: true, reward: data });
      }

      case "list_referrals": {
        const { data } = await supabase.from("users")
          .select("tg_id,username,first_name,last_name,photo_url,ref_bonus_unlocked")
          .eq("referred_by", tgId)
          .order("created_at", { ascending: false }).limit(100);
        const ids = (data ?? []).map((u: any) => u.tg_id);
        const { data: progress } = await supabase.from("referrals")
          .select("referee_tg_id,ads_completed,bonus_unlocked,commission_total_cloud,is_eligible")
          .in("referee_tg_id", ids.length ? ids : [0]);
        const pmap = new Map<number, any>();
        for (const p of progress ?? []) pmap.set(Number(p.referee_tg_id), p);
        const merged = (data ?? [])
          .filter((u: any) => pmap.get(u.tg_id)?.is_eligible === true)
          .map((u: any) => ({ ...u, ...(pmap.get(u.tg_id) ?? {}) }));
        return json({ data: merged });
      }

      case "ref_bonus_progress": {
        const { data } = await supabase.from("referral_bonus_progress")
          .select("*").eq("referrer_tg_id", tgId)
          .order("created_at", { ascending: false });
        return json({ data: data ?? [] });
      }

      // ───── ADMIN ─────
      case "admin_list_users": {
        await requireAdmin();
        const term = String(body.q || "").trim();
        const page = Math.max(1, Number(body.page || 1));
        const pageSize = Math.min(500, Math.max(1, Number(body.page_size || 200)));
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        let qCount = supabase.from("users").select("*", { count: "exact", head: true });
        let q = supabase.from("users").select("*").order("created_at", { ascending: false }).range(from, to);
        if (term) {
          if (/^\d+$/.test(term)) {
            q = q.eq("tg_id", Number(term));
            qCount = qCount.eq("tg_id", Number(term));
          } else {
            q = q.ilike("username", `%${term}%`);
            qCount = qCount.ilike("username", `%${term}%`);
          }
        }
        // "Active today" = users seen since today's 00:00 UTC.
        const nowD = new Date();
        const startUtc = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate())).toISOString();
        const activeQ = supabase.from("users").select("tg_id", { count: "exact", head: true })
          .gte("last_active_at", startUtc);
        const [{ data }, { count }, { count: activeToday }] = await Promise.all([q, qCount, activeQ]);
        return json({ data: data ?? [], total: count ?? 0, active_today: activeToday ?? 0 });
      }
      case "admin_list_tasks": {
        await requireAdmin();
        const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
        return json({ data: data ?? [] });
      }
      case "admin_create_task": {
        await requireAdmin();
        const payload = body.payload || {};
        if (String(payload.category) === "exclusive") {
          const mc = Number(payload.max_completions);
          if (!Number.isFinite(mc) || mc < 100) {
            return json({ error: "min_100_participants" }, 400);
          }
          const usdt = Number(payload.reward_usdt ?? 0);
          if (!Number.isFinite(usdt) || usdt <= 0) {
            return json({ error: "reward_usdt_required" }, 400);
          }
          payload.reward_usdt = usdt;
          payload.payout_usdt = usdt;
          payload.reward_cloud = 0;
          payload.is_exclusive = true;
        }
        const { error } = await supabase.from("tasks").insert(payload);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "admin_toggle_task": {
        await requireAdmin();
        await supabase.from("tasks").update({ is_active: body.is_active }).eq("id", body.id);
        return json({ ok: true });
      }
      case "admin_delete_task": {
        await requireAdmin();
        await supabase.from("tasks").delete().eq("id", body.id);
        return json({ ok: true });
      }
      case "admin_pending_withdrawals": {
        await requireAdmin();
        const { data, count } = await supabase.from("withdrawals")
          .select("*, users:user_tg_id (username, first_name, country, ton_address, faucetpay_address, binance_uid, balance_cloud, balance_usdt)", { count: "exact" })
          .eq("method", body.method).in("status", ["pending", "queued", "processing"])
          .order("created_at", { ascending: true });
        return json({ data: data ?? [], total: count ?? 0 });
      }
      case "admin_withdrawal_history": {
        await requireAdmin();
        const page = Math.max(1, Number(body.page || 1));
        const pageSize = Math.min(500, Math.max(1, Number(body.page_size || 200)));
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const [{ data }, { count }] = await Promise.all([
          supabase.from("withdrawals")
            .select("*, users:user_tg_id (username)")
            .not("status", "in", "(pending,queued,processing)")
            .order("processed_at", { ascending: false })
            .range(from, to),
          supabase.from("withdrawals").select("id", { count: "exact", head: true })
            .not("status", "in", "(pending,queued,processing)"),
        ]);
        return json({ data: data ?? [], total: count ?? 0 });
      }
      case "admin_set_withdrawal_status": {
        await requireAdmin();
        const { id, status } = body;
        const tx = body.tx_hash ?? body.tx_id ?? null;
        if (!["approved", "paid", "rejected"].includes(String(status))) return json({ error: "bad_status" }, 400);

        if (status === "approved" && (await pendingMethodIs(supabase, id, "faucetpay"))) {
          // Idempotent guard: only flip pending → queued.
          const batchId = crypto.randomUUID();
          const { data: updRows, error: updErr } = await supabase.from("withdrawals").update({
            status: "queued",
            batch_id: batchId,
            queued_at: new Date().toISOString(),
            processed_by: tgId,
          }).eq("id", id).eq("status", "pending").select("*");
          if (updErr) return json({ error: updErr.message }, 400);
          if (!updRows?.length) return json({ error: "already_processed" }, 409);
          // Background invoke — non-blocking.
          try {
            // @ts-ignore Deno
            const wait = (globalThis as any).EdgeRuntime?.waitUntil ?? ((p: Promise<any>) => p);
            wait(fetch(`${SUPABASE_URL}/functions/v1/faucetpay-payouts`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "Authorization": `Bearer ${SERVICE_KEY}`,
              },
              body: JSON.stringify({ id, batch_id: batchId }),
            }).catch(() => {}));
          } catch { /* ignore */ }
          return json({ ok: true, queued: true });
        }

        // Toncoin approve requires TxId (manual payout).
        if (status === "approved") {
          const { data: wd0 } = await supabase.from("withdrawals").select("method, tx_id").eq("id", id).maybeSingle();
          if (wd0?.method === "toncoin") {
            const effectiveTx = tx || wd0.tx_id;
            if (!effectiveTx || String(effectiveTx).trim().length < 8) {
              return json({ error: "tx_id_required" }, 400);
            }
          }
        }

        // Idempotent update for manual reject / non-FaucetPay paths.
        // Avoid `.single()` because zero-row updates cause: Cannot coerce the result to a single JSON object.
        const { data: updRows, error: updErr } = await supabase.from("withdrawals").update({
          status,
          processed_at: new Date().toISOString(),
          processed_by: tgId,
          batch_id: null,
          queued_at: null,
          last_error: status === "rejected" ? String(body.reason || "Rejected by admin").slice(0, 200) : null,
          ...(tx ? { tx_id: tx } : {}),
        })
          .eq("id", id)
          .in("status", ["pending", "queued", "processing", "approved"])
          .select("*");
        if (updErr) return json({ error: updErr.message }, 400);
        if (!updRows?.length) return json({ error: "already_processed" }, 409);
        const upd = updRows[0];
        if (status === "rejected") {
          const { data: u } = await supabase.from("users").select("balance_usdt").eq("tg_id", upd.user_tg_id).maybeSingle();
          if (u) await supabase.from("users").update({
            balance_usdt: Number(u.balance_usdt) + Number(upd.amount_usdt),
          }).eq("tg_id", upd.user_tg_id);
          const reason = String(body.reason || "Rejected by admin");
          await sendUserDM(upd.user_tg_id,
            [
              "❌ *Withdrawal Rejected*",
              "",
              "Your withdrawal request has been rejected and the balance has been refunded\\.",
              "",
              `💰 *Amount:* ${md(formatNum(Number(upd.amount_usdt)))} USDT`,
              `🚨 *Reason:* ${md(reason)}`,
            ].join("\n"),
          ).catch(() => {});
          // NOTE: do NOT post to payments channel for rejected.
        }
        if (status === "approved" || status === "paid") {
          const fullItem = { ...upd, tx_id: tx ?? upd.tx_id };
          await Promise.all([
            announceToPaymentChannel(fullItem).catch(() => {}),
            notifyUserApproved(fullItem).catch(() => {}),
          ]);
        }
        return json({ ok: true });
      }
      case "admin_update_withdrawal_note": {
        await requireAdmin();
        const id = String(body.id || "");
        if (!id) return json({ error: "bad_id" }, 400);
        const patch: any = {};
        if (body.admin_note !== undefined) patch.admin_note = String(body.admin_note || "").slice(0, 500) || null;
        if (body.tx_id !== undefined) patch.tx_id = String(body.tx_id || "").trim() || null;
        if (!Object.keys(patch).length) return json({ ok: true });
        const { error } = await supabase.from("withdrawals").update(patch).eq("id", id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "admin_enqueue_faucetpay_payouts": {
        await requireAdmin();
        // SNAPSHOT: only payouts that are pending RIGHT NOW are part of this batch.
        const { data: pend } = await supabase.from("withdrawals").select("id")
          .eq("method", "faucetpay").eq("status", "pending");
        const ids = (pend ?? []).map((r: any) => r.id);
        if (!ids.length) return json({ enqueued: 0 });
        const batchId = crypto.randomUUID();
        await supabase.from("withdrawals").update({
          status: "queued", batch_id: batchId, queued_at: new Date().toISOString(),
        }).in("id", ids);
        try {
          // @ts-ignore Deno
          const wait = (globalThis as any).EdgeRuntime?.waitUntil ?? ((p: Promise<any>) => p);
          wait(fetch(`${SUPABASE_URL}/functions/v1/faucetpay-payouts`, {
            method: "POST",
            headers: { "content-type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({ batch_id: batchId }),
          }).catch(() => {}));
        } catch { /* ignore */ }
        return json({ enqueued: ids.length, batch_id: batchId });
      }
      case "admin_list_admins": {
        await requireAdmin();
        const { data } = await supabase.from("admins").select("*").order("created_at");
        return json({ data: data ?? [] });
      }
      case "admin_add_admin": {
        await requireAdmin();
        const { error } = await supabase.from("admins").insert({
          tg_id: Number(body.tg_id), username: body.username || null, added_by: tgId,
        });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "admin_remove_admin": {
        await requireAdmin();
        await supabase.from("admins").delete().eq("tg_id", Number(body.tg_id));
        return json({ ok: true });
      }
      case "admin_list_promos": {
        await requireAdmin();
        const { data } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
        return json({ data: data ?? [] });
      }
      case "admin_create_promo": {
        await requireAdmin();
        const payload = sanitizePromoPayload(body.payload);
        const { error } = await supabase.from("promo_codes").insert(payload);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "admin_toggle_promo": {
        await requireAdmin();
        await supabase.from("promo_codes").update({ is_active: body.is_active }).eq("id", body.id);
        return json({ ok: true });
      }
      case "admin_update_promo": {
        await requireAdmin();
        const payload = sanitizePromoPayload(body.payload);
        const { error } = await supabase.from("promo_codes").update(payload).eq("id", body.id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "admin_list_announcements": {
        await requireAdmin();
        const { data } = await supabase.from("announcements").select("*")
          .order("created_at", { ascending: false }).limit(30);
        return json({ data: data ?? [] });
      }
      case "admin_create_announcement": {
        await requireAdmin();
        const p = body.payload || {};
        const rawChat = p.source_chat ?? p.source_chat_id ?? null;
        let source_chat_id: number | null = null;
        let source_chat_text: string | null = null;
        if (typeof rawChat === "number") source_chat_id = rawChat;
        else if (typeof rawChat === "string" && rawChat.trim()) {
          const t = rawChat.trim();
          if (/^-?\d+$/.test(t)) source_chat_id = Number(t);
          else source_chat_text = t.startsWith("@") ? t : `@${t}`;
        }
        const { error } = await supabase.from("announcements").insert({
          mode: p.mode ?? "copy",
          source_chat_id,
          source_chat_text,
          source_message_id: p.source_message_id ?? null,
          text: p.text ?? null,
          photo_url: p.photo_url ?? null,
          buttons: p.buttons ?? null,
          batch_size: p.batch_size ?? 25,
          delay_seconds: p.delay_seconds ?? 1,
          created_by: tgId, status: "draft",
        });
        if (error) return json({ error: error.message }, 400);
        try {
          fetch(`${SUPABASE_URL}/functions/v1/announce-worker`, {
            method: "POST",
            headers: { "content-type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
            body: "{}",
          });
        } catch { /* ignore */ }
        return json({ ok: true });
      }

      // ───── PARTNERS ─────
      case "admin_list_partners": {
        await requireAdmin();
        const { data } = await supabase.from("partner_links").select("*").order("created_at", { ascending: false });
        return json({ data: data ?? [] });
      }
      case "admin_create_partner": {
        await requireAdmin();
        let code = String(body.code || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
        if (!code) code = "p_" + Math.random().toString(36).slice(2, 8);
        const label = String(body.label || code).trim();
        const { error } = await supabase.from("partner_links").insert({
          code, label, created_by: tgId, is_active: true,
        });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, code, link: `https://t.me/${BOT_USERNAME}/earn?startapp=partner_${code}` });
      }
      case "admin_partner_stats": {
        await requireAdmin();
        const code = String(body.code || "");
        const { data: link } = await supabase.from("partner_links").select("*").eq("code", code).maybeSingle();
        if (!link) return json({ error: "not_found" }, 404);
        // Users joined via this partner
        const { data: users, count: signups } = await supabase.from("users")
          .select("tg_id,created_at,last_active_at,total_earned_cloud,balance_usdt", { count: "exact" })
          .eq("partner_code", code);
        const ids = (users ?? []).map((u: any) => u.tg_id);
        const now = Date.now();
        const day24 = users?.filter((u: any) => u.last_active_at && now - new Date(u.last_active_at).getTime() < 24 * 3600 * 1000).length ?? 0;
        const day7 = users?.filter((u: any) => u.last_active_at && now - new Date(u.last_active_at).getTime() < 7 * 24 * 3600 * 1000).length ?? 0;
        // D1 / D7 retention: % of signups whose last_active_at >= created_at + 1d / 7d
        const calcRet = (days: number) => {
          if (!users?.length) return 0;
          const ok = users.filter((u: any) => {
            if (!u.last_active_at || !u.created_at) return false;
            return new Date(u.last_active_at).getTime() >= new Date(u.created_at).getTime() + days * 86400_000;
          }).length;
          return Math.round((ok / users.length) * 100);
        };
        const totalEarnedCloud = users?.reduce((a: number, u: any) => a + Number(u.total_earned_cloud || 0), 0) ?? 0;
        // Total paid USDT
        let totalPaidUsdt = 0;
        if (ids.length) {
          const { data: wd } = await supabase.from("withdrawals")
            .select("amount_net_usdt,amount_usdt,status,user_tg_id")
            .in("user_tg_id", ids).eq("status", "paid");
          totalPaidUsdt = (wd ?? []).reduce((a: number, r: any) => a + Number(r.amount_net_usdt ?? r.amount_usdt ?? 0), 0);
        }
        return json({
          link,
          stats: {
            clicks: Number(link.click_count ?? 0),
            signups: signups ?? 0,
            dau: day24,
            wau: day7,
            d1: calcRet(1),
            d7: calcRet(7),
            total_earned_cloud: totalEarnedCloud,
            total_paid_usdt: totalPaidUsdt,
          },
        });
      }
      case "admin_toggle_partner": {
        await requireAdmin();
        await supabase.from("partner_links").update({ is_active: !!body.is_active }).eq("code", body.code);
        return json({ ok: true });
      }

      // ───── BANNERS ─────
      case "current_banner": {
        const { data: banner } = await supabase.from("banners").select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (!banner) return json({ banner: null });
        if (banner.target_views != null && Number(banner.views_count) >= Number(banner.target_views)) {
          return json({ banner: null });
        }
        const { data: bd } = await supabase.from("banner_dismissals").select("dismissed_at")
          .eq("tg_id", tgId).eq("banner_id", banner.id).maybeSingle();
        if (bd?.dismissed_at && Date.now() - new Date(bd.dismissed_at).getTime() < BANNER_DISMISS_HIDE_MS) {
          return json({ banner: null });
        }
        return json({ banner: { id: banner.id, title: banner.title, description: banner.description, link: banner.link } });
      }
      case "banner_view": {
        const id = body.id;
        if (!id) return json({ ok: true });
        const { data: bd } = await supabase.from("banner_dismissals").select("last_seen_at")
          .eq("tg_id", tgId).eq("banner_id", id).maybeSingle();
        const last = bd?.last_seen_at ? new Date(bd.last_seen_at).getTime() : 0;
        if (Date.now() - last < BANNER_VIEW_WINDOW_MS) return json({ ok: true, counted: false });
        await supabase.from("banner_dismissals").upsert({
          tg_id: tgId, banner_id: id, last_seen_at: new Date().toISOString(),
        }, { onConflict: "tg_id,banner_id" });
        const { data: b } = await supabase.from("banners").select("views_count").eq("id", id).maybeSingle();
        await supabase.from("banners").update({ views_count: Number(b?.views_count ?? 0) + 1 }).eq("id", id);
        return json({ ok: true, counted: true });
      }
      case "banner_dismiss": {
        const id = body.id;
        if (!id) return json({ ok: true });
        await supabase.from("banner_dismissals").upsert({
          tg_id: tgId, banner_id: id, dismissed_at: new Date().toISOString(),
        }, { onConflict: "tg_id,banner_id" });
        return json({ ok: true });
      }
      case "admin_list_banners": {
        await requireAdmin();
        const { data } = await supabase.from("banners").select("*").order("created_at", { ascending: false });
        return json({ data: data ?? [] });
      }
      case "admin_create_banner": {
        await requireAdmin();
        const { error } = await supabase.from("banners").insert({
          title: body.title, description: body.description,
          link: body.link ?? null,
          target_views: body.target_views ?? null,
          is_active: true, created_by: tgId,
        });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "admin_toggle_banner": {
        await requireAdmin();
        await supabase.from("banners").update({ is_active: !!body.is_active }).eq("id", body.id);
        return json({ ok: true });
      }
      case "admin_delete_banner": {
        await requireAdmin();
        await supabase.from("banners").delete().eq("id", body.id);
        return json({ ok: true });
      }

      // ───── WHITELIST ─────
      case "admin_list_whitelist": {
        await requireAdmin();
        const { data } = await supabase.from("auth_whitelist").select("*").order("created_at", { ascending: false });
        return json({ data: data ?? [] });
      }
      case "admin_add_whitelist": {
        await requireAdmin();
        const id = Number(body.tg_id);
        if (!id) return json({ error: "bad_tg_id" }, 400);
        const { error } = await supabase.from("auth_whitelist").upsert({
          tg_id: id, note: body.note ?? null, created_by: tgId,
        }, { onConflict: "tg_id" });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "admin_remove_whitelist": {
        await requireAdmin();
        await supabase.from("auth_whitelist").delete().eq("tg_id", Number(body.tg_id));
        return json({ ok: true });
      }

      // ───── MINING ─────
      case "mining_status": {
        const u = await getUser(); if (!u) return json({ error: "no_user" }, 400);
        const { data: s } = await supabase.from("mining_sessions").select("*").eq("user_tg_id", tgId).maybeSingle();
        const { data: boost } = await supabase.from("mining_boost_users").select("tg_id").eq("tg_id", tgId).maybeSingle();
        const now = Date.now();
        let state: "idle" | "running" | "ready" = "idle";
        let session: any = null;
        if (s && !s.claimed) {
          const expiresAt = new Date(s.expires_at).getTime();
          state = now >= expiresAt ? "ready" : "running";
          session = {
            started_at: s.started_at,
            expires_at: s.expires_at,
            hours_total: s.hours_total,
            ratePerHour: MINING_RATE_PER_HOUR,
            reward: Number(s.hours_total) * MINING_RATE_PER_HOUR,
          };
        }
        return json({
          state, session,
          can_boost: !!boost,
          max_hours: MINING_MAX_HOURS,
          rate_per_hour: MINING_RATE_PER_HOUR,
        });
      }
      case "mining_check_channel": {
        if (!BOT_TOKEN) return json({ ok: false, reason: "server" });
        try {
          const memRes = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent("@" + MINING_CHANNEL)}&user_id=${tgId}`,
          ).then((r) => r.json()).catch(() => null);
          if (!memRes?.ok) return json({ ok: false, reason: "bot_not_in_channel" });
          const status = memRes?.result?.status;
          if (!["member", "administrator", "creator"].includes(status)) {
            return json({ ok: false, reason: "not_member" });
          }
          return json({ ok: true });
        } catch { return json({ ok: false, reason: "network" }); }
      }
      case "mining_start": {
        const u = await getUser(); if (!u) return json({ error: "no_user" }, 400);
        const { data: s } = await supabase.from("mining_sessions").select("*").eq("user_tg_id", tgId).maybeSingle();
        if (s && !s.claimed) return json({ error: "already_running" }, 400);
        // Channel verification (every start, no caching).
        if (!BOT_TOKEN) return json({ error: "server" }, 500);
        const memRes = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent("@" + MINING_CHANNEL)}&user_id=${tgId}`,
        ).then((r) => r.json()).catch(() => null);
        if (!memRes?.ok) return json({ error: "bot_not_in_channel" }, 400);
        const status = memRes?.result?.status;
        if (!["member", "administrator", "creator"].includes(status)) {
          return json({ error: "not_member" }, 400);
        }
        const now = new Date();
        const expires = new Date(now.getTime() + MINING_BASE_HOURS * 3600 * 1000);
        await supabase.from("mining_sessions").upsert({
          user_tg_id: tgId,
          started_at: now.toISOString(),
          expires_at: expires.toISOString(),
          hours_total: MINING_BASE_HOURS,
          claimed: false,
        }, { onConflict: "user_tg_id" });
        return json({ ok: true, expires_at: expires.toISOString(), hours_total: MINING_BASE_HOURS });
      }
      case "mining_extend": {
        // Boost-eligible users only; +1h per ad ticket, capped at MINING_MAX_HOURS.
        const { data: boost } = await supabase.from("mining_boost_users").select("tg_id").eq("tg_id", tgId).maybeSingle();
        if (!boost) return json({ error: "not_eligible" }, 403);
        const { data: s } = await supabase.from("mining_sessions").select("*").eq("user_tg_id", tgId).maybeSingle();
        if (!s || s.claimed) return json({ error: "no_session" }, 400);
        if (Number(s.hours_total) >= MINING_MAX_HOURS) return json({ error: "max_reached" }, 400);
        // Re-verify channel membership.
        if (!BOT_TOKEN) return json({ error: "server" }, 500);
        const memRes = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent("@" + MINING_CHANNEL)}&user_id=${tgId}`,
        ).then((r) => r.json()).catch(() => null);
        if (!memRes?.ok || !["member","administrator","creator"].includes(memRes?.result?.status)) {
          return json({ error: "not_member" }, 400);
        }
        const tc = await consumeTicket(supabase, tgId, body.ad_ticket_id, "mining_extend");
        if (!tc.ok) return json({ error: "ad_required", reason: tc.reason }, 400);
        const newHours = Math.min(MINING_MAX_HOURS, Number(s.hours_total) + 1);
        const expires = new Date(new Date(s.started_at).getTime() + newHours * 3600 * 1000);
        await supabase.from("mining_sessions").update({
          hours_total: newHours,
          expires_at: expires.toISOString(),
        }).eq("user_tg_id", tgId);
        return json({ ok: true, hours_total: newHours, expires_at: expires.toISOString() });
      }
      case "mining_claim": {
        const u = await getUser(); if (!u) return json({ error: "no_user" }, 400);
        const { data: s } = await supabase.from("mining_sessions").select("*").eq("user_tg_id", tgId).maybeSingle();
        if (!s || s.claimed) return json({ error: "no_session" }, 400);
        if (Date.now() < new Date(s.expires_at).getTime()) return json({ error: "not_ready" }, 400);
        // Re-verify channel membership (every claim).
        if (!BOT_TOKEN) return json({ error: "server" }, 500);
        const memRes = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent("@" + MINING_CHANNEL)}&user_id=${tgId}`,
        ).then((r) => r.json()).catch(() => null);
        if (!memRes?.ok || !["member","administrator","creator"].includes(memRes?.result?.status)) {
          return json({ error: "not_member" }, 400);
        }
        const tc = await consumeTicket(supabase, tgId, body.ad_ticket_id, "mining_claim");
        if (!tc.ok) return json({ error: "ad_required", reason: tc.reason }, 400);
        const reward = Number(s.hours_total) * MINING_RATE_PER_HOUR;
        await supabase.from("users").update({
          balance_cloud: Number(u.balance_cloud) + reward,
          total_earned_cloud: Number(u.total_earned_cloud) + reward,
        }).eq("tg_id", tgId);
        await supabase.from("mining_sessions").update({ claimed: true }).eq("user_tg_id", tgId);
        // Log claim for "today's mining claims" conditions.
        await supabase.from("mining_claims").insert({
          user_tg_id: tgId, reward_cloud: reward, hours_total: Number(s.hours_total),
        });
        await commissionToReferrer(supabase, u.referred_by, tgId, reward, "mining");
        // Referrals now count at signup (see init) — no promotion here.
        // Ref-bonus event reward now comes from signup + daily-ads (see init / record_ad_view).

        return json({ ok: true, reward });
      }

      case "admin_list_mining_boost": {
        await requireAdmin();
        const { data } = await supabase.from("mining_boost_users").select("*").order("created_at", { ascending: false });
        return json({ data: data ?? [] });
      }
      case "admin_add_mining_boost": {
        await requireAdmin();
        const id = Number(body.tg_id);
        if (!id) return json({ error: "bad_tg_id" }, 400);
        const { error } = await supabase.from("mining_boost_users").upsert({
          tg_id: id, note: body.note ?? null, created_by: tgId,
        }, { onConflict: "tg_id" });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "admin_remove_mining_boost": {
        await requireAdmin();
        await supabase.from("mining_boost_users").delete().eq("tg_id", Number(body.tg_id));
        return json({ ok: true });
      }

      // ───── MANGO MARKET ─────
      case "market_status": {
        // First, expire anything past its 30-day life.
        await supabase.from("user_clouds").delete()
          .eq("user_tg_id", tgId).lt("expires_at", new Date().toISOString());
        const { data } = await supabase.from("user_clouds").select("*")
          .eq("user_tg_id", tgId).order("purchased_at", { ascending: true });
        return json({ owned: data ?? [] });
      }
      case "market_buy": {
        const pid = String(body.product_id || "");
        const p = MARKET_PRODUCTS[pid];
        if (!p) return json({ error: "bad_product" }, 400);
        const u = await getUser(); if (!u) return json({ error: "no_user" }, 400);
        if (Number(u.balance_cloud) < p.cost) return json({ error: "insufficient" }, 400);
        // One-per-product rule: reject if user already owns an active row of this product.
        {
          const { data: existingCloud } = await supabase.from("user_clouds")
            .select("id").eq("user_tg_id", tgId).eq("product_id", pid)
            .gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
          if (existingCloud) return json({ error: "already_owned" }, 400);
        }
        const now = new Date();
        const expires = new Date(now.getTime() + MARKET_EXPIRY_MS);
        // One row per (user, product). Duplicate purchases are blocked above.
        const { error } = await supabase.from("user_clouds").insert({
          user_tg_id: tgId, product_id: pid,
          purchased_at: now.toISOString(),
          last_claim_at: now.toISOString(),
          ads_progress: 0,
          expires_at: expires.toISOString(),
        });
        if (error) return json({ error: error.message }, 400);
        await supabase.from("users").update({
          balance_cloud: Number(u.balance_cloud) - p.cost,
        }).eq("tg_id", tgId);
        return json({ ok: true });
      }
      case "market_watch_ad": {
        const id = String(body.cloud_id || "");
        if (!id) return json({ error: "missing_id" }, 400);
        const { data: c } = await supabase.from("user_clouds").select("*")
          .eq("id", id).eq("user_tg_id", tgId).maybeSingle();
        if (!c) return json({ error: "not_found" }, 404);
        if (new Date(c.expires_at).getTime() < Date.now()) return json({ error: "expired" }, 400);
        const p = MARKET_PRODUCTS[c.product_id];
        if (!p) return json({ error: "bad_product" }, 400);
        const hourReady = Date.now() >= new Date(c.last_claim_at).getTime() + 3600 * 1000;
        if (!hourReady) return json({ error: "not_ready" }, 400);
        if (Number(c.ads_progress ?? 0) >= p.adsRequired) return json({ error: "ads_done" }, 400);
        const tc = await consumeTicket(supabase, tgId, body.ad_ticket_id, "market_ad");
        if (!tc.ok) return json({ error: "ad_required", reason: tc.reason }, 400);
        const newProgress = Number(c.ads_progress ?? 0) + 1;
        await supabase.from("user_clouds").update({ ads_progress: newProgress }).eq("id", id);
        return json({ ok: true, ads_progress: newProgress });
      }
      case "market_claim": {
        const id = String(body.cloud_id || "");
        if (!id) return json({ error: "missing_id" }, 400);
        const { data: c } = await supabase.from("user_clouds").select("*")
          .eq("id", id).eq("user_tg_id", tgId).maybeSingle();
        if (!c) return json({ error: "not_found" }, 404);
        if (new Date(c.expires_at).getTime() < Date.now()) return json({ error: "expired" }, 400);
        const p = MARKET_PRODUCTS[c.product_id];
        if (!p) return json({ error: "bad_product" }, 400);
        const hourReady = Date.now() >= new Date(c.last_claim_at).getTime() + 3600 * 1000;
        if (!hourReady) return json({ error: "not_ready" }, 400);
        if (Number(c.ads_progress ?? 0) < p.adsRequired) return json({ error: "ads_missing" }, 400);
        const nowD2 = new Date();
        const todayKey = `${nowD2.getUTCFullYear()}-${String(nowD2.getUTCMonth()+1).padStart(2,"0")}-${String(nowD2.getUTCDate()).padStart(2,"0")}`;
        const dc = ((c as any).daily_claims ?? {}) as Record<string, number>;
        const usedToday = Number(dc[todayKey] ?? 0);
        if (usedToday >= 7) {
          const resetAt = new Date(Date.UTC(nowD2.getUTCFullYear(), nowD2.getUTCMonth(), nowD2.getUTCDate()+1)).toISOString();
          return json({ error: "daily_cap_reached", resets_at: resetAt }, 400);
        }
        const u = await getUser(); if (!u) return json({ error: "no_user" }, 400);
        const reward = p.hourlyRate;
        await supabase.from("users").update({
          balance_cloud: Number(u.balance_cloud) + reward,
          total_earned_cloud: Number(u.total_earned_cloud) + reward,
        }).eq("tg_id", tgId);
        await supabase.from("user_clouds").update({
          last_claim_at: new Date().toISOString(),
          ads_progress: 0,
          total_claimed: Number((c as any).total_claimed ?? 0) + reward,
          daily_claims: { [todayKey]: usedToday + 1 },
          last_notified_at: null,
        }).eq("id", id);
        // Market claim is EXCLUDED from referral commission on purpose.
        return json({ ok: true, reward, daily_claims_today: usedToday + 1, daily_cap: 7 });
      }

      // ───── ADMIN: User moderation ─────
      case "admin_set_ban": {
        await requireAdmin();
        const id = Number(body.tg_id);
        const banned = !!body.banned;
        if (!id) return json({ error: "bad_tg_id" }, 400);
        const { error } = await supabase.from("users")
          .update({ status: banned ? "banned" : "active" }).eq("tg_id", id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "admin_adjust_balance": {
        await requireAdmin();
        const id = Number(body.tg_id);
        const delta = Math.trunc(Number(body.delta));
        if (!id || !Number.isFinite(delta) || delta === 0) return json({ error: "bad_input" }, 400);
        const { data: u } = await supabase.from("users").select("balance_cloud,total_earned_cloud").eq("tg_id", id).maybeSingle();
        if (!u) return json({ error: "no_user" }, 404);
        const newBal = Math.max(0, Number(u.balance_cloud) + delta);
        const updates: any = { balance_cloud: newBal };
        if (delta > 0) updates.total_earned_cloud = Number(u.total_earned_cloud) + delta;
        const { error } = await supabase.from("users").update(updates).eq("tg_id", id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, balance_cloud: newBal });
      }

      case "set_notify_market": {
        const on = !!body.on;
        await supabase.from("users").update({ notify_market: on }).eq("tg_id", tgId);
        return json({ ok: true, notify_market: on });
      }

      // ───── MANGO TAP-TAP GAME ─────
      case "taptap_status": {
        const row = await getOrInitTaptap(supabase, tgId);
        return json({
          earned_today: row.earned,
          limit: 1000,
          locked: row.locked,
          next_lock_at: nextLockAt(row.earned),
          resets_at: nextUtcMidnightIso(),
        });
      }
      case "taptap_tap": {
        const row = await getOrInitTaptap(supabase, tgId);
        if (row.earned >= 1000) return json({ error: "daily_limit" }, 400);
        if (row.locked) return json({ error: "locked_watch_ad" }, 400);
        // Batch tap: istemci tapları biriktirip tek çağrıda gönderir.
        const requested = Math.max(1, Math.min(40, Number(body.taps ?? 1) || 1));
        const now = Date.now();
        const last = row.last_tap_at ? new Date(row.last_tap_at).getTime() : 0;
        if (now - last < 40) return json({ error: "too_fast" }, 429);

        // Tek batch içinde 100'lük reklam sınırını ve günlük limiti asla aşma.
        const toBoundary = 100 - (row.earned % 100);
        const toLimit = 1000 - row.earned;
        const gained = Math.max(0, Math.min(requested * 5, toBoundary, toLimit));
        if (gained <= 0) return json({ error: "locked_watch_ad" }, 400);
        const newEarned = Math.min(1000, row.earned + gained);
        const crossed = Math.floor(newEarned / 100) > Math.floor(row.earned / 100);
        const shouldLock = crossed && newEarned < 1000;
        await supabase.from("taptap_daily").update({
          earned: newEarned,
          locked: shouldLock,
          last_tap_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString(),
        }).eq("user_tg_id", tgId).eq("day", row.day);

        // Credit balance.
        const { data: u } = await supabase.from("users")
          .select("balance_cloud,total_earned_cloud").eq("tg_id", tgId).maybeSingle();
        if (u) {
          await supabase.from("users").update({
            balance_cloud: Number(u.balance_cloud) + gained,
            total_earned_cloud: Number(u.total_earned_cloud) + gained,
          }).eq("tg_id", tgId);
        }
        // NOTE: Tap-Tap intentionally NOT commissioned to referrer.
        return json({
          earned_today: newEarned,
          locked: shouldLock,
          next_lock_at: nextLockAt(newEarned),
        });
      }
      case "taptap_unlock": {
        // Consume ad ticket (any adsgram) then clear the lock and count ad.
        const tc = await consumeTicket(supabase, tgId, body.ad_ticket_id, "taptap");
        if (!tc.ok) return json({ error: tc.reason }, 400);
        const row = await getOrInitTaptap(supabase, tgId);
        await supabase.from("taptap_daily").update({
          locked: false,
          ads_watched: (row.ads_watched ?? 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq("user_tg_id", tgId).eq("day", row.day);
        return json({ ok: true });
      }

      default: return json({ error: "unknown_action", action }, 400);
    }
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

/* ───── helpers ───── */

async function pendingMethodIs(supabase: any, id: string, method: string) {
  const { data } = await supabase.from("withdrawals").select("method,status").eq("id", id).maybeSingle();
  return data?.method === method && data?.status === "pending";
}

/** Auto-disable channel tasks whose bot grace deadline has passed without success. */
async function sweepExpiredTasks(supabase: any) {
  await supabase.from("tasks").update({ is_active: false, bot_check_status: "failed" })
    .eq("task_type", "channel").neq("bot_check_status", "ok")
    .not("bot_check_deadline", "is", null)
    .lt("bot_check_deadline", new Date().toISOString())
    .eq("is_active", true);
}

async function commissionToReferrer(supabase: any, refTgId: number | null, refereeTgId: number, amount: number, reason: string) {
  if (!refTgId || amount <= 0) return;
  if (refTgId === refereeTgId) return;
  // Only whitelisted earning sources produce commission.
  if (!commissionable(reason)) return;
  // Referee must be eligible (passed anti-bot filter at signup).
  const { data: refRow } = await supabase.from("referrals")
    .select("is_eligible").eq("referee_tg_id", refereeTgId).maybeSingle();
  if (refRow && refRow.is_eligible === false) return;
  const commission = Math.floor(amount * REF_COMMISSION_PCT / 100);
  if (commission <= 0) return;
  const { data: r } = await supabase.from("users")
    .select("balance_cloud,ref_earnings_cloud,total_earned_cloud").eq("tg_id", refTgId).maybeSingle();
  if (!r) return;
  await supabase.from("users").update({
    balance_cloud: Number(r.balance_cloud) + commission,
    ref_earnings_cloud: Number(r.ref_earnings_cloud) + commission,
    total_earned_cloud: Number(r.total_earned_cloud ?? 0) + commission,
  }).eq("tg_id", refTgId);
  await supabase.from("referral_earnings").insert({
    referrer_tg_id: refTgId, referee_tg_id: refereeTgId,
    amount_cloud: commission, reason: `commission_${reason}`,
  });
  try {
    await supabase.rpc("inc_referral_commission", { _referee: refereeTgId, _amount: commission });
  } catch { /* ignore */ }
}

/** No-op kept for call-site compatibility. The 3-ad bonus was retired. */
async function onAdWatched(_supabase: any, _refereeTgId: number) { /* retired */ }

/* ───── Mango Tap-Tap helpers ───── */
function utcTodayIso(): string { return new Date().toISOString().slice(0, 10); }
function nextUtcMidnightIso(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}
function nextLockAt(earned: number): number {
  if (earned >= 1000) return 1000;
  return Math.min(1000, (Math.floor(earned / 100) + 1) * 100);
}
async function getOrInitTaptap(supabase: any, tgId: number) {
  const day = utcTodayIso();
  const { data: existing } = await supabase.from("taptap_daily")
    .select("*").eq("user_tg_id", tgId).eq("day", day).maybeSingle();
  if (existing) return existing;
  const insert = {
    user_tg_id: tgId, day,
    earned: 0, ads_watched: 0, locked: false,
    last_tap_at: null,
    updated_at: new Date().toISOString(),
  };
  const { data } = await supabase.from("taptap_daily").insert(insert).select("*").single();
  return data ?? insert;
}

async function announceToPaymentChannel(wd: any) {
  return _announceToPaymentChannel(wd);
}

// ───── Promo Code conditions ────────────────────────────────────────────
/**
 * Evaluate every condition attached to a promo code for the given user.
 * Returns an array describing whether each one is satisfied so the client
 * can render a checklist. Unknown condition types are surfaced as `ok:false`
 * so admin typos can't accidentally grant rewards.
 *
 * Supported types (admin-defined):
 *   { type: "ads_today",          network, min }
 *   { type: "mining_claim_today", min }
 *   { type: "channel_member",     chat }       // "@username" or "-100…"
 *   { type: "min_referrals",      min }
 *   { type: "min_balance_cloud",  min }
 *   { type: "bio_verified" }
 */
async function evaluatePromoConditions(
  supabase: any,
  tgId: number,
  raw: any,
): Promise<Array<{ type: string; label: string; ok: boolean; current: number | string; target: number | string }>> {
  const list: any[] = Array.isArray(raw) ? raw : [];
  if (!list.length) return [];
  const today = new Date().toISOString().slice(0, 10);
  const out: any[] = [];
  for (const c of list) {
    try {
      if (c?.type === "ads_today") {
        const net = String(c.network || "").toLowerCase();
        const min = Math.max(1, Number(c.min || 1));
        const { count } = await supabase.from("ad_views")
          .select("id", { count: "exact", head: true })
          .eq("user_tg_id", tgId).eq("day", today).eq("network", net);
        const cur = Number(count ?? 0);
        out.push({ type: c.type, label: `Watch ${min} ${net} ad(s) today`, ok: cur >= min, current: cur, target: min });
      } else if (c?.type === "mining_claim_today") {
        const min = Math.max(1, Number(c.min || 1));
        const start = new Date(); start.setUTCHours(0, 0, 0, 0);
        const { count } = await supabase.from("mining_claims")
          .select("id", { count: "exact", head: true })
          .eq("user_tg_id", tgId).gte("created_at", start.toISOString());
        const cur = Number(count ?? 0);
        out.push({ type: c.type, label: `Claim mining ${min}× today`, ok: cur >= min, current: cur, target: min });
      } else if (c?.type === "channel_member") {
        const chat = String(c.chat || "").trim();
        const ok = await isChatMember(supabase, tgId, chat);
        out.push({ type: c.type, label: `Join ${chat}`, ok, current: ok ? "joined" : "—", target: "joined" });
      } else if (c?.type === "min_referrals") {
        const min = Math.max(1, Number(c.min || 1));
        const { data: u } = await supabase.from("users").select("referral_count").eq("tg_id", tgId).maybeSingle();
        const cur = Number(u?.referral_count ?? 0);
        out.push({ type: c.type, label: `Have ${min} referrals`, ok: cur >= min, current: cur, target: min });
      } else if (c?.type === "min_balance_cloud") {
        const min = Math.max(1, Number(c.min || 1));
        const { data: u } = await supabase.from("users").select("balance_cloud").eq("tg_id", tgId).maybeSingle();
        const cur = Number(u?.balance_cloud ?? 0);
        out.push({ type: c.type, label: `Hold ${min} 🥭`, ok: cur >= min, current: cur, target: min });
      } else if (c?.type === "bio_verified") {
        const { data: u } = await supabase.from("users").select("bio_verified").eq("tg_id", tgId).maybeSingle();
        const ok = !!u?.bio_verified;
        out.push({ type: c.type, label: "Link-in-Bio verified", ok, current: ok ? "yes" : "no", target: "yes" });
      } else {
        out.push({ type: String(c?.type ?? "unknown"), label: "Unknown condition", ok: false, current: "—", target: "—" });
      }
    } catch (_e) {
      out.push({ type: String(c?.type ?? "unknown"), label: "Check failed", ok: false, current: "—", target: "—" });
    }
  }
  return out;
}

/** Cached getChatMember check (≤60 s) used by promo channel_member condition. */
async function isChatMember(supabase: any, tgId: number, chat: string): Promise<boolean> {
  if (!BOT_TOKEN || !chat) return false;
  const ref = chat.startsWith("@") || chat.startsWith("-") ? chat : "@" + chat;
  const { data: cached } = await supabase.from("tg_member_cache")
    .select("is_member,checked_at").eq("tg_id", tgId).eq("chat_ref", ref).maybeSingle();
  if (cached && Date.now() - new Date(cached.checked_at).getTime() < 60_000) {
    return !!cached.is_member;
  }
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(ref)}&user_id=${tgId}`,
      { signal: AbortSignal.timeout(4000) },
    ).then((x) => x.json()).catch(() => null);
    const status = r?.result?.status;
    const ok = !!r?.ok && ["member", "administrator", "creator"].includes(status);
    await supabase.from("tg_member_cache").upsert({
      tg_id: tgId, chat_ref: ref, is_member: ok, checked_at: new Date().toISOString(),
    }, { onConflict: "tg_id,chat_ref" });
    return ok;
  } catch { return false; }
}

/** Whitelist + normalise promo payload coming from the admin UI. */
function sanitizePromoPayload(raw: any): any {
  const out: any = {};
  if (raw?.code != null) out.code = String(raw.code).trim().toUpperCase();
  if (raw?.reward_amount != null) out.reward_amount = Number(raw.reward_amount);
  if (raw?.reward_type != null) out.reward_type = String(raw.reward_type);
  if ("max_completions" in (raw ?? {})) out.max_completions = raw.max_completions ? Number(raw.max_completions) : null;
  if ("expires_at" in (raw ?? {})) out.expires_at = raw.expires_at || null;
  if ("is_active" in (raw ?? {})) out.is_active = !!raw.is_active;
  if ("conditions" in (raw ?? {})) {
    const list = Array.isArray(raw.conditions) ? raw.conditions : [];
    out.conditions = list
      .map((c: any) => normalizePromoCondition(c))
      .filter(Boolean);
  }
  return out;
}

function normalizePromoCondition(c: any): any | null {
  if (!c || typeof c !== "object") return null;
  switch (c.type) {
    case "ads_today": {
      const network = String(c.network || "").toLowerCase();
      if (!["adsgram","monetag","richads","onclicka","gigapup"].includes(network)) return null;
      return { type: "ads_today", network, min: Math.max(1, Number(c.min || 1)) };
    }
    case "mining_claim_today":
      return { type: "mining_claim_today", min: Math.max(1, Number(c.min || 1)) };
    case "channel_member": {
      const chat = String(c.chat || "").trim();
      if (!chat) return null;
      return { type: "channel_member", chat };
    }
    case "min_referrals":
      return { type: "min_referrals", min: Math.max(1, Number(c.min || 1)) };
    case "min_balance_cloud":
      return { type: "min_balance_cloud", min: Math.max(1, Number(c.min || 1)) };
    case "bio_verified":
      return { type: "bio_verified" };
    default: return null;
  }
}

async function _announceToPaymentChannel(wd: any) {
  const channelId = Deno.env.get("PAYMENT_CHANNEL_ID") || PAYMENT_CHANNEL_ID;
  if (!channelId || !BOT_TOKEN) return;
  const method = wd.method === "faucetpay" ? "FaucetPay"
    : (wd.method === "toncoin" || wd.method === "ton") ? "Toncoin"
    : "Binance Pay";
  const net = formatNum(Number(wd.amount_net_usdt ?? wd.amount_usdt));
  const tx = wd.tx_id ?? "—";
  const lines = [
    "✅ *Withdrawal Approved\\!*",
    "",
    "Great news\\! Your withdrawal has been processed successfully\\.",
    "",
    `💰 *Amount:* ${md(net)} USDT`,
    `📝 *Method:* ${method}`,
    `👤 *User:* \`${wd.user_tg_id}\``,
  ];
  if (wd.method === "faucetpay") {
    lines.push(`🧾 *FaucetPay Payout ID:* \`${md(String(tx))}\``);
  } else if (wd.method === "toncoin" || wd.method === "ton") {
    lines.push(`🧾 *TxId:* \`${md(String(tx))}\``);
    if (tx && tx !== "—") lines.push(`[View On Tonviewer](https://tonviewer.com/transaction/${encodeURIComponent(String(tx))})`);
  }
  lines.push("", "Thank you for using MangoCash \\! 🎉");
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: channelId,
      text: lines.join("\n"),
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    }),
  }).catch(() => {});
}

async function notifyUserApproved(wd: any) {
  const method = wd.method === "faucetpay" ? "FaucetPay"
    : (wd.method === "toncoin" || wd.method === "ton") ? "Toncoin"
    : "Binance Pay";
  const net = formatNum(Number(wd.amount_net_usdt ?? wd.amount_usdt));
  const tx = wd.tx_id ?? "";
  const lines = [
    "✅ *Withdrawal Approved\\!*",
    "",
    "Great news\\! Your withdrawal has been processed successfully\\.",
    "",
    `💰 *Amount:* ${md(net)} USDT`,
    `📝 *Method:* ${method}`,
  ];
  const buttons: any[][] = [];
  if (wd.method === "faucetpay") {
    lines.push(`🧾 *FaucetPay Payout ID:* \`${md(String(tx || "—"))}\``);
  } else if (wd.method === "toncoin" || wd.method === "ton") {
    lines.push(`🧾 *TxId:* \`${md(String(tx || "—"))}\``);
    if (tx) buttons.push([{ text: "View On Tonviewer", url: `https://tonviewer.com/transaction/${encodeURIComponent(tx)}` }]);
  }
  lines.push("", "Thank you for using MangoCash \\! 🎉");
  await sendUserDM(wd.user_tg_id, lines.join("\n"), buttons.length ? { inline_keyboard: buttons } : undefined);
}

async function sendUserDM(tgUserId: number, text: string, reply_markup?: any) {
  if (!BOT_TOKEN || !tgUserId) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: tgUserId, text, parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
      ...(reply_markup ? { reply_markup } : {}),
    }),
  }).catch(() => {});
}

function formatNum(n: number): string {
  return Number.isFinite(n) ? n.toFixed(6).replace(/\.?0+$/, "") : "0";
}
function md(s: string): string {
  return String(s).replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, (m) => `\\${m}`);
}

/** Telegram bot webhook — handles /start with optional referral or partner parameter. */
async function handleTelegramUpdate(supabase: any, update: any) {
  const msg = update?.message;
  if (!msg || typeof msg.text !== "string") return;
  const text = msg.text.trim();
  const chatId = msg.chat?.id;
  const from = msg.from || {};
  if (!chatId || !from.id) return;
  if (!text.startsWith("/start")) return;

  const parts = text.split(/\s+/);
  const startParam = parts[1] || "";
  const refTgId = /^\d+$/.test(startParam) ? Number(startParam) : null;
  const partnerCode = /^partner_[A-Za-z0-9_-]+$/.test(startParam)
    ? startParam.replace(/^partner_/, "") : null;

  const { data: existing } = await supabase.from("users").select("tg_id,referred_by")
    .eq("tg_id", from.id).maybeSingle();
  const isNew = !existing;
  const payload: any = {
    tg_id: from.id,
    username: from.username ?? null,
    first_name: from.first_name ?? null,
    last_name: from.last_name ?? null,
    language_code: from.language_code ?? "en",
  };
  if (isNew && refTgId && refTgId !== from.id && !partnerCode) payload.referred_by = refTgId;
  if (isNew && partnerCode) payload.partner_code = partnerCode;
  await supabase.from("users").upsert(payload, { onConflict: "tg_id" });

  if (partnerCode) {
    try {
      const { data: p } = await supabase.from("partner_links").select("click_count,signup_count").eq("code", partnerCode).maybeSingle();
      if (p) {
        await supabase.from("partner_links").update({
          click_count: Number(p.click_count ?? 0) + 1,
          ...(isNew ? { signup_count: Number(p.signup_count ?? 0) + 1 } : {}),
        }).eq("code", partnerCode);
      }
    } catch { /* ignore */ }
  }

  if (isNew && refTgId && refTgId !== from.id && !partnerCode) {
    try {
      await supabase.from("referrals").upsert({
        referee_tg_id: from.id, referrer_tg_id: refTgId,
        ads_completed: 0, bonus_unlocked: false, commission_total_cloud: 0,
        is_eligible: true, bound_via: "bot_start",
      }, { onConflict: "referee_tg_id" });
    } catch { /* ignore */ }
  }

  const name = String(from.first_name || from.username || "friend");
  const lines = [
    `🎁 Welcome to MangoCash, ${name}`,
    "",
    "The Telegram Mini App where you can earn up to 0.1$ per day + more than 0.033$ per referral",
    "",
    "👇 Tap the button below to open the app and start earning!",
  ];
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: lines.join("\n"),
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: "🥭 Open MangoCash", url: APP_START_LINK }]] },
    }),
  }).catch(() => {});
}
