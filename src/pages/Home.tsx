import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Wallet, Gift, Link2, ArrowRightLeft, Send, MapPin, Shield, Loader2, CheckCircle2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useUser, useIsAdmin } from "@/hooks/useUser";
import { apiCall, requestAdTicket } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { cloudToUsdt, formatUsdt, haptic } from "@/lib/telegram";
import { DAILY_REWARD_MANGO, MINING, BIO_REWARD_MANGO } from "@/lib/config";
import { showRewardedChain } from "@/lib/ads/chain";
import { useAdGate } from "@/components/ads/AdGate";
import HomeBanner from "@/components/HomeBanner";

export default function Home({ tgId }: { tgId: number | null }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { data: user } = useUser(tgId);
  const { data: isAdmin } = useIsAdmin(tgId);
  const qc = useQueryClient();
  const { showClosedEarly } = useAdGate();
  const [claiming, setClaiming] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  const canClaim = useMemo(() => {
    if (!user?.last_daily_reward_at) return true;
    return Date.now() - new Date(user.last_daily_reward_at).getTime() > 24 * 3600 * 1000;
  }, [user]);

  async function claimDaily() {
    if (!user || !canClaim || claiming) return;
    setClaiming(true);
    try {
      haptic("medium");
      const ticket = await requestAdTicket("daily");
      if (!ticket) { toast.error(t("common.error")); return; }
      const r = await showRewardedChain();
      if (!r.ok) {
        if (r.reason === "no-fill") toast.error(t("common.noAd"));
        else showClosedEarly();
        return;
      }
      await apiCall("claim_daily", { ad_ticket_id: ticket });
      haptic("success");
      toast.success(`+${DAILY_REWARD_MANGO} 🥭`);
      qc.invalidateQueries({ queryKey: ["user", tgId] });
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setClaiming(false); }
  }

  async function verifyBio() {
    if (bioBusy) return;
    setBioBusy(true);
    try {
      const r = await apiCall<{ ok: boolean; verified: boolean; reward?: number }>("verify_bio");
      if (r.verified) {
        if (r.reward && r.reward > 0) toast.success(`${t("profile.bioVerified")} +${r.reward} 🥭`);
        else toast.success(t("profile.bioVerified"));
      }
      else toast.error(t("profile.bioMissing"));
      qc.invalidateQueries({ queryKey: ["user", tgId] });
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBioBusy(false); }
  }

  const mango = user?.balance_cloud ?? 0;
  const usdt = cloudToUsdt(mango);

  return (
    <div className="space-y-4">
      {/* Main Balance card with admin button in top-right */}
      <motion.div
        initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-card p-6 shadow-elegant"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-earn/15 blur-3xl" />

        {isAdmin && (
          <button
            onClick={() => nav("/admin")}
            className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full border border-primary-glow/30 bg-surface-1/70 px-3 py-1.5 text-[11px] font-semibold text-primary-glow backdrop-blur-md"
          >
            <Shield className="h-3.5 w-3.5" /> Admin
          </button>
        )}

        <div className="relative flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" /> {t("common.balance")}
        </div>
        <div className="relative mt-3 flex items-baseline gap-2">
           <span key={mango} className="font-display text-5xl font-bold tabular-nums text-foreground animate-balance-pop">{mango.toLocaleString()}</span>
          <span className="text-2xl">🥭</span>
        </div>
        <div className="relative mt-1 text-sm text-muted-foreground">≈ {formatUsdt(usdt)} USDT</div>
      </motion.div>

      <HomeBanner />

      <div className="grid grid-cols-2 gap-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!canClaim || claiming}
          onClick={claimDaily}
          className="group relative overflow-hidden rounded-2xl bg-gradient-card p-4 text-left shadow-elegant disabled:opacity-50"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <Gift className="h-5 w-5 text-warning" />
          <div className="mt-2 text-sm font-semibold">{t("common.dailyReward")}</div>
          <div className="mt-0.5 text-xs text-primary-glow">+{DAILY_REWARD_MANGO} 🥭</div>
          {claiming && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-primary" />}
          {!canClaim && <div className="mt-0.5 text-[10px] text-muted-foreground">24h</div>}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={verifyBio}
          disabled={bioBusy}
          className="relative overflow-hidden rounded-2xl bg-gradient-card p-4 text-left shadow-elegant disabled:opacity-50"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-earn/40 to-transparent" />
          <Link2 className="h-5 w-5 text-earn" />
          <div className="mt-2 text-sm font-semibold">{t("common.linkInBio")}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {bioBusy ? "..." : (user as any)?.bio_verified ? <span className="flex items-center gap-1 text-earn"><CheckCircle2 className="h-3 w-3" /> {t("profile.bioVerified")}</span> : "Tap to verify"}
          </div>
        </motion.button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ActionBtn icon={MapPin} label={t("common.setAddress")} to="/profile" />
        <ActionBtn icon={ArrowRightLeft} label={t("common.convert")} to="/profile" />
        <ActionBtn icon={Send} label={t("common.withdraw")} to="/profile" />
      </div>

      {/* Start Mining – sits in normal flow so banners simply push it down. */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => nav("/earn")}
        className="group relative w-full overflow-hidden rounded-3xl bg-gradient-card p-5 text-left shadow-elegant ring-1 ring-primary-glow/30"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/30 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 -bottom-12 h-32 w-32 rounded-full bg-earn/20 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-glow to-transparent" />
        <div className="relative flex items-center gap-4">
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow"
          >
            <span className="text-2xl">🥭</span>
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-bold">{t("mining.startMining")}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {t("mining.tagline", { rate: MINING.ratePerHour })}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-primary-glow" />
        </div>
      </motion.button>
      {!(user as any)?.bio_reward_claimed && (
        <div className="rounded-xl bg-surface-1/40 px-3 py-2 text-[10px] text-muted-foreground">
          {t("profile.bioOnceReward", { n: BIO_REWARD_MANGO })}
        </div>
      )}
    </div>
  );
}

import type { LucideIcon } from "lucide-react";
function ActionBtn({ icon: Icon, label, to }: { icon: LucideIcon; label: string; to: string }) {
  const nav = useNavigate();
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => nav(to)}
      className="flex flex-col items-center gap-1 rounded-2xl bg-surface-1/60 p-3 ring-1 ring-border"
    >
      <Icon className="h-5 w-5 text-primary-glow" />
      <span className="text-[11px]">{label}</span>
    </motion.button>
  );
}
