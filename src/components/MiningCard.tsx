import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Play, PlusCircle, ExternalLink, Megaphone, CheckCircle2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiCall, requestAdTicket } from "@/lib/api";
import { showRewardedChain } from "@/lib/ads/chain";
import { showAdsgramRewarded, ADSGRAM_REWARD_BLOCK } from "@/lib/ads";
import { useAdGate } from "@/components/ads/AdGate";
import { MINING } from "@/lib/config";
import { openLink, haptic } from "@/lib/telegram";

type Status = {
  state: "idle" | "running" | "ready";
  session: null | {
    started_at: string; expires_at: string; hours_total: number;
    ratePerHour: number; reward: number;
  };
  can_boost: boolean;
  max_hours: number;
  rate_per_hour: number;
};

export default function MiningCard({ tgId }: { tgId: number | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { showClosedEarly } = useAdGate();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

        const { data: status, refetch } = useQuery({
    queryKey: ["mining_status", tgId],
    enabled: !!tgId,
    queryFn: async () => (await apiCall<Status>("mining_status")),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (status?.state !== "running") return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [status?.state]);

  const expiresAt = status?.session ? new Date(status.session.expires_at).getTime() : 0;
  const remainingMs = Math.max(0, expiresAt - now);
  const reward = status?.session?.reward ?? MINING.ratePerHour;

  // Sayaç sıfırlanınca tek seferlik senkron.
  const syncedFor = useRef(0);
  useEffect(() => {
    if (status?.state !== "running" || !expiresAt) return;
    if (remainingMs > 0) return;
    if (syncedFor.current === expiresAt) return;
    syncedFor.current = expiresAt;
    refetch();
  }, [remainingMs, expiresAt, status?.state, refetch]);




  const progress = useMemo(() => {
    if (!status?.session) return 0;
    const total = Number(status.session.hours_total) * 3600 * 1000;
    const elapsed = total - remainingMs;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  }, [status, remainingMs]);

  function formatRemaining(ms: number) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  async function start() {
    if (busy || !tgId) return;
    setBusy(true);
    try {
      const res = await apiCall<{ ok?: boolean; error?: string }>("mining_start").catch((e: any) => ({ error: e?.message }));
      const err = res?.error ?? "";
      if (err.includes("not_member") || err.includes("bot_not_in_channel")) { setShowJoin(true); return; }
      if (res?.error) { toast.error(res.error); return; }
      haptic("success");
      toast.success(t("mining.started"));
      qc.invalidateQueries({ queryKey: ["mining_status", tgId] });
    } finally { setBusy(false); }
  }

  async function verifyMember() {
    setBusy(true);
    try {
      const r = await apiCall<{ ok: boolean }>("mining_check_channel");
      if (!r.ok) { haptic("error"); toast.error(t("mining.notMember")); return; }
      setShowJoin(false);
      await start();
    } finally { setBusy(false); }
  }

  async function claim() {
    if (busy || !status?.session) return;
    setBusy(true);
    try {
      const ticket = await requestAdTicket("mining_claim");
      if (!ticket) { toast.error(t("common.error")); return; }
      const ad = await showAdsgramRewarded(ADSGRAM_REWARD_BLOCK);
      if (!ad.ok) {
        if (ad.reason === "no-fill") {
  const ch = await showRewardedChain(); // fallback chain
  if (!ch.ok) { if (ch.reason === "no-fill") toast.error(t("common.noAd")); else showClosedEarly(); return; }
} else { showClosedEarly(); return; }
      }
      const res: any = await apiCall<{ ok?: boolean; reward?: number; error?: string }>("mining_claim", { ad_ticket_id: ticket })
        .catch((e: any) => ({ error: e?.message }));
      if ((res?.error ?? "").includes("not_member")) { setShowJoin(true); return; }
      if (res?.error) {
        const msg = res.reason || res.error;
        toast.error(`${t("common.error")}: ${msg}`);
        return;
      }
      haptic("success");
      toast.success(`+${res?.reward ?? reward} 🥭`);
      qc.invalidateQueries({ queryKey: ["mining_status", tgId] });
      qc.invalidateQueries({ queryKey: ["user", tgId] });
    } finally { setBusy(false); }
  }

  async function extendBoost() {
    if (busy || !status?.session) return;
    setBusy(true);
    try {
      const ticket = await requestAdTicket("mining_extend");
      if (!ticket) { toast.error(t("common.error")); return; }
      const ad = await showAdsgramRewarded(ADSGRAM_REWARD_BLOCK);
      if (!ad.ok) { if (ad.reason === "no-fill") toast.error(t("common.noAd")); else showClosedEarly(); return; }
      const res: any = await apiCall<{ ok?: boolean; hours_total?: number; error?: string }>("mining_extend", { ad_ticket_id: ticket })
        .catch((e: any) => ({ error: e?.message }));
      if (res?.error === "max_reached") { toast.error(t("mining.maxReached")); return; }
      if (res?.error) { toast.error(res.error); return; }
      toast.success(t("mining.extended"));
      qc.invalidateQueries({ queryKey: ["mining_status", tgId] });
    } finally { setBusy(false); }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-card p-5 shadow-elegant ring-1 ring-primary-glow/20">
      {showJoin && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in" onClick={() => !busy && setShowJoin(false)}>
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl border border-primary-glow/20 bg-surface-1 p-5 shadow-elegant sm:mb-4 sm:rounded-3xl"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-earn shadow-earn">
                <Megaphone className="h-5 w-5 text-earn-foreground" />
              </div>
              <div className="flex-1">
                <div className="font-display text-base font-bold">{t("mining.joinRequired")}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t("mining.joinDesc", { channel: "@" + MINING.channel })}</p>
              </div>
              <button onClick={() => !busy && setShowJoin(false)} className="grid h-7 w-7 place-items-center rounded-full bg-surface-2/70 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => openLink(`https://t.me/${MINING.channel}`)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-earn py-3 text-sm font-bold text-earn-foreground shadow-earn"
            >
              <ExternalLink className="h-4 w-4" /> {t("mining.joinChannel")}
            </button>
            <button
              disabled={busy}
              onClick={verifyMember}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-surface-2/70 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> {t("mining.verify")}</>}
            </button>
          </motion.div>
        </div>
      )}
      <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 -bottom-12 h-32 w-32 rounded-full bg-earn/15 blur-3xl" />

      <div className="relative flex items-center justify-between">
        <div className="font-display text-base font-bold">{t("mining.title")}</div>
        <div className="rounded-full border border-primary-glow/30 bg-surface-1/60 px-3 py-0.5 text-[11px] font-semibold text-primary-glow">
          {MINING.ratePerHour} 🥭/h
        </div>
      </div>

      <div className="relative my-5 flex flex-col items-center">
        <motion.div
          animate={status?.state === "running"
            ? { y: [0, -8, 0], scale: [1, 1.05, 1] }
            : { y: 0 }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="grid h-32 w-32 place-items-center rounded-full bg-gradient-primary shadow-glow"
        >
          <span className="relative text-6xl drop-shadow-lg animate-mango-float animate-mango-pulse">
  🥭
</span>
        </motion.div>
        <div className="mt-3 font-display text-2xl font-bold tabular-nums text-foreground">
          {status?.state === "idle" && "00:00:00"}
          {status?.state !== "idle" && formatRemaining(remainingMs)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {status?.state === "ready"
            ? <span className="text-earn">{t("mining.readyToClaim", { n: reward })}</span>
            : status?.state === "running"
              ? t("mining.runningHours", { n: status.session?.hours_total ?? 1 })
              : t("mining.idle")}
        </div>
      </div>

      {status?.state !== "idle" && (
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2/60">
          <motion.div className="h-full bg-gradient-primary" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="relative mt-4 flex gap-2">
        {status?.state === "idle" && (
          <button disabled={busy} onClick={start}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3 text-sm font-bold text-primary-foreground shadow-elegant disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {t("mining.start")}
          </button>
        )}
        {status?.state === "running" && (
          <button disabled
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-surface-1/60 py-3 text-sm font-semibold text-muted-foreground">
            {t("mining.mining")}
          </button>
        )}
        {status?.state === "ready" && (
          <button disabled={busy} onClick={claim}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-earn py-3 text-sm font-bold text-earn-foreground shadow-earn disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
            {t("mining.claim", { n: reward })}
          </button>
        )}
        {status?.can_boost && status?.state === "running" && (
          <button disabled={busy || (status.session?.hours_total ?? 0) >= status.max_hours} onClick={extendBoost}
            className="flex items-center justify-center gap-1 rounded-2xl bg-surface-1/60 px-3 py-3 text-xs font-semibold text-primary-glow disabled:opacity-40">
            <PlusCircle className="h-4 w-4" /> +1h
          </button>
        )}
      </div>

      <div className="relative mt-4 space-y-1 text-[11px] text-muted-foreground">
        <div>• {t("mining.info1")}</div>
        <div>• {t("mining.info2")}</div>
        <div>• {t("mining.info3")}</div>
      </div>
    </div>
  );
}
