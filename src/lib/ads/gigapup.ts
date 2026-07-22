import type { AdResult } from "./types";

/**
 * GigaPup (Gigapub) interstitial.
 * SDK is loaded in index.html: <script src="https://ad.gigapub.tech/script?id=7074"></script>
 * It exposes `window.showGiga()` returning a Promise.
 */
declare global {
  interface Window { showGiga?: () => Promise<unknown>; }
}

export async function showGigaPupAd(): Promise<AdResult> {
  if (typeof window.showGiga !== "function") {
    return { ok: false, reason: "no-fill", message: "GigaPup SDK not loaded" };
  }
  try {
    await window.showGiga();
    return { ok: true };
  } catch (e: any) {
    const m = String(e?.message || e || "").toLowerCase();
    if (m.includes("no ad") || m.includes("not found") || m.includes("empty")) {
      return { ok: false, reason: "no-fill", message: String(e?.message ?? "") };
    }
    if (m.includes("closed") || m.includes("skip")) return { ok: false, reason: "closed-early" };
    return { ok: false, reason: "error", message: String(e?.message ?? e) };
  }
}