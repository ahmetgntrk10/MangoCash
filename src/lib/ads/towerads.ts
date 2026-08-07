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
        apiKey: "ca5fb16ca37e0d66d722d449e6616e04",
        placementId: "plc_ca5008e82312f4ef",
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
