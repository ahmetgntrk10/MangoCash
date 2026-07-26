import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  Wallet, Send, ArrowRightLeft, History, Megaphone, Ticket, LifeBuoy,
  Globe, ChevronRight, MapPin, Loader2, BellRing,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useUser } from "@/hooks/useUser";
import { apiCall, requestAdTicket } from "@/lib/api";
import { openLink, formatUsdt, haptic, CLOUD_TO_USDT as MANGO_TO_USDT } from "@/lib/telegram";
import { SUPPORTED_LANGS } from "@/lib/i18n";
import i18n from "@/lib/i18n";
import { CHANNELS, WITHDRAW, REF_MIN_FOR_WITHDRAW } from "@/lib/config";
import { showAdsgramRewarded, showAdsgramInterstitial, ADSGRAM_REWARD_BLOCK, ADSGRAM_INT_FORCE } from "@/lib/ads";
import { showRewardedChain } from "@/lib/ads/chain";
import { useAdGate } from "@/components/ads/AdGate";

type Sheet = null | "address" | "convert" | "withdraw" | "history" | "promo" | "lang";

export default function ProfilePage({ tgId }: { tgId: number | null }) {
  const { t } = useTranslation();
  const { data: user } = useUser(tgId);
  const [sheet, setSheet] = useState<Sheet>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 pt-4">
        {user?.photo_url ? (
          <img src={user.photo_url} alt="" className="h-24 w-24 rounded-full ring-2 ring-primary-glow/50 shadow-glow" />
        ) : (
          <div className="grid h-24 w-24 place-items-center rounded-full bg-gradient-primary text-3xl shadow-glow">
            {(user?.first_name ?? "?")[0]}
          </div>
        )}
        <div className="font-display text-lg font-bold">{user?.first_name ?? "User"} {user?.last_name ?? ""}</div>
        <div className="text-xs text-muted-foreground">@{user?.username ?? "—"}</div>
        {(user as any)?.country && <div className="text-[10px] text-muted-foreground">{(user as any).country}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-gradient-card p-4 shadow-elegant">
          <div className="text-[10px] uppercase text-muted-foreground">MANGO</div>
          <div className="mt-1 text-xl font-bold">{user?.balance_cloud ?? 0} 🥭</div>
        </div>
        <div className="rounded-2xl bg-gradient-card p-4 shadow-elegant">
          <div className="text-[10px] uppercase text-muted-foreground">USDT</div>
          <div className="mt-1 text-xl font-bold text-earn">{formatUsdt(Number(user?.balance_usdt ?? 0))}</div>
        </div>
      </div>

      <Section label={t("profile.finance")}>
        <Row icon={MapPin} label={t("common.setAddress")} onClick={() => setSheet("address")} />
        <Row icon={Send} label={t("common.withdraw")} onClick={() => setSheet("withdraw")} />
        <Row icon={ArrowRightLeft} label={t("common.convert")} onClick={() => setSheet("convert")} />
        <Row icon={History} label={t("profile.txHistory")} onClick={() => setSheet("history")} />
      </Section>

      <Section label={t("profile.community")}>
        <Row icon={Megaphone} label={t("profile.officialChannel")} onClick={() => openLink(CHANNELS.official)} />
        <Row icon={Wallet} label={t("profile.paymentsChannel")} onClick={() => openLink(CHANNELS.payments)} />
      </Section>

      <Section label={t("profile.settings")}>
        <Row icon={Ticket} label={t("profile.promoCode")} onClick={() => setSheet("promo")} />
        <Row icon={LifeBuoy} label={t("profile.support")} onClick={() => openLink("https://t.me/ahmetgntrk")} />
        <Row icon={Globe} label={t("profile.language")} onClick={() => setSheet("lang")} />
        <NotifyMarketRow user={user} />
      </Section>

      {sheet && (
        <Sheet onClose={() => setSheet(null)}>
          {sheet === "address" && <AddressForm user={user} onClose={() => setSheet(null)} />}
          {sheet === "convert" && <ConvertForm user={user} onClose={() => setSheet(null)} />}
          {sheet === "withdraw" && <WithdrawForm user={user} onClose={() => setSheet(null)} />}
          {sheet === "history" && <HistoryView tgId={tgId} />}
          {sheet === "promo" && <PromoForm tgId={tgId} onClose={() => setSheet(null)} />}
          {sheet === "lang" && <LangPicker onClose={() => setSheet(null)} />}
        </Sheet>
      )}
    </div>
  );
}

