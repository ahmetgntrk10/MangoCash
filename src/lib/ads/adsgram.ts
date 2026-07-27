import type { AdResult } from "./types";

interface AdsgramController {
  show: () => Promise<{ done?: boolean; description?: string; state?: string; error?: boolean }>;
}
declare global {
  interface Window {
    Adsgram?: { init: (cfg: { blockId: string }) => AdsgramController };
  }
}

const cache = new Map<string, AdsgramController>();
function controller(blockId: string): AdsgramController | null {
  if (!window.Adsgram) return null;
  if (!cache.has(blockId)) {
    try { cache.set(blockId, window.Adsgram.init({ blockId })); }
    catch { return null; }
  }
  return cache.get(blockId)!;
}

/**
 * STRICT click-verified Rewarded ad.
 * - result.done must be true
 * - user must have left the mini-app (visibilitychange hidden) and stayed
 *   away at least `minOutsideSec` seconds — proof they actually engaged
 *   with the CTA destination, not just watched.
 */
export async function showAdsgramRewardedClickVerified(
  blockId: string,
  minOutsideSec = 10,
): Promise<AdResult> {
  const c = controller(blockId);
  if (!c) return { ok: false, reason: "no-fill", message: "SDK not loaded" };

  let leftAt = 0;
  let returnedAt = 0;
  const onVis = () => {
    if (document.hidden) { if (leftAt === 0) leftAt = Date.now(); }
    else if (leftAt > 0 && returnedAt === 0) returnedAt = Date.now();
  };
  document.addEventListener("visibilitychange", onVis);

  const start = Date.now();
  let done = false;
  try {
    const r = await c.show();
    done = !!r?.done;
    if (r?.error) {
      document.removeEventListener("visibilitychange", onVis);
      const m = (r.description || "").toLowerCase();
      if (m.includes("no ads") || m.includes("not found"))
        return { ok: false, reason: "no-fill", message: r.description };
      return { ok: false, reason: "error", message: r.description };
    }
  } catch (e: any) {
    document.removeEventListener("visibilitychange", onVis);
    const m = String(e?.description || e?.message || "").toLowerCase();
    if (m.includes("no ads") || m.includes("not found"))
      return { ok: false, reason: "no-fill", message: String(e?.description ?? "") };
    return { ok: false, reason: "closed-early" };
  }
  document.removeEventListener("visibilitychange", onVis);

  if (!done) return { ok: false, reason: "closed-early" };

  const effectiveReturn = returnedAt > 0 ? returnedAt : (leftAt > 0 ? Date.now() : 0);
  const outsideSec = effectiveReturn > leftAt && leftAt > 0 ? (effectiveReturn - leftAt) / 1000 : 0;
  const watchSec = (Date.now() - start) / 1000;
  // eslint-disable-next-line no-console
  console.debug(`[Adsgram strict R] watch=${watchSec.toFixed(2)}s outside=${outsideSec.toFixed(2)}s`);
  if (outsideSec < minOutsideSec) return { ok: false, reason: "closed-early", message: "AD_NOT_CLICKED" };
  return { ok: true };
}

/** STRICT click-verified Interstitial. */
export async function showAdsgramInterstitialClickVerified(
  blockId: string,
  minWatchSec = 10,
  minOutsideSec = 10,
): Promise<AdResult> {
  const c = controller(blockId);
  if (!c) return { ok: false, reason: "no-fill", message: "SDK not loaded" };

  let leftAt = 0, returnedAt = 0;
  const onVis = () => {
    if (document.hidden) { if (leftAt === 0) leftAt = Date.now(); }
    else if (leftAt > 0 && returnedAt === 0) returnedAt = Date.now();
  };
  document.addEventListener("visibilitychange", onVis);

  const start = Date.now();
  let done = false;
  try {
    const r = await c.show(); done = !!r?.done;
  } catch (e: any) {
    document.removeEventListener("visibilitychange", onVis);
    const m = String(e?.description || e?.message || "").toLowerCase();
    if (m.includes("no ads") || m.includes("not found"))
      return { ok: false, reason: "no-fill", message: String(e?.description ?? "") };
    return { ok: false, reason: "closed-early" };
  }
  document.removeEventListener("visibilitychange", onVis);
  if (!done) return { ok: false, reason: "closed-early" };

  const watchSec = (Date.now() - start) / 1000;
  const effectiveReturn = returnedAt > 0 ? returnedAt : (leftAt > 0 ? Date.now() : 0);
  const outsideSec = effectiveReturn > leftAt && leftAt > 0 ? (effectiveReturn - leftAt) / 1000 : 0;
  // eslint-disable-next-line no-console
  console.debug(`[Adsgram strict I] watch=${watchSec.toFixed(2)}s outside=${outsideSec.toFixed(2)}s`);
  if (watchSec < minWatchSec) return { ok: false, reason: "closed-early", message: "AD_NOT_CLICKED" };
  if (outsideSec < minOutsideSec) return { ok: false, reason: "closed-early", message: "AD_NOT_CLICKED" };
  return { ok: true };
}

/** Backwards-compatible aliases the rest of the app already imports. */
export const showAdsgramRewarded = (blockId: string) =>
  showAdsgramInterstitialSimple(blockId);
export const showAdsgramInterstitial = (blockId: string) =>
  showAdsgramInterstitialSimple(blockId);

/**
 * NON-strict interstitial. Only requires ad SDK to report `done=true`.
 * Used by Cloud Tap-Tap where user click is NOT required per spec.
 */
export async function showAdsgramInterstitialSimple(blockId: string): Promise<AdResult> {
  const c = controller(blockId);
  if (!c) return { ok: false, reason: "no-fill", message: "SDK not loaded" };
  try {
    const r = await c.show();
    if (r?.error) {
      const m = (r.description || "").toLowerCase();
      if (m.includes("no ads") || m.includes("not found"))
        return { ok: false, reason: "no-fill", message: r.description };
      return { ok: false, reason: "error", message: r.description };
    }
    if (!r?.done) return { ok: false, reason: "closed-early" };
    return { ok: true };
  } catch (e: any) {
    const m = String(e?.description || e?.message || "").toLowerCase();
    if (m.includes("no ads") || m.includes("not found"))
      return { ok: false, reason: "no-fill", message: String(e?.description ?? "") };
    return { ok: false, reason: "closed-early" };
  }
}
