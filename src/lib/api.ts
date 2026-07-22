import { getInitData } from "@/lib/telegram";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || "";
const ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) ||
  "";

export const apiConfigured = Boolean(SUPABASE_URL && ANON_KEY);

export async function apiCall<T = any>(
  action: string,
  body: Record<string, any> = {},
): Promise<T> {
  if (!apiConfigured) {
    throw new Error(
      "Backend not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.",
    );
  }
  const initData = getInitData();
  if (!initData) throw new Error("Open this app inside Telegram.");
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/api?action=${encodeURIComponent(action)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "x-telegram-init-data": initData,
    },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    throw new Error(data?.error ? `${action}: ${data.error}` : `${action} failed (${res.status})`);
  }
  return data as T;
}

/**
 * Request a single-use ad-credit ticket from the backend.
 * Returns null on failure so the caller can decide how to handle it.
 * The ticket is consumed by the matching credit endpoint (claim_daily, etc.)
 * and is rejected if used twice, expired, or for the wrong purpose.
 */
export async function requestAdTicket(
  purpose:
    | "daily" | "withdraw" | "promo" | "task_ads"
    | "mining_claim" | "mining_extend"
    | "market_ad" | "market_claim"
    | "taptap",
  network?: string,
): Promise<string | null> {
  try {
    const r = await apiCall<{ ticket: string }>("ad_ticket_issue", { purpose, network });
    return r?.ticket ?? null;
  } catch { return null; }
}
