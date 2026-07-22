/**
 * App-wide tunables. Change values here to adjust limits without DB.
 * Server-side mirrors live in `app_config` table (see db migration).
 */
export const AD_NETWORKS = {
  adsgram:  { reward: 80, cooldownMs: 10_000, dailyLimit: 10, label: "Adsgram"  },
  monetag:  { reward: 25, cooldownMs:  5_000, dailyLimit: 8, label: "Monetag"  },
  richads:  { reward: 25, cooldownMs: 15_000, dailyLimit: 8, label: "RichAds"  },
  onclicka: { reward: 20, cooldownMs:  5_000, dailyLimit: 8, label: "OnClickA" },
  gigapup:  { reward: 20, cooldownMs:  5_000, dailyLimit: 5, label: "GigaPup"  },
  towerads:  { reward: 20, cooldownMs:  5_000, dailyLimit: 10,  label: "TowerAds"  },
} as const;
export type AdNetworkKey = keyof typeof AD_NETWORKS;

export const DAILY_REWARD_CLOUD = 80;
// Referral rules: no one-off signup reward. 15% lifetime commission
// (backend-computed) on invitee earnings except mining/market/daily/promo/social.
export const REF_COMMISSION_PCT = 15;
export const REF_MIN_FOR_WITHDRAW = 2;

/** Withdrawal fees and minimums. Edit these to tune. */
export const WITHDRAW = {
  faucetpay: { fee: 0,    min: 0.05, label: "FaucetPay" },
  binance: { fee: 0.01, min: 0.05, label: "Binance Pay" },
  toncoin: { fee: 0.05, min: 0.05, label: "Gram (Ton)" },
} as const;

/** Mining (Earn) config — server is source of truth, mirrored client-side for UI. */
export const MINING = {
  ratePerHour: 50,
  baseHours: 1,
  maxHours: 6,
  channel: "cloudearnnews",
} as const;

/** One-time bio verification reward. */
export const BIO_REWARD_CLOUD = 60;

export const PROMO_AD_BLOCK_INTERSTITIAL = (import.meta.env.VITE_ADSGRM_INT_FORCE as string) || "int-35932";

/** Cloud Market ad block IDs (Adsgram). Reward or Interstitial chosen at random. */
export const MARKET_ADSGRAM_REWARD  = (import.meta.env.VITE_ADSGRM_MARKET_REWARD as string) || "37132";
export const MARKET_ADSGRAM_INT     = (import.meta.env.VITE_ADSGRM_MARKET_INT as string) || "int-37133";

/** Each purchased Cloud lives for 30 days, then auto-expires. */
export const CLOUD_MARKET_EXPIRY_DAYS = 30;

/** Cloud Market products. Hourly rate credits after the required ads are watched. */
export type CloudMarketRarity = "common" | "rare" | "epic" | "legendary" | "mystic";
export interface CloudMarketProduct {
  id: string;
  name: string;
  rarity: CloudMarketRarity;
  cost: number;         // Cloud spent to purchase
  hourlyRate: number;   // Cloud awarded per claim
  adsRequired: number;  // Ads watched between hourly cycles
  tint: string;         // Tailwind gradient class for card
  ring: string;
  desc: string;
}
export const CLOUD_MARKET: CloudMarketProduct[] = [
  { id: "tiny",   name: "Tiny Cloud",   rarity: "common",    cost: 8000,  hourlyRate: 115, adsRequired: 1,
    tint: "from-sky-400/25 to-cyan-500/10",     ring: "ring-sky-400/40",
    desc: "A gentle drift of vapor. Great for new pilots — light, dependable, cheap to run." },
  { id: "river",  name: "River Cloud",  rarity: "rare",      cost: 11000, hourlyRate: 160, adsRequired: 2,
    tint: "from-blue-500/30 to-indigo-500/15",  ring: "ring-blue-400/50",
    desc: "Layered stratus streams that carry heavier payloads without breaking momentum." },
  { id: "gold",   name: "Gold Cloud",   rarity: "epic",      cost: 14000, hourlyRate: 195, adsRequired: 2,
    tint: "from-amber-400/30 to-orange-500/15", ring: "ring-amber-400/60",
    desc: "Sunlit cumulus with a golden edge. Doubles as a status symbol on the map." },
  { id: "royal",  name: "Royal Cloud",  rarity: "legendary", cost: 16500, hourlyRate: 210, adsRequired: 3,
    tint: "from-fuchsia-500/30 to-purple-600/15", ring: "ring-fuchsia-400/60",
    desc: "Storm-forged and crown-shaped. A collector's favorite with strong yields." },
  { id: "commit", name: "Commit Cloud", rarity: "mystic",    cost: 18500, hourlyRate: 235, adsRequired: 3,
    tint: "from-emerald-400/30 to-teal-500/15", ring: "ring-emerald-300/60",
    desc: "Pulsating with rare energy. Only the most committed miners keep one aloft." },
];
export const CLOUD_MARKET_BY_ID: Record<string, CloudMarketProduct> = Object.fromEntries(
  CLOUD_MARKET.map((p) => [p.id, p]),
);

/** Cloud Tap-Tap game — daily cap, per-tap reward, and ad gate every N cloud. */
export const TAPTAP = {
  PER_TAP: 5,
  DAILY_MAX: 1000,
  AD_EVERY: 100,
  INTERSTITIAL_BLOCK: (import.meta.env.VITE_ADSGRM_TAPTAP_INT as string) || "int-37334",
} as const;

export const CHANNELS = {
  official: "https://t.me/cloudearnnews",
  payments: "https://t.me/cloudearnpayment",
};
