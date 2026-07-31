import { useRef, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Check, X, Copy, Zap, Loader2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { apiCall } from "@/lib/api";
import { formatUsdt } from "@/lib/telegram";

const TABS = ["faucetpay", "binance", "toncoin", "history"] as const;
type TabKey = typeof TABS[number];

export default function AdminPayments() {
  const [tab, setTab] = useState<TabKey>("faucetpay");

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-2xl bg-surface-1/60 p-1 ring-1 ring-border">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-1.5 text-xs font-medium transition ${
              tab === t ? "bg-gradient-primary text-primary-foreground shadow-elegant" : "text-muted-foreground"
            }`}>
            {t === "faucetpay" ? "FaucetPay" : t === "binance" ? "Binance" : t === "toncoin" ? "Toncoin" : "History"}
          </button>
        ))}
      </div>
      {tab === "faucetpay" && <PendingList method="faucetpay" showBulk />}
      {tab === "binance" && <PendingList method="binance" />}
      {tab === "toncoin" && <PendingList method="toncoin" />}
      {tab === "history" && <HistoryList />}
    </div>
  );
}

function PendingList({ method, showBulk }: { method: "faucetpay" | "binance" | "toncoin"; showBulk?: boolean }) {
  const qc = useQueryClient();
  const [bulking, setBulking] = useState(false);
  const inflight = useRef<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const { data: items } = useQuery({
    queryKey: ["adm-wd", method, "pending"],
    queryFn: async () => (await apiCall<{ data: any[] }>("admin_pending_withdrawals", { method })).data ?? [],
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  async function setStatus(id: string, status: "approved" | "rejected", extras?: { tx_id?: string }) {
    if (inflight.current.has(id)) return;
    inflight.current.add(id);
    setBusyIds(new Set(inflight.current));
    try {
      await apiCall("admin_set_withdrawal_status", { id, status, ...(extras?.tx_id ? { tx_id: extras.tx_id } : {}) });
      qc.invalidateQueries({ queryKey: ["adm-wd"] });
      qc.invalidateQueries({ queryKey: ["adm-wd-history"] });
    } catch (e: any) {
      if (/already_processed/i.test(e?.message ?? "")) toast.error("Already processed");
      else if (/tx_id_required/i.test(e?.message ?? "")) toast.error("TxId required to approve");
      else toast.error(e.message);
    } finally {
      inflight.current.delete(id);
      setBusyIds(new Set(inflight.current));
    }
  }

  async function bulkPay() {
    setBulking(true);
    try {
      const r = await apiCall<{ enqueued: number }>("admin_enqueue_faucetpay_payouts");
      toast.success(`Queued ${r.enqueued} payout(s) — FaucetPay worker will process them in the background.`);
      qc.invalidateQueries({ queryKey: ["adm-wd"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBulking(false); }
  }

  // FaucetPay ve Toncoin sekmelerinde bekleyen taleplerin toplam net tutarı.
  const totalNet = (items ?? []).reduce(
    (sum: number, it: any) => sum + Number(it.amount_net_usdt ?? (Number(it.amount_usdt) - Number(it.fee_usdt ?? 0))),
    0,
  );

  return (
    <div className="space-y-2">
      {(method === "faucetpay" || method === "toncoin") && !!items?.length && (
        <div className="flex items-center justify-between rounded-2xl bg-surface-1/60 px-3 py-2 text-xs ring-1 ring-border">
          <span className="text-muted-foreground">{items.length} pending request{items.length > 1 ? "s" : ""}</span>
          <span className="font-semibold text-earn">Total: {formatUsdt(totalNet)}</span>
        </div>
      )}
      {showBulk && (
        <button disabled={bulking || !(items?.length)} onClick={bulkPay}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-earn py-2.5 text-sm font-bold text-earn-foreground shadow-earn disabled:opacity-50">
          {bulking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Bulk Pay All ({items?.length ?? 0})
        </button>
      )}
      {!items?.length && (
        <div className="rounded-2xl bg-gradient-card p-6 text-center text-sm text-muted-foreground">No pending</div>
      )}
      {items?.map((it: any) => (
        <Card key={it.id} it={it} method={method} setStatus={setStatus} busy={busyIds.has(it.id)} />
      ))}
    </div>
  );
}

function useTonUsd() {
  return useQuery({
    queryKey: ["ton-usd"],
    queryFn: async () => {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd");
      const j = await r.json();
      return Number(j?.["the-open-network"]?.usd) || 0;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

function Card({ it, method, setStatus, busy }: { it: any; method: "faucetpay" | "binance" | "toncoin"; setStatus: (id: string, s: "approved" | "rejected", extras?: { tx_id?: string }) => void; busy?: boolean }) {
  const fee = Number(it.fee_usdt ?? 0);
  const net = Number(it.amount_net_usdt ?? (Number(it.amount_usdt) - fee));
  const gross = Number(it.amount_usdt);
  const isTon = method === "toncoin";
  const { data: tonUsdRaw } = useTonUsd();
  const tonUsd = isTon ? (tonUsdRaw ?? 0) : 0;
  const tonAmount = isTon && tonUsd ? net / tonUsd : 0;
  const [txId, setTxId] = useState<string>(it.tx_id ?? "");
  const [note, setNote] = useState<string>(it.admin_note ?? "");
  const saveTimer = useRef<any>(null);
  function scheduleSave(patch: { tx_id?: string; admin_note?: string }) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await apiCall("admin_update_withdrawal_note", { id: it.id, ...patch }); } catch { /* ignore */ }
    }, 500);
  }
  return (
    <div className="rounded-2xl bg-gradient-card p-3 text-xs shadow-elegant">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            @{it.users?.username ?? "—"} <span className="text-muted-foreground">({it.user_tg_id})</span>
          </div>
          <div className="mt-0.5 text-muted-foreground">
            {it.users?.country ?? "—"} • {new Date(it.created_at).toLocaleString()}
          </div>
          <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground">
            <span>Mango: <span className="text-foreground">{Number(it.users?.balance_cloud ?? 0).toLocaleString()}</span></span>
            <span>·</span>
            <span>USDT: <span className="text-foreground">{formatUsdt(Number(it.users?.balance_usdt ?? 0))}</span></span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg border border-border bg-surface-1/40 p-1.5">
              <div className="text-[9px] uppercase text-muted-foreground">Gross</div>
              <div className="font-semibold">{formatUsdt(gross)}</div>
            </div>
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-1.5">
              <div className="text-[9px] uppercase text-warning">Fee</div>
              <div className="font-semibold text-warning">{formatUsdt(fee)}</div>
            </div>
            <div className="rounded-lg border border-earn/30 bg-earn/10 p-1.5">
              <div className="text-[9px] uppercase text-earn">Net</div>
              <div className="font-semibold text-earn">
                {isTon
                  ? (tonAmount ? `${tonAmount.toFixed(4)} TON` : "…")
                  : formatUsdt(net)}
              </div>
              {isTon && (
                <div className="text-[9px] text-muted-foreground">≈ {formatUsdt(net)} USDT</div>
              )}
            </div>
          </div>
          {method === "binance" ? (
            <button onClick={() => { navigator.clipboard.writeText(it.destination); toast.success("UID copied"); }}
              className="mt-2 flex items-center gap-1 text-muted-foreground">
              <Copy className="h-3 w-3" /> UID: {it.destination}
            </button>
          ) : method === "toncoin" ? (
            <button onClick={() => { navigator.clipboard.writeText(it.destination); toast.success("Toncoin address copied"); }}
              className="mt-2 flex w-full items-center gap-1 truncate text-muted-foreground">
              <Copy className="h-3 w-3 shrink-0" /> <span className="truncate">{it.destination}</span>
            </button>
          ) : (
            <button onClick={() => { navigator.clipboard.writeText(it.destination); toast.success("FaucetPay copied"); }}
              className="mt-2 flex items-center gap-1 truncate text-muted-foreground">
              <Copy className="h-3 w-3" /> {it.destination}
            </button>
          )}
          {isTon && (
            <div className="mt-2 space-y-1.5">
              <input
                value={txId}
                onChange={(e) => { setTxId(e.target.value); scheduleSave({ tx_id: e.target.value }); }}
                placeholder="TxId (required to approve)"
                className="w-full rounded-lg border border-border bg-surface-2/60 px-2 py-1 text-[11px] outline-none focus:border-primary"
              />
              <textarea
                value={note}
                onChange={(e) => { setNote(e.target.value); scheduleSave({ admin_note: e.target.value }); }}
                placeholder="Admin note (optional — shown in rejection reason)"
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-surface-2/60 px-2 py-1 text-[11px] outline-none focus:border-primary"
              />
            </div>
          )}
          {it.batch_status && (
            <div className="mt-1 text-[10px] text-primary-glow">Queue: {it.batch_status}</div>
          )}
          {it.last_error && (
            <div className="mt-1 flex items-start gap-1 rounded-md bg-warning/10 px-2 py-1 text-[10px] text-warning">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="break-all">{it.last_error}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            disabled={busy || (isTon && !txId.trim())}
            title={isTon && !txId.trim() ? "TxId required" : "Approve"}
            onClick={() => setStatus(it.id, "approved", isTon ? { tx_id: txId.trim() } : undefined)}
            className="rounded-lg bg-earn/20 p-1.5 text-earn disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button disabled={busy} onClick={() => setStatus(it.id, "rejected")} className="rounded-lg bg-destructive/20 p-1.5 text-destructive disabled:opacity-40">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryList() {
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    queryKey: ["adm-wd-history", page],
    queryFn: async () => apiCall<{ data: any[]; total: number }>("admin_withdrawal_history", { page, page_size: 200 }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 200));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} entries · page {page}/{totalPages}</span>
        <div className="flex gap-1">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg bg-surface-1/60 p-1.5 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg bg-surface-1/60 p-1.5 disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <ul className="space-y-2">
      {!items.length && (
        <li className="rounded-2xl bg-gradient-card p-6 text-center text-sm text-muted-foreground">Nothing yet</li>
      )}
      {items.map((it: any) => (
        <li key={it.id} className="rounded-xl bg-gradient-card p-3 text-xs shadow-elegant">
          <div className="flex justify-between">
            <span>@{it.users?.username ?? "—"} • {it.method.toUpperCase()}</span>
            <span className={it.status === "approved" ? "text-earn" : it.status === "paid" ? "text-primary-glow" : "text-destructive"}>{it.status}</span>
          </div>
          <div className="text-primary-glow">{formatUsdt(Number(it.amount_net_usdt ?? it.amount_usdt))} USDT</div>
        </li>
      ))}
      </ul>
    </div>
  );
}
