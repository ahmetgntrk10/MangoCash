import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Share2, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { apiCall } from "@/lib/api";
import { useUser } from "@/hooks/useUser";
import { getTg, haptic } from "@/lib/telegram";
// refCard image is intentionally not previewed on this page; only used in the
// shared invite card sent through Telegram.

const BOT_USERNAME = (import.meta.env.VITE_TG_BOT_USERNAME as string) || "MangoCashBot";

export default function ReferralPage({ tgId }: { tgId: number | null }) {
  const { t } = useTranslation();
  const { data: user } = useUser(tgId);
  const [sharing, setSharing] = useState(false);
  const link = `https://t.me/${BOT_USERNAME}/earn?startapp=${tgId ?? ""}`;
  const shareText = t("ref.shareMsg");

  const { data: refs } = useQuery({
    queryKey: ["refs", tgId],
    enabled: !!tgId,
    queryFn: async () => (await apiCall<{ data: any[] }>("list_referrals")).data ?? [],
  });

  const { data: refBonusProgress } = useQuery({
    queryKey: ["ref-bonus", tgId],
    enabled: !!tgId,
    queryFn: async () => (await apiCall<{ data: any[] }>("ref_bonus_progress")).data ?? [],
  });
  const refBonusMap = new Map<number, any>();
  for (const p of refBonusProgress ?? []) refBonusMap.set(Number(p.referee_tg_id), p);

  function copy() {
    navigator.clipboard.writeText(link); haptic("light"); toast.success(t("common.copied"));
  }

  async function share() {
  haptic("light");
  if (sharing) return;
  setSharing(true);
  try {
    const tg = getTg();
    const fallback = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(fallback);
    } else {
      window.open(fallback, "_blank");
    }
  } finally {
    setSharing(false);
  }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={Users} label={t("ref.totalInvites")} value={user?.referral_count ?? 0} />
        <Stat icon={Sparkles} label={t("ref.totalEarned")} value={`${user?.ref_earnings_cloud ?? 0} 🥭`} earn />
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-primary-glow/30 bg-primary/10 px-3 py-2.5 text-[11px] text-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-glow" />
        <span>{t("ref.rule")}</span>
      </div>

      <div className="rounded-2xl bg-gradient-card p-3 shadow-elegant">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("ref.yourLink")}</div>
        <div className="mt-1 truncate text-xs">{link}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={copy} className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface-1/60 py-3 text-sm font-semibold">
          <Copy className="h-4 w-4" /> {t("common.copy")}
        </button>
        <button onClick={share} disabled={sharing}
          className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-elegant disabled:opacity-60">
          <Share2 className="h-4 w-4" /> {t("common.share")}
        </button>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">{t("ref.invitedUsers")}</div>
        {!refs?.length ? (
          <div className="rounded-2xl bg-gradient-card p-6 text-center text-sm text-muted-foreground">No invites yet</div>
        ) : (
          <ul className="space-y-2">
            {refs.map((r: any) => {
              return (
                <li key={r.tg_id} className="flex items-center gap-3 rounded-2xl bg-gradient-card p-3 shadow-elegant">
                  {r.photo_url ? (
                    <img src={r.photo_url} alt="" className="h-10 w-10 rounded-full" />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-sm">{(r.first_name ?? "?")[0]}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.first_name ?? "User"} {r.last_name ?? ""}</div>
                    <div className="truncate text-[11px] text-muted-foreground">@{r.username ?? "—"}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Lifetime commission: 5%
                    </div>
                    {(() => {
                      const p = refBonusMap.get(r.tg_id);
                      const daysDone = Number(p?.days_completed ?? 0);
                      const todayAds = Number(p?.current_day_ads ?? 0);
                      return (
                        <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
                          <span className={`rounded px-1.5 py-0.5 ${p?.signup_bonus_credited ? "bg-earn/20 text-earn" : "bg-surface-2 text-muted-foreground"}`}>
                            {p?.signup_bonus_credited ? t("refBonus.signupDone") : t("refBonus.signupPending")}
                          </span>
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-muted-foreground">
                            {t("refBonus.daysProgress", { done: daysDone })}
                          </span>
                          {daysDone < 10 && (
                            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-muted-foreground">
                              {t("refBonus.todayAds", { n: todayAds })}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold text-earn">
                      {r.commission_total_cloud ?? 0} 🥭
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">earned</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

import type { LucideIcon } from "lucide-react";
function Stat({ icon: Icon, label, value, earn }: { icon: LucideIcon; label: string; value: any; earn?: boolean }) {
  return (
    <div className="rounded-2xl bg-gradient-card p-4 shadow-elegant">
      <Icon className={`h-4 w-4 ${earn ? "text-earn" : "text-primary-glow"}`} />
      <div className={`mt-2 font-display text-xl font-bold ${earn ? "text-earn" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
