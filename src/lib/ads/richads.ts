import type { AdResult } from "./types";

declare global {
  interface Window {
    TelegramAdsController?: any;
    __richadsInited?: boolean;
  }
}

function ensureInit() {
  if (window.__richadsInited) return true;
  const Ctor = (window as any).TelegramAdsController;
  if (typeof Ctor !== "function") return false;
  try {
    window.TelegramAdsController = new Ctor();
    window.TelegramAdsController.initialize({ pubId: "1006008", appId: "8243" });
    window.__richadsInited = true;
    return true;
  } catch { return false; }
}

async function showNative(): Promise<AdResult> {
  if (!ensureInit()) return { ok: false, reason: "no-fill", message: "RichAds SDK not loaded" };
  try {
    await window.TelegramAdsController.triggerNativeNotification(true);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: "no-fill", message: String(e ?? "") };
  }
}

/**
 * Interstitial with strict click-engagement check. RichAds interstitials can be
 * dismissed without ever leaving the app — we treat the ad as "not engaged"
 * unless the WebApp's visibility/focus left for at least MIN_ENGAGEMENT_MS
 * (i.e. the user actually navigated to the advertiser destination).
 */
const MIN_ENGAGEMENT_MS = 12_000;
async function showInterstitial(): Promise<AdResult> {
  if (!ensureInit()) return { ok: false, reason: "no-fill", message: "RichAds SDK not loaded" };
  let hiddenAt = 0;
  let hiddenTotal = 0;
  const onVis = () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (hiddenAt) { hiddenTotal += Date.now() - hiddenAt; hiddenAt = 0; }
  };
  document.addEventListener("visibilitychange", onVis);
  try {
    await window.TelegramAdsController.triggerInterstitialBanner(true);
    // Wait up to 30 s for the user to come back from the ad destination.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (hiddenAt) {
        if (Date.now() - hiddenAt >= MIN_ENGAGEMENT_MS) break;
      } else if (hiddenTotal >= MIN_ENGAGEMENT_MS) {
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const total = hiddenTotal + (hiddenAt ? Date.now() - hiddenAt : 0);
    if (total < MIN_ENGAGEMENT_MS) {
      return { ok: false, reason: "closed-early", message: `engagement ${total}ms` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: "no-fill", message: String(e ?? "") };
  } finally {
    document.removeEventListener("visibilitychange", onVis);
  }
}

/**
 * Manual-only: triggered when the user taps the RichAds card. After load,
 * the SDK auto-redirects the user to the ad destination ~2s later because
 * we pass `true` for the auto-click flag.
 */
export async function showRichAdsRandom(): Promise<AdResult> {
  // small delay so the user perceives a deliberate "load" before being sent
  await new Promise((r) => setTimeout(r, 2000));
  if (Math.random() < 0.5) {
    const r = await showNative();
    if (r.ok || r.reason !== "no-fill") return r;
    return showInterstitial();
  }
  const r = await showInterstitial();
  if (r.ok || r.reason !== "no-fill") return r;
  return showNative();
}
