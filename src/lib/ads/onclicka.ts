import type { AdResult } from "./types";

const ONCLICKA_ID = 6121650;

declare global {
  interface Window {
    initCdTma?: (cfg: { id: number }) => Promise<() => Promise<void>>;
    __onclickaShow?: () => Promise<void>;
  }
}

// SDK yüklenince show fonksiyonunu bir kere init et, cache'le
let initPromise: Promise<(() => Promise<void>) | null> | null = null;

function getShow(): Promise<(() => Promise<void>) | null> {
  // OnClickA artık pasif (auto-show) tag formatına geçti; initCdTma yok,
  // programatik show() sağlamıyor. Bu yüzden hep no-fill dönüyoruz.
  // Eski haline dönmek için bu satırı silip alttaki orijinal koda geç.
  return Promise.resolve(null);
  // ---- orijinal kod (revert için) ----
  if (initPromise) return initPromise;
  initPromise = new Promise((resolve) => {
    if (typeof window.initCdTma === "function") {
      window.initCdTma({ id: ONCLICKA_ID })
        .then((show) => { window.__onclickaShow = show; resolve(show); })
        .catch(() => resolve(null));
    } else {
      // SDK henüz yüklenmediyse 3 saniyeliğine bekle
      const timeout = setTimeout(() => resolve(null), 3000);
      const interval = setInterval(() => {
        if (typeof window.initCdTma === "function") {
          clearInterval(interval);
          clearTimeout(timeout);
          window.initCdTma({ id: ONCLICKA_ID })
            .then((show) => { window.__onclickaShow = show; resolve(show); })
            .catch(() => resolve(null));
        }
      }, 200);
    }
  });
  return initPromise;
}

export async function showOnclickaAd(): Promise<AdResult> {
  const show = await getShow();
  if (!show) {
    return { ok: false, reason: "no-fill", message: "OnClickA SDK not loaded" };
  }
  try {
    await show();
    return { ok: true };
  } catch (e: any) {
    const m = String(e?.message || e || "").toLowerCase();
    if (m.includes("no ad") || m.includes("not found") || m.includes("empty")) {
      return { ok: false, reason: "no-fill", message: String(e?.message ?? "") };
    }
    // OnClickA'da "closed-early" kavramı yok — hata = no-fill say
    return { ok: false, reason: "no-fill", message: String(e?.message ?? e) };
  }
}

/**
 * Click-verified OnClickA rewarded: user must leave the mini-app for at
 * least `minOutsideSec` seconds (proof they engaged with the CTA).
 */
export async function showOnclickaAdClickVerified(minOutsideSec = 6): Promise<AdResult> {
  const show = await getShow();
  if (!show) return { ok: false, reason: "no-fill", message: "OnClickA SDK not loaded" };
  let leftAt = 0, returnedAt = 0;
  const onVis = () => {
    if (document.hidden) { if (leftAt === 0) leftAt = Date.now(); }
    else if (leftAt > 0 && returnedAt === 0) returnedAt = Date.now();
  };
  document.addEventListener("visibilitychange", onVis);
  try {
    await show();
  } catch (e: any) {
    document.removeEventListener("visibilitychange", onVis);
    const m = String(e?.message || e || "").toLowerCase();
    if (m.includes("no ad") || m.includes("not found") || m.includes("empty")) {
      return { ok: false, reason: "no-fill", message: String(e?.message ?? "") };
    }
    return { ok: false, reason: "closed-early" };
  }
  document.removeEventListener("visibilitychange", onVis);
  const effectiveReturn = returnedAt > 0 ? returnedAt : (leftAt > 0 ? Date.now() : 0);
  const outsideSec = effectiveReturn > leftAt && leftAt > 0 ? (effectiveReturn - leftAt) / 1000 : 0;
  if (outsideSec < minOutsideSec) return { ok: false, reason: "closed-early", message: "AD_NOT_CLICKED" };
  return { ok: true };
}
