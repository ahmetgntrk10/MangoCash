import type { AdResult } from "./types";

declare global { interface Window { show_11187835?: (opts?: any) => Promise<void>; } }

export async function showMonetagRewarded(): Promise<AdResult> {
  if (typeof window.show_11187835 !== "function") {
    return { ok: false, reason: "no-fill", message: "Monetag SDK not loaded" };
  }
  try {
    await window.show_11187835();
    return { ok: true };
  } catch (e: any) {
    const msg = String(e?.message || e || "").toLowerCase();
    if (msg.includes("no ads") || msg.includes("not found") || msg.includes("empty")) {
      return { ok: false, reason: "no-fill", message: String(e?.message ?? "") };
    }
    if (msg.includes("closed") || msg.includes("skip")) return { ok: false, reason: "closed-early" };
    return { ok: false, reason: "error", message: String(e?.message ?? e) };
  }
}
