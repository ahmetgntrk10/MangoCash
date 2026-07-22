import type { AdResult } from "./types";

declare global {
  interface Window {
    TowerAds?: new (cfg: {
      apiKey: string;
      placementId: string;
      onRewardEarned?: (reward: any) => void;
      onError?: (error: any) => void;
    }) => { loadAndShow: () => Promise<void> };
  }
}

export async function showTowerAdsRewarded(): Promise<AdResult> {
  if (typeof window.TowerAds !== "function") {
    return { ok: false, reason: "no-fill", message: "TowerAds SDK not loaded" };
  }
  return new Promise((resolve) => {
    try {
      const ads = new window.TowerAds!({
        apiKey: "05a6d02f451150f753cffdce5e1e8f68",
        placementId: "plc_610b1e2a2747348a",
        onRewardEarned() {
          resolve({ ok: true });
        },
        onError(error: any) {
          const msg = String(error?.message || error || "").toLowerCase();
          if (msg.includes("no ad") || msg.includes("empty") || msg.includes("fill")) {
            resolve({ ok: false, reason: "no-fill", message: String(error?.message ?? "") });
          } else {
            resolve({ ok: false, reason: "error", message: String(error?.message ?? error) });
          }
        },
      });
      ads.loadAndShow().catch((e: any) => {
        resolve({ ok: false, reason: "no-fill", message: String(e?.message ?? e) });
      });
    } catch (e: any) {
      resolve({ ok: false, reason: "error", message: String(e?.message ?? e) });
    }
  });
}
