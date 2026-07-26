import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Lock, Loader2, PlayCircle, Zap } from "lucide-react";
import { apiCall, requestAdTicket } from "@/lib/api";
import { TAPTAP } from "@/lib/config";
import { haptic } from "@/lib/telegram";
import { showAdsgramInterstitialSimple } from "@/lib/ads/adsgram";

type Status = {
  earned_today: number;
  limit: number;
  locked: boolean;
  next_lock_at: number;   // earned value at which the next ad lock triggers
  resets_at: string;      // ISO — next UTC 00:00
};

type Floater = { id: number; x: number; y: number };

function fmt(n: number) { return n.toLocaleString("en-US"); }

function useCountdown(iso?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (!iso) return "";
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function MangoTapTap({ tgId, onBack }: { tgId: number | null; onBack: () => void }) {
  const [tapAnim, setTapAnim] = useState(false);
const [flyItems, setFlyItems] = useState<{ id: number; x: number; y: number }[]>([]);
  const qc = useQueryClient();
  const { data, refetch } = useQuery<Status>({
    queryKey: ["taptap_status", tgId],
    queryFn: () => apiCall<Status>("taptap_status"),
    enabled: !!tgId,
    staleTime: 5_000,
  });

  const earned = data?.earned_today ?? 0;
  const limit = data?.limit ?? TAPTAP.DAILY_MAX;
  const locked = data?.locked ?? false;
  const done = earned >= limit;
  const pct = Math.min(100, (earned / limit) * 100);
  const countdown = useCountdown(data?.resets_at);

  const [floaters, setFloaters] = useState<Floater[]>([]);
  const nextId = useRef(0);
  const [tapBusy, setTapBusy] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  const [adFailed, setAdFailed] = useState(false);

  async function watchAd() {
    if (adBusy) return;
    setAdBusy(true); setAdFailed(false);
    try {
      const ticket = await requestAdTicket("taptap", "adsgram");
      if (!ticket) { setAdFailed(true); toast.error("Could not start ad"); return; }
      const r = await showAdsgramInterstitialSimple(TAPTAP.INTERSTITIAL_BLOCK);
      if (!r.ok) { setAdFailed(true); toast.error("Ad closed too early"); return; }
      const resp = await apiCall<{ ok?: boolean; error?: string }>("taptap_unlock", { ad_ticket_id: ticket });
      if (resp?.error) { setAdFailed(true); toast.error(resp.error); return; }
      haptic("success");
      await refetch();
      qc.invalidateQueries({ queryKey: ["user", tgId] });
    } catch (e: any) {
      setAdFailed(true);
      toast.error(e?.message ?? "Ad failed");
    } finally { setAdBusy(false); }
  }

  // Auto-trigger ad when locked
  useEffect(() => {
    if (locked && !adBusy && !adFailed && !done) {
      watchAd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, done]);

  async function onTap(e: React.MouseEvent<HTMLButtonElement>) {
    if (locked || done || tapBusy) return;
    setTapBusy(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = ++nextId.current;
    setFloaters((f) => [...f, { id, x, y }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 900);

    // tap bounce animasyonu
    setTapAnim(true);
    setTimeout(() => setTapAnim(false), 250);

    // kazanç uçuşu (+N 🥭)
    const flyId = Date.now();
    setFlyItems((prev) => [...prev, { id: flyId, x: Math.random() * 60 - 30, y: 0 }]);
    setTimeout(() => setFlyItems((prev) => prev.filter((f) => f.id !== flyId)), 900);

    haptic("light");
    try {
      const r = await apiCall<{ earned_today: number; locked: boolean; next_lock_at: number; error?: string }>(
        "taptap_tap", {},
      );
      if (r?.error) { toast.error(r.error); return; }
      qc.setQueryData<Status>(["taptap_status", tgId], (prev) =>
        prev ? { ...prev, earned_today: r.earned_today, locked: r.locked, next_lock_at: r.next_lock_at } : prev,
      );
      if (r.earned_today >= limit) {
        qc.invalidateQueries({ queryKey: ["user", tgId] });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Tap failed");
    } finally { setTapBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gradient-to-b from-[#0b1226] via-[#0c1330] to-[#0a1128] px-4 pb-6 pt-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { haptic("light"); onBack(); }}
          className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white ring-1 ring-white/15 backdrop-blur"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15">
          {fmt(earned)} <span className="text-white/60">/ {fmt(limit)}</span> 🥭
        </div>
      </div>

      {/* Title */}
      <div className="mt-6 text-center">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-gradient-earn shadow-earn">
          <Zap className="h-5 w-5 text-earn-foreground" />
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-gradient-earn">Mango Tap-Tap</h1>
        <p className="mt-1 text-xs text-white/60">
          Tap the mango to earn +{TAPTAP.PER_TAP} 🥭. Every {TAPTAP.AD_EVERY} 🥭 requires a short ad.
        </p>
      </div>

      {/* Tap area */}
      <div className="relative mt-8 flex flex-1 items-center justify-center">
        <motion.button
          disabled={locked || done || tapBusy}
          whileTap={{ scale: 0.92 }}
          onClick={onTap}
          className={`relative grid h-64 w-64 place-items-center overflow-hidden rounded-full shadow-glow ring-4 transition
            ${done
              ? "bg-gradient-to-br from-slate-700 to-slate-900 ring-slate-500/30 opacity-70"
              : locked
                ? "bg-gradient-to-br from-slate-800 to-slate-950 ring-primary-glow/20"
                : "bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 ring-sky-300/40 active:ring-sky-200/60"}
          `}
        >
          {/* halo */}
          {!locked && !done && (
            <motion.span
              className="absolute inset-2 rounded-full bg-white/10"
              animate={{ scale: [1, 1.06, 1], opacity: [0.35, 0.55, 0.35] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          {done ? (
            <div className="text-center text-white">
              <Lock className="mx-auto h-10 w-10 opacity-80" />
              <div className="mt-2 text-xs font-semibold uppercase tracking-wider">Daily limit</div>
              <div className="mt-1 text-[11px] text-white/70">Resets at 00:00 UTC</div>
              {countdown && <div className="mt-1 font-mono text-sm">{countdown}</div>}
            </div>
          ) : locked ? (
            <div className="text-center text-white">
              {adBusy ? (
                <>
                  <Loader2 className="mx-auto h-10 w-10 animate-spin" />
                  <div className="mt-2 text-xs">Loading ad…</div>
                </>
              ) : adFailed ? (
                <>
                  <Lock className="mx-auto h-10 w-10" />
                  <div className="mt-2 text-xs">Ad required</div>
                </>
              ) : (
                <>
                  <PlayCircle className="mx-auto h-10 w-10 animate-pulse" />
                  <div className="mt-2 text-xs">Preparing ad…</div>
                </>
              )}
            </div>
          ) : (
            <div className="relative flex items-center justify-center">
  <span
    className={`relative text-8xl drop-shadow-lg select-none cursor-pointer ${tapAnim ? "animate-tap-bounce" : ""}`}
  >
    🥭
  </span>
  {flyItems.map(f => (
    <span
      key={f.id}
      className="pointer-events-none absolute animate-earn-fly font-bold text-yellow-400 text-lg"
      style={{ left: `calc(50% + ${f.x}px)`, bottom: "100%" }}
    >
      +{TAPTAP.PER_TAP} 🥭
    </span>
  ))}
</div>
          )}

          {/* Floating +5 markers */}
          <AnimatePresence>
            {floaters.map((f) => (
              <motion.span
                key={f.id}
                initial={{ opacity: 1, x: f.x - 128, y: f.y - 128, scale: 0.8 }}
                animate={{ opacity: 0, y: f.y - 128 - 80, scale: 1.1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.85, ease: "easeOut" }}
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-xl font-bold text-white drop-shadow"
              >
                +{TAPTAP.PER_TAP} 🥭
              </motion.span>
            ))}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Retry button when ad failed */}
      {locked && adFailed && !done && (
        <button
          onClick={watchAd}
          disabled={adBusy}
          className="mx-auto mb-3 flex items-center gap-2 rounded-2xl bg-gradient-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-elegant disabled:opacity-60"
        >
          <PlayCircle className="h-4 w-4" /> Try ad again
        </button>
      )}

      {/* Progress bar */}
      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between text-[11px] text-white/60">
          <span>Daily progress</span>
          <span>{fmt(earned)} / {fmt(limit)} 🥭</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 140, damping: 22 }}
          />
        </div>
        {done && (
          <div className="mt-2 text-center text-[11px] text-white/60">
            Daily limit reached. Resets at <span className="font-mono">00:00 UTC</span>
            {countdown && <> · <span className="font-mono">{countdown}</span></>}
          </div>
        )}
      </div>
    </div>
  );
}
