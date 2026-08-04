import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShoppingBag, Store, Gift, Loader2, Sparkles, X, PlayCircle, Clock, Timer,
} from "lucide-react";
import { apiCall, requestAdTicket } from "@/lib/api";
import {
  MANGO_MARKET, MANGO_MARKET_BY_ID, MangoMarketProduct, MangoMarketRarity,
  MARKET_ADSGRAM_INT,
} from "@/lib/config";
import { useUser } from "@/hooks/useUser";
import { haptic } from "@/lib/telegram";
import {
  showAdsgramInterstitialClickVerified,
} from "@/lib/ads/adsgram";
import { showOnclickaAd } from "@/lib/ads/onclicka";
import type { AdResult } from "@/lib/ads/types";
import { useAdGate } from "@/components/ads/AdGate";

type Owned = {
  id: string; product_id: string; last_claim_at: string; ads_progress: number;
  expires_at: string;
  daily_claims?: Record<string, number> | null;
};
type Status = { owned: Owned[] };

/**
 * Market ad chain: Adsgram Interstitial (click-verified strict) first.
 * On `no-fill` only, fall back to OnClickA (non-strict). Rewarded Adsgram
 * is intentionally NOT used in Mango Market.
 */
async function showMarketAd(): Promise<AdResult> {
  const first = await showAdsgramInterstitialClickVerified(MARKET_ADSGRAM_INT, 14.5, 2);
  if (first.ok) return first;
  if (first.reason !== "no-fill") return first; // closed-early / error → propagate
  return await showOnclickaAd();
}

const RARITY_LABEL: Record<MangoMarketRarity, string> = {
  common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", mystic: "Mystic",
};
const RARITY_TEXT: Record<MangoMarketRarity, string> = {
  common: "text-sky-300", rare: "text-blue-300", epic: "text-amber-300",
  legendary: "text-fuchsia-300", mystic: "text-emerald-300",
};