function Section({ label, children }: any) {
  return (
    <div>
      <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="overflow-hidden rounded-2xl bg-gradient-card shadow-elegant">{children}</div>
    </div>
  );
}
function Row({ icon: Icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0">
      <Icon className="h-4 w-4 text-primary-glow" />
      <span className="flex-1 text-sm">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function NotifyMarketRow({ user }: any) {
  const qc = useQueryClient();
  const [on, setOn] = useState<boolean>(!!user?.notify_market);
  useEffect(() => { setOn(!!user?.notify_market); }, [user?.notify_market]);
  async function toggle() {
    const next = !on;
    setOn(next);
    try {
      await apiCall("set_notify_market", { on: next });
      qc.invalidateQueries({ queryKey: ["user"] });
    } catch (e: any) {
      setOn(!next);
      toast.error(e?.message ?? "Failed");
    }
  }
  return (
    <div className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0">
      <BellRing className="h-4 w-4 text-primary-glow" />
      <div className="min-w-0 flex-1">
        <div className="text-sm">Mango Market Claim Alerts</div>
        <div className="text-[10px] text-muted-foreground">Get a Telegram DM when your Mangos are ready to claim.</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          on ? "bg-gradient-earn" : "bg-surface-2"
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
function Sheet({ children, onClose }: any) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-3 backdrop-blur-md" onClick={onClose}>
      <motion.div initial={{ y: 50 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()}
        className="glass-strong w-full max-w-md rounded-3xl p-5 shadow-glow">
        {children}
      </motion.div>
    </motion.div>
  );
}

function AddressForm({ user, onClose }: any) {
  const qc = useQueryClient();
  const [binance, setBinance] = useState(user?.binance_uid ?? "");
  const [faucetpay, setFaucetpay] = useState(user?.faucetpay_address ?? "");
  const [toncoin, setToncoin] = useState(user?.ton_address ?? "");
  async function save() {
    try {
      await apiCall("update_profile", {
        binance_uid: binance,
        faucetpay_address: faucetpay,
        ton_address: toncoin,
      });
      toast.success("Saved"); qc.invalidateQueries({ queryKey: ["user"] }); onClose();
    } catch (e: any) { toast.error(e.message); }
  }
  return (
    <div className="space-y-3">
      <h3 className="font-display text-base font-bold">Set Withdrawal Addresses</h3>
      <Field label="Binance UID"><input className="w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary" value={binance} onChange={(e) => setBinance(e.target.value)} placeholder="123456789" /></Field>
      <Field label="FaucetPay Email or Address"><input className="w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary" value={faucetpay} onChange={(e) => setFaucetpay(e.target.value)} placeholder="email@example.com" /></Field>
      <Field label="Gram Address (TON native)">
        <input
          className="w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary"
          value={toncoin}
          onChange={(e) => setToncoin(e.target.value)}
          placeholder="UQ... / EQ..."
        />
        <div className="mt-1 text-[10px] text-warning">
          ⚠️ Only a native Gram (TON) address. Do NOT paste a USDT (TON network / Jetton) address — funds will be lost.
        </div>
      </Field>
      <button onClick={save} className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant">Save</button>
    </div>
  );
}

function ConvertForm({ user, onClose }: any) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const mango = Number(amount) || 0;
  const usdt = mango * MANGO_TO_USDT;
  async function go() {
    if (!user) return;
    if (mango <= 0 || mango > user.balance_cloud) { toast.error("Invalid amount"); return; }
    try {
      await apiCall("convert_cloud", { cloud: mango });
      haptic("success"); toast.success(`+${formatUsdt(usdt)} USDT`);
      qc.invalidateQueries({ queryKey: ["user"] }); onClose();
    } catch (e: any) { toast.error(e.message); }
  }
  return (
    <div className="space-y-3">
      <h3 className="font-display text-base font-bold">Convert 🥭 → USDT</h3>
      <div className="text-xs text-muted-foreground">Rate: 1 🥭 = {MANGO_TO_USDT} USDT • Balance: {user?.balance_cloud ?? 0} 🥭</div>
      <input type="number" className="w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount in 🥭" />
      <div className="text-sm text-earn">= {formatUsdt(usdt)} USDT</div>
      <button onClick={go} className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground">Convert</button>
    </div>
  );
}

function WithdrawForm({ user, onClose }: any) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { showClosedEarly } = useAdGate();
  const [method, setMethod] = useState<"faucetpay" | "binance" | "toncoin">("faucetpay");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const amt = Number(amount) || 0;
  const cfg = WITHDRAW[method];
  const fee = useMemo(() => amt * cfg.fee, [amt, cfg.fee]);
  const net = Math.max(0, amt - fee);

  const refs = Number((user as any)?.referral_count ?? 0);
  const needRefs = refs < REF_MIN_FOR_WITHDRAW;

  // Gate: when user doesn't have enough referrals, show ONLY the progress card.
  if (needRefs) {
    const pct = Math.min(100, Math.round((refs / REF_MIN_FOR_WITHDRAW) * 100));
    return (
      <div className="space-y-4">
        <h3 className="font-display text-base font-bold">{t("withdraw.title")}</h3>
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-center">
          <div className="text-2xl">🔒</div>
          <div className="mt-2 text-sm font-semibold text-warning">
            {t("profile.needRefs", { n: REF_MIN_FOR_WITHDRAW })}
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2/60">
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6 }}
              className="h-full bg-gradient-primary"
            />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {refs}/{REF_MIN_FOR_WITHDRAW}
          </div>
        </div>
        <button onClick={onClose} className="w-full rounded-xl bg-surface-1/60 py-2.5 text-sm text-muted-foreground">
          {t("common.close")}
        </button>
      </div>
    );
  }

  async function go() {
    if (!user || busy) return;
    if (amt <= 0 || amt > Number(user.balance_usdt)) { toast.error("Invalid amount"); return; }
    if (amt < cfg.min) { toast.error(t("profile.minWithdraw", { n: cfg.min })); return; }
    const dest =
      method === "faucetpay" ? user.faucetpay_address :
      method === "toncoin" ? user.ton_address :
      user.binance_uid;
    if (!dest) { toast.error("Address missing — set it first"); return; }
    setBusy(true);
    try {
      // Withdraw ad chain: Adsgram Rewarded → RichAds → Monetag.
      const ticket = await requestAdTicket("withdraw");
      if (!ticket) { toast.error(t("common.error")); return; }
      const ad = await showRewardedChain();
      if (!ad.ok) {
        if (ad.reason === "no-fill") toast.error(t("common.noAd"));
        else showClosedEarly();
        return;
      }
      await apiCall("request_withdrawal", { method, amount: amt, ad_ticket_id: ticket });
      haptic("success"); toast.success("Withdrawal requested");
      qc.invalidateQueries({ queryKey: ["user"] }); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-display text-base font-bold">{t("withdraw.title")}</h3>
      <div className="text-xs text-muted-foreground">Balance: {formatUsdt(Number(user?.balance_usdt ?? 0))} USDT</div>
      <div className="flex gap-2">
        {(["faucetpay", "binance", "toncoin"] as const).map((m) => (
          <button key={m} onClick={() => setMethod(m)}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold ${method === m
              ? "bg-gradient-primary text-primary-foreground shadow-elegant"
              : "bg-surface-1/60 text-muted-foreground"
            }`}>
            {WITHDRAW[m].label}
          </button>
        ))}
      </div>
      {method === "toncoin" && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-2.5 text-[11px] leading-relaxed text-destructive">
          ⚠️ Please provide a <b>Gram (TON native)</b> address only.
          Do <b>NOT</b> use a <b>USDT (TON network / Jetton)</b> address — your funds will be lost and cannot be refunded.
        </div>
      )}
      <input type="number" inputMode="decimal" className="w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`USDT amount (min ${cfg.min})`} />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-border bg-surface-1/40 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">{t("profile.feeLabel")} ({(cfg.fee * 100).toFixed(0)}%)</div>
          <div className="mt-0.5 font-semibold text-warning">−{formatUsdt(fee)} USDT</div>
        </div>
        <div className="rounded-xl border border-earn/30 bg-earn/10 p-2">
          <div className="text-[10px] uppercase text-earn/80">{t("profile.netLabel")}</div>
          <div className="mt-0.5 font-semibold text-earn">{formatUsdt(net)} USDT</div>
        </div>
      </div>
      <button disabled={busy} onClick={go} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("withdraw.submit")}
      </button>
      <div className="text-[10px] text-muted-foreground">{t("withdraw.confirmAd")}</div>
    </div>
  );
}

function HistoryView({ tgId }: { tgId: number | null }) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { (async () => {
    if (!tgId) return;
    try {
      const res = await apiCall<{ withdrawals: any[]; conversions: any[] }>("list_history");
      const merged = [
        ...(res.withdrawals ?? []).map((x: any) => ({ ...x, kind: "withdraw" })),
        ...(res.conversions ?? []).map((x: any) => ({ ...x, kind: "convert" })),
      ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      setItems(merged);
    } catch (e: any) { toast.error(e.message); }
  })(); }, [tgId]);
  return (
    <div className="space-y-2">
      <h3 className="font-display text-base font-bold">History</h3>
      <div className="max-h-80 space-y-2 overflow-auto">
        {items.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">No history</div>}
        {items.map((it, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface-1/40 p-3 text-xs">
            <div className="flex justify-between">
              <span className="font-semibold">{it.kind === "withdraw" ? `Withdraw ${it.method?.toUpperCase()}` : "Convert 🥭→USDT"}</span>
              <span className="text-muted-foreground">{new Date(it.created_at).toLocaleString()}</span>
            </div>
            <div className="mt-1 text-primary-glow">
              {it.kind === "withdraw"
                ? `${formatUsdt(Number(it.amount_usdt))} USDT (${it.status})`
                : `${it.cloud_amount} ☁️ → ${formatUsdt(Number(it.usdt_amount))} USDT`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PromoForm({ tgId, onClose }: any) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { showClosedEarly } = useAdGate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [conds, setConds] = useState<any[] | null>(null);

  async function check() {
    if (!tgId || !code) return;
    try {
      const pre = await apiCall<{ ok: boolean; reason?: string; conditions?: any[] }>("promo_check", { code });
      setConds(pre.conditions ?? []);
      if (!pre.ok && pre.reason && pre.reason !== "conditions_unmet") {
        toast.error(pre.reason);
      }
    } catch (e: any) { toast.error(e.message); }
  }

  async function redeem() {
    if (!tgId || !code || busy) return;
    setBusy(true);
    try {
      // Pre-check + condition evaluation before we even show the ad.
      const pre = await apiCall<{ ok: boolean; reason?: string; conditions?: any[] }>("promo_check", { code });
      setConds(pre.conditions ?? []);
      if (!pre.ok) {
        toast.error(pre.reason === "conditions_unmet" ? "Complete the conditions first" : (pre.reason || "Invalid code"));
        return;
      }

      const ticket = await requestAdTicket("promo");
      if (!ticket) { toast.error(t("common.error")); return; }
      // Mandatory Adsgram ad with click verification — randomly Rewarded or Interstitial.
      const useInterstitial = Math.random() < 0.5;
      const ad = useInterstitial
        ? await showAdsgramInterstitial(ADSGRAM_INT_FORCE)
        : await showAdsgramRewarded(ADSGRAM_REWARD_BLOCK);
      if (!ad.ok) {
        if (ad.reason === "no-fill") toast.error(t("common.noAd"));
        else showClosedEarly();
        return;
      }
      const res = await apiCall<{ reward: number }>("redeem_promo", { code, ad_ticket_id: ticket });
      toast.success(`+${res.reward}`); qc.invalidateQueries({ queryKey: ["user"] }); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  const allOk = !conds || conds.every((c) => c.ok);

  return (
    <div className="space-y-3">
      <h3 className="font-display text-base font-bold">{t("promo.enter")}</h3>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm uppercase outline-none focus:border-primary"
          value={code}
          onChange={(e) => { setCode(e.target.value); setConds(null); }}
          placeholder="TODAY"
        />
        <button onClick={check} className="rounded-xl border border-border bg-surface-2/60 px-3 text-xs font-semibold">Check</button>
      </div>
      {conds && conds.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-border bg-surface-2/40 p-2">
          {conds.map((c, i) => (
            <li key={i} className={`flex items-center justify-between text-[11px] ${c.ok ? "text-earn" : "text-muted-foreground"}`}>
              <span>{c.ok ? "✓" : "•"} {c.label}</span>
              <span className="font-mono">{c.current}/{c.target}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="text-[10px] text-muted-foreground">{t("promo.needAd")}</div>
      <button disabled={busy || !allOk} onClick={redeem} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t("promo.redeem")}
      </button>
    </div>
  );
}

function LangPicker({ onClose }: any) {
  const qc = useQueryClient();
  async function pick(code: string) {
    i18n.changeLanguage(code);
    localStorage.setItem("cloudearn_lang", code);
    try { await apiCall("update_profile", { language_code: code }); } catch { /* offline-safe */ }
    qc.invalidateQueries({ queryKey: ["user"] });
    onClose();
  }
  return (
    <div className="space-y-2">
      <h3 className="font-display text-base font-bold">Language</h3>
      <div className="max-h-80 overflow-auto">
        {SUPPORTED_LANGS.map((l) => (
          <button key={l.code} onClick={() => pick(l.code)}
            className="flex w-full items-center justify-between border-b border-border py-3 text-sm last:border-0">
            <span>{l.label}</span><span className="text-muted-foreground">{l.code}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: any) { return <div><div className="mb-1 text-[10px] uppercase text-muted-foreground">{label}</div>{children}</div>; }
