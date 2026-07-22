import { useEffect, useRef } from "react";
import { showAdsgramInterstitial, ADSGRAM_INT_AUTO } from ".";

/** Show Adsgram interstitial ONCE on mount (after ~2s). No periodic re-triggering. */
export function useAutoInterstitial() {
  const lastShown = useRef(0);
  useEffect(() => {
    let cancelled = false;

    async function trigger(reason: string) {
      if (cancelled) return;
      if (lastShown.current) return;
      lastShown.current = Date.now();
      try { await showAdsgramInterstitial(ADSGRAM_INT_AUTO); } catch { /* swallow */ }
      console.debug("[autoInterstitial]", reason);
    }

    const initialT = setTimeout(() => trigger("initial"), 2000);
    return () => { cancelled = true; clearTimeout(initialT); };
  }, []);
}