function ProductArt({ p, size = 96 }: { p: MangoMarketProduct; size?: number }) {
  // Inline SVG so product art ships in the bundle (no external assets).
  const colorTop =
    p.rarity === "common"    ? "#bef264" :
    p.rarity === "rare"      ? "#fde047" :
    p.rarity === "epic"      ? "#fb923c" :
    p.rarity === "legendary" ? "#f472b6" : "#6ee7b7";
  const colorBot =
    p.rarity === "common"    ? "#4d7c0f" :
    p.rarity === "rare"      ? "#ca8a04" :
    p.rarity === "epic"      ? "#c2410c" :
    p.rarity === "legendary" ? "#be123c" : "#0d9488";
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`g-${p.id}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={colorTop} />
          <stop offset="1" stopColor={colorBot} />
        </linearGradient>
        <radialGradient id={`glow-${p.id}`} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor={colorTop} stopOpacity="0.55" />
          <stop offset="1" stopColor={colorTop} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`blush-${p.id}`} cx="35%" cy="30%" r="40%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="48" cy="48" r="46" fill={`url(#glow-${p.id})`} />
      {/* Mango body */}
      <g transform="rotate(-10 48 48)">
        <path
          d="M48 12c-17 0-27 15-27 33 0 19 12 35 27 35s27-16 27-35c0-18-10-33-27-33z"
          fill={`url(#g-${p.id})`} stroke="#3f2d12" strokeOpacity="0.4" strokeWidth="1.5"
        />
        <path
          d="M48 12c-17 0-27 15-27 33 0 19 12 35 27 35s27-16 27-35c0-18-10-33-27-33z"
          fill={`url(#blush-${p.id})`}
        />
        {/* Stem */}
        <rect x="45" y="2" width="6" height="12" rx="2.5" fill="#5b3a1e" />
        {/* Leaf */}
        <path d="M51 6c7-5 15-3 17 5-7 3-15 1-17-5z" fill="#4ade80" />
        {/* Highlight streak */}
        <path d="M30 26c-4 8-5 20-1 32" stroke="#fff" strokeOpacity="0.25" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
      }

export default function MangoMarket({ tgId }: { tgId: number | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-3xl bg-gradient-card shadow-elegant ring-1 ring-primary-glow/15">
      <button
        onClick={() => { haptic("light"); setOpen((o) => !o); }}
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
      >
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-earn shadow-earn">
          <Store className="h-5 w-5 text-earn-foreground" />
        </div>
        <div className="flex-1">
          <div className="font-display text-base font-bold">Mango Market</div>
          <div className="text-[11px] text-muted-foreground">
            Buy Mangos that earn every hour. Watch ads to claim their yield.
          </div>
        </div>
        <div className={`text-primary-glow transition-transform ${open ? "rotate-180" : ""}`}>▾</div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/60 p-4">
              <MarketTabs tgId={tgId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MarketTabs({ tgId }: { tgId: number | null }) {
  const [tab, setTab] = useState<"market" | "mine">("market");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-1/60 p-1 ring-1 ring-border">
        <button
          onClick={() => setTab("market")}
          className={`rounded-xl py-1.5 text-xs font-semibold transition ${
            tab === "market" ? "bg-gradient-primary text-primary-foreground shadow-elegant" : "text-muted-foreground"
          }`}
        >
          <ShoppingBag className="mr-1 inline h-3.5 w-3.5" /> Mango Market
        </button>
        <button
          onClick={() => setTab("mine")}
          className={`rounded-xl py-1.5 text-xs font-semibold transition ${
            tab === "mine" ? "bg-gradient-primary text-primary-foreground shadow-elegant" : "text-muted-foreground"
          }`}
        >
          <span className="mr-1">🥭</span> My Mango
        </button>
      </div>
      {tab === "market" ? <MarketList tgId={tgId} /> : <MyMangos tgId={tgId} />}
    </div>
  );
}

function MarketList({ tgId }: { tgId: number | null }) {
  const { data: user } = useUser(tgId);
  const [detail, setDetail] = useState<MangoMarketProduct | null>(null);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: status } = useQuery({
    queryKey: ["market_status", tgId],
    enabled: !!tgId,
    queryFn: async () => apiCall<Status>("market_status"),
            refetchInterval: 60_000,
  });
  const ownedIds = useMemo(
    () => new Set((status?.owned ?? []).map((o) => o.product_id)),
    [status],
  );

  async function buy(p: MangoMarketProduct) {
    if (!user || busy) return;
    if (ownedIds.has(p.id)) { toast.error("You already own this Mango"); return; }
if ((user.balance_cloud ?? 0) < p.cost) { toast.error("Not enough 🥭"); return; }
    setBusy(p.id);
    try {
      const r = await apiCall<{ ok?: boolean; error?: string }>("market_buy", { product_id: p.id });
      if (r?.error) {
        toast.error(r.error === "already_owned" ? "You already own this Mango" : r.error)
        return;
      }
      haptic("success");
      toast.success(`Purchased ${p.name}!`);
      qc.invalidateQueries({ queryKey: ["market_status", tgId] });
      qc.invalidateQueries({ queryKey: ["user", tgId] });
      setDetail(null);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {MANGO_MARKET.map((p) => {
          const owned = ownedIds.has(p.id);
          return (
          <motion.button
            key={p.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => setDetail(p)}
            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${p.tint} p-3 text-left ring-1 ${p.ring}`}
          >
            <div className="flex items-start justify-between">
              <ProductArt p={p} size={64} />
            <div className="flex flex-col items-end gap-1">
              <span className={`rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${RARITY_TEXT[p.rarity]}`}>
                {RARITY_LABEL[p.rarity]}
              </span>
              {owned && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/40">
                  Owned
                </span>
              )}
            </div>
            </div>
            <div className="mt-2 font-display text-sm font-bold">{p.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px]">
              <span className="text-earn">+{p.hourlyRate}/h</span>
              <span className="text-muted-foreground">· {p.adsRequired} ad{p.adsRequired > 1 ? "s" : ""}</span>
            </div>
            <div className="mt-1 text-[11px] font-semibold text-primary-glow">-{p.cost} 🥭</div>
          </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {detail && (
          <motion.div
            key="modal"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end bg-black/60 p-3"
            onClick={() => setDetail(null)}
          >
            <motion.div
              initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
              onClick={(e) => e.stopPropagation()}
              className="mx-auto w-full max-w-md rounded-3xl bg-gradient-card p-5 shadow-elegant ring-1 ring-primary-glow/20"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ${detail.tint} ring-1 ${detail.ring}`}>
                    <ProductArt p={detail} size={54} />
                  </div>
                  <div>
                    <div className={`text-[10px] font-bold uppercase tracking-wider ${RARITY_TEXT[detail.rarity]}`}>
                      {RARITY_LABEL[detail.rarity]}
                    </div>
                    <div className="font-display text-lg font-bold">{detail.name}</div>
                  </div>
                </div>
                <button onClick={() => setDetail(null)} className="rounded-full bg-surface-1/60 p-1.5">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{detail.desc}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat label="Cost" value={`${detail.cost} 🥭`} />
                <Stat label="Yield/h" value={`+${detail.hourlyRate}`} tone="earn" />
                <Stat label="Ads / claim" value={`${detail.adsRequired}`} tone="primary" />
              </div>
              <button
                disabled={
                  busy === detail.id ||
                  ownedIds.has(detail.id) ||
                  (user?.balance_cloud ?? 0) < detail.cost
                }
                onClick={() => buy(detail)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-earn py-3 text-sm font-bold text-earn-foreground shadow-earn disabled:opacity-50"
              >
                {busy === detail.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy === detail.id
                  ? "Purchasing…"
                  : ownedIds.has(detail.id)
                    ? "Already owned"
                    : `Buy for ${detail.cost} 🥭`}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "earn" | "primary" }) {
  const cls = tone === "earn" ? "text-earn" : tone === "primary" ? "text-primary-glow" : "";
  return (
    <div className="rounded-xl border border-border bg-surface-1/50 p-2">
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function MyMangos({ tgId }: { tgId: number | null }) {
  const qc = useQueryClient();
  const { showClosedEarly } = useAdGate();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
    const { data, refetch } = useQuery({
    queryKey: ["market_status", tgId],
    enabled: !!tgId,
    queryFn: async () => apiCall<Status>("market_status"),
    staleTime: 5 * 60_000,
  });
  const owned = data?.owned ?? [];
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => {
    return owned.map((o) => {
      const p = MANGO_MARKET_BY_ID[o.product_id];
      if (!p) return null;
      const nextAt = new Date(o.last_claim_at).getTime() + 3600 * 1000;
      const hourReady = now >= nextAt;
      const adsDone = Math.min(o.ads_progress ?? 0, p.adsRequired);
      const expiresAt = o.expires_at ? new Date(o.expires_at).getTime() : 0;
      const d = new Date(now);
      const todayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
      const claimsToday = Number((o.daily_claims ?? {})[todayKey] ?? 0);
      const capReached = claimsToday >= 7;
      const ready = hourReady && adsDone >= p.adsRequired && !capReached;
      return { o, p, nextAt, hourReady, adsDone, ready, expiresAt, claimsToday, capReached };
    }).filter(Boolean) as { o: Owned; p: MangoMarketProduct; nextAt: number; hourReady: boolean; adsDone: number; ready: boolean; expiresAt: number; claimsToday: number; capReached: boolean }[];
  }, [owned, now]);

  const totals = useMemo(() => {
    const total = rows.length;
    const perHour = rows.reduce((a, r) => a + r.p.hourlyRate, 0);
    const pending = rows.filter((r) => r.ready).reduce((a, r) => a + r.p.hourlyRate, 0);
    const readyCount = rows.filter((r) => r.ready).length;
    return { total, perHour, pending, readyCount };
  }, [rows]);

  // Polling yerine: saatlik döngü dolunca tek re-sync.
  const syncedFor = useRef(0);
  useEffect(() => {
    if (rows.some((r) => !r.hourReady)) { syncedFor.current = 0; return; }
    if (!rows.length) return;
    const key = Math.max(...rows.map((r) => r.nextAt));
    if (syncedFor.current === key) return;
    syncedFor.current = key;
    refetch();
  }, [rows, refetch]);
  
  async function watchAd(row: (typeof rows)[number]) {
    if (busy) return;
    if (!row.hourReady) { toast.error("Wait for the hourly cycle to finish first."); return; }
    if (row.adsDone >= row.p.adsRequired) { toast.error("All ads watched. Tap Claim."); return; }
    setBusy(row.o.id + ":ad");
    try {
      const ticket = await requestAdTicket("market_ad");
      if (!ticket) { toast.error("Ad ticket failed"); return; }
      // Adsgram (rewarded or interstitial, random) → OnClickA fallback. Strict click.
      const ad = await showMarketAd();
      if (!ad.ok) {
        if (ad.reason === "no-fill") toast.error("No ad available. Try again.");
        else showClosedEarly();
        return;
      }
      const r = await apiCall<{ ok?: boolean; error?: string; ads_progress?: number }>("market_watch_ad", {
        cloud_id: row.o.id, ad_ticket_id: ticket,
      });
      if (r?.error) { toast.error(r.error); return; }
      haptic("light");
      qc.invalidateQueries({ queryKey: ["market_status", tgId] });
    } finally { setBusy(null); }
  }

  async function claim(row: (typeof rows)[number]) {
    if (busy || !row.ready) return;
    setBusy(row.o.id + ":claim");
    try {
      const r = await apiCall<{ ok?: boolean; error?: string; reward?: number; daily_claims_today?: number }>("market_claim", {
        cloud_id: row.o.id,
      });
      if (r?.error) { toast.error(r.error); return; }
      haptic("success");
      const done = r.daily_claims_today ?? (row.claimsToday + 1);
      toast.success(`+${r.reward ?? row.p.hourlyRate} 🥭  (${done}/7 today)`);
      qc.invalidateQueries({ queryKey: ["market_status", tgId] });
      qc.invalidateQueries({ queryKey: ["user", tgId] });
    } finally { setBusy(null); }
  }

  function fmt(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60), sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function fmtExpiry(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(s / 86400);
    if (days >= 2) return `${days}d left`;
    const h = Math.floor(s / 3600);
    if (h >= 2) return `${h}h left`;
    return `${Math.max(1, Math.floor(s / 60))}m left`;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-gradient-card p-4 shadow-elegant ring-1 ring-primary-glow/20">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Collections to be gathered</div>
            <div className="mt-1 font-display text-lg font-bold text-gradient-primary">My Mangos</div>
          </div>
          <span className="rounded-full border border-earn/40 bg-earn/10 px-2 py-0.5 text-[10px] font-bold text-earn">
            {totals.readyCount} ready
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Mango Owned" value={`${totals.total}`} tone="primary" />
          <Stat label="Mango / hr" value={`${totals.perHour}`} tone="primary" />
          <Stat label="Pending" value={`${totals.pending} 🥭`} tone="earn" />
        </div>
      </div>

      {!rows.length && (
        <div className="rounded-2xl bg-gradient-card p-6 text-center text-sm text-muted-foreground">
          You don't own any Mangos yet. Head to the Market tab to buy your first one.
        </div>
      )}

      {rows.map((row) => {
        const remainMs = row.hourReady ? 0 : row.nextAt - now;
        const barPct = row.hourReady
          ? Math.min(100, (row.adsDone / row.p.adsRequired) * 100)
          : Math.min(100, (1 - remainMs / (3600 * 1000)) * 100);
        const expiresIn = row.expiresAt ? row.expiresAt - now : 0;
        return (
          <div key={row.o.id}
            className={`rounded-2xl bg-gradient-to-br ${row.p.tint} p-3 shadow-elegant ring-1 ${row.p.ring}`}>
            <div className="flex items-center gap-3">
              <ProductArt p={row.p} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-display text-sm font-bold">{row.p.name}</div>
                  <span className={`rounded-full bg-black/30 px-1.5 py-0.5 text-[8px] font-bold uppercase ${RARITY_TEXT[row.p.rarity]}`}>
                    {RARITY_LABEL[row.p.rarity]}
                  </span>
                  <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    {row.claimsToday}/7 today
                  </span>
                  {row.expiresAt > 0 && (
                    <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      <Timer className="h-2.5 w-2.5" /> {fmtExpiry(expiresIn)}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  +{row.p.hourlyRate} 🥭 per cycle · {row.adsDone}/{row.p.adsRequired} ads
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/25">
                  <div className="h-full bg-gradient-earn" style={{ width: `${barPct}%` }} />
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              {row.capReached ? (
                <button disabled className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-surface-1/60 py-2 text-xs font-semibold text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Daily cap 7/7 · resets 00:00 UTC
                </button>
              ) : !row.hourReady ? (
                <button disabled className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-surface-1/60 py-2 text-xs font-semibold text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {fmt(remainMs)}
                </button>
              ) : row.ready ? (
                <button disabled={busy === row.o.id + ":claim"}
                  onClick={() => claim(row)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-earn py-2 text-xs font-bold text-earn-foreground shadow-earn disabled:opacity-50">
                  {busy === row.o.id + ":claim" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
                  Claim +{row.p.hourlyRate} 🥭
                </button>
              ) : (
                <button disabled={busy === row.o.id + ":ad"}
                  onClick={() => watchAd(row)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-primary py-2 text-xs font-bold text-primary-foreground shadow-elegant disabled:opacity-50">
                  {busy === row.o.id + ":ad" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                  Watch ad ({row.adsDone + 1}/{row.p.adsRequired})
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
