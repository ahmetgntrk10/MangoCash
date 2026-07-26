import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, ExternalLink, CheckCircle2, Play, Sparkles, ChevronDown, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { apiCall, requestAdTicket } from "@/lib/api";
import { useUser } from "@/hooks/useUser";
import { openLink, haptic } from "@/lib/telegram";
import { AD_NETWORKS, type AdNetworkKey } from "@/lib/config";
import {
  ADSGRAM_REWARD_BLOCK, ADSGRAM_INT_FORCE,
  showAdsgramRewarded, showAdsgramInterstitial,
  showMonetagRewarded, showRichAdsRandom,
  showOnclickaAd, showGigaPupAd, showTowerAdsRewarded, type AdResult,
} from "@/lib/ads";
import { useAdGate } from "@/components/ads/AdGate";

const TABS = ["social", "exclusive", "ads", "partners"] as const;
type Tab = typeof TABS[number];

export default function TaskPage({ tgId }: { tgId: number | null }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("social");

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-gradient-primary">Tasks</h1>
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-surface-1/60 p-1 ring-1 ring-border">
        {TABS.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`relative shrink-0 flex-1 rounded-xl px-3 py-2 text-xs font-medium ${
              tab === c ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {tab === c && (
              <motion.div
                layoutId="task-tab-pill"
                className="absolute inset-0 rounded-xl bg-gradient-primary shadow-elegant"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative">{t(`task.${c}`)}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "ads" ? (
            <AdsTab tgId={tgId} />
          ) : tab === "exclusive" ? (
            <ExclusiveTab tgId={tgId} />
          ) : (
            <CategoryList category={tab} tgId={tgId} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ───── ADS TAB ───── */

function AdsTab({ tgId }: { tgId: number | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { showClosedEarly } = useAdGate();

  const { data: stats, refetch } = useQuery({
    queryKey: ["ad_stats", tgId],
    enabled: !!tgId,
    queryFn: async () =>
      apiCall<{ data: Record<AdNetworkKey, number>; cooldowns: Record<AdNetworkKey, number> }>("ad_stats"),
    refetchInterval: 8000,
  });

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-sm font-semibold">{t("task.adsTitle")}</div>
        <div className="text-[11px] text-muted-foreground">{t("task.adsSubtitle")}</div>
      </div>
      {(Object.keys(AD_NETWORKS) as AdNetworkKey[]).map((net) => (
        <AdNetworkCard
          key={net}
          net={net}
          watchedToday={stats?.data?.[net] ?? 0}
          serverCooldownUntil={stats?.cooldowns?.[net] ?? 0}
          onWatched={() => { qc.invalidateQueries({ queryKey: ["user", tgId] }); refetch(); }}
          onClosedEarly={showClosedEarly}
        />
      ))}
    </div>
  );
}

function AdNetworkCard({
  net, watchedToday, serverCooldownUntil, onWatched, onClosedEarly,
}: {
  net: AdNetworkKey; watchedToday: number;
  serverCooldownUntil: number;
  onWatched: () => void; onClosedEarly: () => void;
}) {
  const { t } = useTranslation();
  const cfg = AD_NETWORKS[net];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  // Backend-authoritative cooldown. Switching tabs cannot reset it.
  useEffect(() => {
    if (serverCooldownUntil > cooldownUntil) setCooldownUntil(serverCooldownUntil);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverCooldownUntil]);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 250);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [cooldownUntil]);

  const remainingCd = Math.max(0, cooldownUntil - now);
  const left = cfg.dailyLimit - watchedToday;

  async function watchSlot(slotIdx: number) {
    // Allow any slot in any order; the only gates are: not busy, slots remaining, no active cooldown.
    if (busy || left <= 0 || remainingCd > 0) return;
    setBusy(true);
    try {
      const ticket = await requestAdTicket("task_ads", net);
      if (!ticket) { toast.error(t("common.error")); return; }
      let res: AdResult;
      if (net === "adsgram") {
        // Task → Ads → Adsgram = INTERSTITIAL with strict click verification.
        res = await showAdsgramInterstitial(ADSGRAM_INT_FORCE);
      } else if (net === "monetag") {
        res = await showMonetagRewarded();
      } else if (net === "richads") {
        res = await showRichAdsRandom();
      } else if (net === "onclicka") {
        res = await showOnclickaAd();
      } else if (net === "gigapup") {
        res = await showGigaPupAd();
      } else if (net === "towerads") {
        res = await showTowerAdsRewarded();
      } else {
        res = { ok: false, reason: "no-fill" };
      }
      if (!res.ok) {
        if (res.reason === "no-fill") toast.error(t("common.noAd"));
        else if (res.reason === "closed-early" && net === "adsgram") onClosedEarly();
        else toast.error(t("common.noAd"));
        apiCall("log_failed_ad", { network: net, reason: res.reason }).catch(() => {});
        return;
      }
      await apiCall("record_ad_view", { network: net, ad_ticket_id: ticket });
      haptic("success");
      toast.success(`+${cfg.reward} 🥭`);
      setCooldownUntil(Date.now() + cfg.cooldownMs);
      onWatched();
    } catch (e: any) {
      // Clean error: never surface raw supabase/postgres text to user.
      const msg = String(e?.message ?? "").toLowerCase();
      if (msg.includes("limit")) toast.error(t("task.dailyLimit"));
      else if (msg.includes("cooldown")) {
        toast.error(t("common.noAd"));
        onWatched(); // refresh cooldown from server
      }
      else toast.error(t("common.noAd"));
    }
    finally { setBusy(false); }
  }

  const accent =
    net === "adsgram" ? "text-primary-glow" :
    net === "monetag" ? "text-warning" :
    net === "richads" ? "text-earn" : "text-primary";

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-card shadow-elegant">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div className={`grid h-11 w-11 place-items-center rounded-xl bg-surface-2 ${accent}`}>
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{cfg.label}</div>
          <div className="text-[11px] text-muted-foreground">
            +{cfg.reward} 🥭 · {left} {t("task.slotsLeft")}
            {remainingCd > 0 && <span className="ml-2 text-warning">· {Math.ceil(remainingCd / 1000)}s</span>}
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="grid grid-cols-1 gap-1.5 px-3 pb-3">
              {Array.from({ length: cfg.dailyLimit }).map((_, i) => {
                const done = i < watchedToday;
                const next = !done;
                const disabled = done || busy || remainingCd > 0 || left <= 0;
                return (
                  <button
                    key={i}
                    disabled={disabled}
                    onClick={() => watchSlot(i)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs transition ${
                      done
                        ? "border-earn/40 bg-earn/10 text-earn"
                        : next
                          ? "border-primary-glow/40 bg-primary/10 text-foreground hover:bg-primary/20"
                          : "border-border bg-surface-1/40 text-muted-foreground"
                    }`}
                  >
                    <span className="font-medium">#{i + 1}</span>
                    <span className="flex items-center gap-1.5">
                      {done ? (<><CheckCircle2 className="h-3.5 w-3.5" /> {t("task.watched")}</>)
                       : next && busy ? (<Loader2 className="h-3.5 w-3.5 animate-spin" />)
                       : remainingCd > 0 ? (<span className="text-warning">{Math.ceil(remainingCd / 1000)}s</span>)
                       : (<><Play className="h-3.5 w-3.5" /> {t("task.watchNow")} · +{cfg.reward} 🥭</>)}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───── normal/category tasks ───── */

function CategoryList({ category, tgId }: { category: string; tgId: number | null }) {
  const qc = useQueryClient();
  const { data: tasks } = useQuery({
    queryKey: ["tasks", category],
    queryFn: async () => (await apiCall<{ data: any[] }>("list_tasks", { category })).data ?? [],
  });
  const { data: completions } = useQuery({
    queryKey: ["tc", tgId],
    enabled: !!tgId,
    queryFn: async () => new Set((await apiCall<{ data: string[] }>("my_task_completions")).data ?? []),
  });

  if (!tasks?.length) return <Empty msg="No tasks here yet." />;

  return (
    <ul className="space-y-2">
      {tasks.map((task: any) => {
        const done = completions?.has(task.id);
        return <TaskRow key={task.id} task={task} done={!!done} tgId={tgId} qc={qc} />;
      })}
    </ul>
  );
}

function TaskRow({ task, done, tgId, qc }: { task: any; done: boolean; tgId: number | null; qc: ReturnType<typeof useQueryClient> }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"open" | "wait" | "verify">("open");
  const [busy, setBusy] = useState(false);
  const [waitLeft, setWaitLeft] = useState(0);

  // Timer countdown
  useEffect(() => {
    if (phase !== "wait" || waitLeft <= 0) return;
    const id = setInterval(() => {
      setWaitLeft((s) => {
        if (s <= 1) { clearInterval(id); setPhase("verify"); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, waitLeft > 0]);

  async function openTask() {
    if (!tgId || busy) return;
    setBusy(true);
    try {
      await apiCall("start_task", { task_id: task.id });
      if (task.link) openLink(task.link);
      if (task.verification === "timer") {
        setWaitLeft(Math.max(5, Number(task.timer_seconds) || 15));
        setPhase("wait");
      } else {
        setPhase("verify");
      }
    } catch {
      // start_task is best-effort; still let user proceed to verify.
      if (task.link) openLink(task.link);
      if (task.verification === "timer") {
        setWaitLeft(Math.max(5, Number(task.timer_seconds) || 15));
        setPhase("wait");
      } else {
        setPhase("verify");
      }
    } finally { setBusy(false); }
  }

  async function verify() {
    if (!tgId || busy) return;
    setBusy(true);
    haptic("success");
    try {
      const res = await apiCall<{ ok: boolean; reward?: number; reason?: string }>(
        "verify_task", { task_id: task.id },
      );
      if (!res.ok) {
        const map: Record<string, string> = {
          already: t("task.alreadyDone"),
          not_member: t("task.notMember"),
          bot_not_in_channel: t("task.botMissing"),
          too_soon: t("task.tooSoon"),
          not_started: t("task.notStarted"),
          invalid_channel: t("task.invalidChannel"),
          limit: t("task.dailyLimit"),
          task_error: t("common.error"),
          server: t("common.error"),
        };
        toast.error(map[res.reason || ""] || t("common.error"));
        return;
      }
      toast.success(`+${task.reward_cloud} 🥭`);
      qc.invalidateQueries({ queryKey: ["tc", tgId] });
      qc.invalidateQueries({ queryKey: ["user", tgId] });
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("already")) {
        toast.error(t("task.alreadyDone"));
        qc.invalidateQueries({ queryKey: ["tc", tgId] });
      } else if (msg.includes("not_member")) toast.error(t("task.notMember"));
      else if (msg.includes("bot_not")) toast.error(t("task.botMissing"));
      else if (msg.includes("too_soon")) toast.error(t("task.tooSoon"));
      else toast.error(t("common.error"));
    } finally { setBusy(false); }
  }

  return (
    <li className="rounded-2xl bg-gradient-card p-4 shadow-elegant">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {task.icon_url && (
            <img src={task.icon_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold">{task.title}</div>
            {task.description && <div className="mt-0.5 text-xs text-muted-foreground">{task.description}</div>}
            <div className="mt-2 text-xs text-primary-glow">+{task.reward_cloud} 🥭</div>
          </div>
        </div>
        {done ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-earn" />
        ) : phase === "open" ? (
          <button
            disabled={busy}
            onClick={openTask}
            className="shrink-0 rounded-full bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-elegant disabled:opacity-60"
          >
            {task.link ? (
              <span className="flex items-center gap-1">{t("task.open")} <ExternalLink className="h-3 w-3" /></span>
            ) : (t("common.claim"))}
          </button>
        ) : phase === "wait" ? (
          <div className="shrink-0 rounded-full bg-surface-1/60 px-3 py-1.5 text-xs font-semibold text-warning">
            {waitLeft}s
          </div>
        ) : (
          <button
            disabled={busy}
            onClick={verify}
            className="shrink-0 rounded-full bg-gradient-earn px-3 py-1.5 text-xs font-bold text-earn-foreground shadow-earn disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("task.verify")}
          </button>
        )}
      </div>
    </li>
  );
}

function ExclusiveTab({ tgId }: { tgId: number | null }) {
  const [sub, setSub] = useState<"all" | "mine">("all");
  const { data: user } = useUser(tgId);
  const [form, setForm] = useState<{
    open: boolean; title: string; description: string; link: string;
    needed: number; task_type: "link" | "channel"; channel_username: string;
  }>({ open: false, title: "", description: "", link: "", needed: 100, task_type: "link", channel_username: "" });
  const qc = useQueryClient();
  const { data: completions } = useQuery({
    queryKey: ["tc", tgId],
    enabled: !!tgId,
    queryFn: async () => new Set((await apiCall<{ data: string[] }>("my_task_completions")).data ?? []),
  });

  const { data: tasks } = useQuery({
    queryKey: ["exclusive", sub, tgId],
    queryFn: async () => (await apiCall<{ data: any[] }>("list_exclusive", { mine: sub === "mine" })).data ?? [],
  });

  async function submitTask() {
    if (!tgId) return;
    const cost = form.needed * 0.005;
    if (!user || Number(user.balance_usdt) < cost) { toast.error(`Need ${cost.toFixed(2)} USDT`); return; }
    if (form.task_type === "channel" && !form.channel_username.trim()) {
      toast.error("Channel username required"); return;
    }
    if (form.task_type === "link" && !form.link.trim()) {
      toast.error("Link required"); return;
    }
    try {
      await apiCall("create_exclusive_task", {
        title: form.title, description: form.description, link: form.link, needed: form.needed,
        task_type: form.task_type,
        channel_username: form.task_type === "channel" ? form.channel_username.replace(/^@/, "") : null,
      });
      toast.success("Task added");
      setForm({ open: false, title: "", description: "", link: "", needed: 100, task_type: "link", channel_username: "" });
      qc.invalidateQueries({ queryKey: ["exclusive"] });
      qc.invalidateQueries({ queryKey: ["user", tgId] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["all", "mine"] as const).map((s) => (
          <button key={s} onClick={() => setSub(s)}
            className={`flex-1 rounded-xl px-3 py-1.5 text-xs ${
              sub === s ? "bg-primary/30 text-foreground ring-1 ring-primary-glow/40" : "bg-surface-1/60 text-muted-foreground"
            }`}>
            {s === "all" ? "Tasks" : "My Tasks"}
          </button>
        ))}
      </div>
      <button
        onClick={() => setForm((f) => ({ ...f, open: !f.open }))}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant"
      >
        <Plus className="h-4 w-4" /> Add Your Task
      </button>
      {form.open && (
        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} className="space-y-2 overflow-hidden rounded-2xl bg-gradient-card p-4">
          <div className="flex gap-2">
            {(["link", "channel"] as const).map((typ) => (
              <button key={typ} onClick={() => setForm({ ...form, task_type: typ })}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
                  form.task_type === typ
                    ? "bg-gradient-primary text-primary-foreground shadow-elegant"
                    : "bg-surface-1/60 text-muted-foreground"
                }`}>
                {typ === "link" ? "🌐 Website / Bot / Mini App" : "📣 Telegram Channel"}
              </button>
            ))}
          </div>
          <Input v={form.title} onChange={(v) => setForm({ ...form, title: v })} ph="Task title" />
          <Input v={form.description} onChange={(v) => setForm({ ...form, description: v })} ph="Description" />
          {form.task_type === "link" ? (
            <Input v={form.link} onChange={(v) => setForm({ ...form, link: v })} ph="Link (https://…)" />
          ) : (
            <>
              <Input v={form.channel_username} onChange={(v) => setForm({ ...form, channel_username: v })} ph="Channel @username (no @)" />
              <Input v={form.link} onChange={(v) => setForm({ ...form, link: v })} ph="Join link (https://t.me/...)" />
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-2 text-[11px] text-warning">
                ⚠ Add our bot <b>@MangoCashBot</b> as an admin in your channel so we can verify members.
                If the bot is not added within 2 hours, this task will be automatically removed and your balance will <b>not</b> be refunded.
              </div>
            </>
          )}
          <Input v={String(form.needed)} onChange={(v) => setForm({ ...form, needed: Math.max(100, Number(v) || 100) })} ph="Completions needed" />
          <div className="text-[11px] text-muted-foreground">
            {form.task_type === "channel"
              ? "Verification: getChat + getChatMember (real-time membership check)."
              : "Verification: 10-second countdown timer on the user side."}
          </div>
          <div className="rounded-xl bg-surface-1/60 p-2 text-[11px] text-muted-foreground space-y-0.5">
            <div className="flex justify-between"><span>Cost</span><span className="text-foreground">{(form.needed * 0.005).toFixed(4)} USDT</span></div>
            <div className="flex justify-between"><span>Reward per user (20%)</span><span className="text-earn">{(0.005 * 0.20).toFixed(4)} USDT</span></div>
            <div className="flex justify-between"><span>Platform fee (80%)</span><span>{(0.005 * 0.80).toFixed(4)} USDT</span></div>
          </div>
          <div className="rounded-xl border border-primary-glow/30 bg-primary/10 p-2 text-[11px] text-foreground">
            If your balance isn't enough, DM <b>@ahmetgntrk</b> for a special promo code.
          </div>
          <button onClick={submitTask} className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground">Pay & Publish</button>
        </motion.div>
      )}
      {!tasks?.length ? <Empty msg="No exclusive tasks yet." /> : (
        <ul className="space-y-2">
          {tasks.map((task: any) => (
            <ExclusiveTaskRow
              key={task.id} task={task} tgId={tgId}
              done={completions?.has(task.id) ?? false} qc={qc}
              isMine={Number(task.created_by_tg_id) === tgId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ExclusiveTaskRow({ task, tgId, done, qc, isMine }: {
  task: any; tgId: number | null; done: boolean; isMine: boolean;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const { t } = useTranslation();
  const isChannel = task.task_type === "channel" || task.verification === "channel";
  const [phase, setPhase] = useState<"open" | "wait" | "verify">("open");
  const [waitLeft, setWaitLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase !== "wait" || waitLeft <= 0) return;
    const id = setInterval(() => {
      setWaitLeft((s) => {
        if (s <= 1) { clearInterval(id); setPhase("verify"); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, waitLeft > 0]);

  async function open() {
    if (!tgId || busy) return;
    setBusy(true);
    try { await apiCall("start_task", { task_id: task.id }); } catch { /* best effort */ }
    if (task.link) openLink(task.link);
    if (isChannel) setPhase("verify");
    else { setWaitLeft(10); setPhase("wait"); }
    setBusy(false);
  }

  async function verify() {
    if (!tgId || busy) return;
    setBusy(true);
    try {
      const res = await apiCall<{ ok: boolean; reason?: string }>("verify_task", { task_id: task.id });
      if (!res.ok) {
        const map: Record<string, string> = {
          already: t("task.alreadyDone"),
          not_member: t("task.notMember"),
          bot_not_in_channel: t("task.botMissing"),
          too_soon: t("task.tooSoon"),
          limit: t("task.dailyLimit"),
        };
        toast.error(map[res.reason || ""] || t("common.error"));
        return;
      }
      haptic("success");
      toast.success(`+${task.reward_usdt ?? 0.01} USDT`);
      qc.invalidateQueries({ queryKey: ["tc", tgId] });
      qc.invalidateQueries({ queryKey: ["exclusive"] });
      qc.invalidateQueries({ queryKey: ["user", tgId] });
    } catch (e: any) { toast.error(e?.message ?? t("common.error")); }
    finally { setBusy(false); }
  }

  return (
    <li className="rounded-2xl bg-gradient-card p-4 shadow-elegant">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{task.title}</div>
          {task.description && <div className="mt-0.5 text-xs text-muted-foreground">{task.description}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-primary-glow">+{task.reward_usdt} USDT</span>
            <span className="text-muted-foreground">{task.completions_count ?? 0}/{task.max_completions ?? "∞"}</span>
            {isChannel && task.bot_check_status !== "ok" && (
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">Bot not added</span>
            )}
          </div>
        </div>
        {done ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-earn" />
        ) : isMine ? (
          <span className="shrink-0 rounded-full bg-surface-1/60 px-3 py-1.5 text-[10px] text-muted-foreground">Yours</span>
        ) : phase === "open" ? (
          <button disabled={busy} onClick={open}
            className="shrink-0 rounded-full bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-elegant disabled:opacity-60">
            <span className="flex items-center gap-1">{t("task.open")} <ExternalLink className="h-3 w-3" /></span>
          </button>
        ) : phase === "wait" ? (
          <div className="shrink-0 rounded-full bg-surface-1/60 px-3 py-1.5 text-xs font-semibold text-warning">{waitLeft}s</div>
        ) : (
          <button disabled={busy} onClick={verify}
            className="shrink-0 rounded-full bg-gradient-earn px-3 py-1.5 text-xs font-bold text-earn-foreground shadow-earn disabled:opacity-60">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("task.verify")}
          </button>
        )}
      </div>
    </li>
  );
}

function Input({ v, onChange, ph }: { v: string; onChange: (v: string) => void; ph: string }) {
  return (
    <input value={v} onChange={(e) => onChange(e.target.value)} placeholder={ph}
      className="w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary" />
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="rounded-2xl bg-gradient-card p-8 text-center text-sm text-muted-foreground">{msg}</div>;
}

// silence unused import in some builds
void useMemo;
