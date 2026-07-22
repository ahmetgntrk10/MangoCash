import { showAdsgramRewarded } from "./adsgram";
import { ADSGRAM_REWARD_BLOCK } from "./index";
import { showRichAdsRandom } from "./richads";
import { showMonetagRewarded } from "./monetag";
import type { AdResult } from "./types";

/**
 * Rewarded ad chain with strict click verification (Adsgram first).
 * - Only falls through on `no-fill` (network had nothing to show right now).
 * - On `closed-early` / `error`, the chain stops so the caller can surface
 *   the AdClosedEarlyModal without burning a fallback network.
 */
export async function showRewardedChain(): Promise<AdResult> {
  let r: AdResult = await showAdsgramRewarded(ADSGRAM_REWARD_BLOCK);
  if (r.ok) return r;
  if (r.reason !== "no-fill") return r;
  r = await showRichAdsRandom();
  if (r.ok) return r;
  if (r.reason !== "no-fill") return r;
  return await showMonetagRewarded();
}