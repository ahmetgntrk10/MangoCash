import { useState } from "react";
import { useQuery, keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { Search, ChevronLeft, ChevronRight, Ban, ShieldCheck, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { apiCall } from "@/lib/api";

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [balanceDelta, setBalanceDelta] = useState<string>("");
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["adm-users", q, page],
    queryFn: async () => apiCall<{ data: any[]; total: number; active_today: number }>("admin_list_users", { q, page, page_size: 200 }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const users = data?.data ?? [];
  const total = data?.total ?? 0;
  const activeToday = (data as any)?.active_today ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 200));

  async function toggleBan(u: any) {
    if (!u || busy) return;
    const banning = u.status !== "banned";
    setBusy("ban");
    try {
      const r = await apiCall<{ ok?: boolean; error?: string; user?: any }>("admin_set_ban", {
        tg_id: u.tg_id, banned: banning,
      });
      if (r?.error) { toast.error(r.error); return; }
      toast.success(banning ? "User banned" : "Ban lifted");
      setSelected({ ...u, status: banning ? "banned" : "active" });
      qc.invalidateQueries({ queryKey: ["adm-users"] });
    } finally { setBusy(null); }
  }

  async function adjustBalance(u: any, delta: number) {
    if (!u || busy || !Number.isFinite(delta) || delta === 0) return;
    setBusy("bal");
    try {
      const r = await apiCall<{ ok?: boolean; error?: string; balance_cloud?: number }>("admin_adjust_balance", {
        tg_id: u.tg_id, delta,
      });
      if (r?.error) { toast.error(r.error); return; }
      toast.success(`Balance ${delta > 0 ? "+" : ""}${delta} ☁️`);
      setSelected({ ...u, balance_cloud: r.balance_cloud ?? u.balance_cloud });
      setBalanceDelta("");
      qc.invalidateQueries({ queryKey: ["adm-users"] });
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
        <Search className="h-4 w-4 text-white/40" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by username or User ID"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/40" />
      </div>
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>
          {total} users · <span className="text-emerald-400 font-semibold">{activeToday} active today</span> · page {page}/{totalPages}
        </span>
        <div className="flex gap-1">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg bg-white/5 p-1.5 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg bg-white/5 p-1.5 disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <ul className="space-y-2">
        {users?.map((u: any) => (
          <li key={u.tg_id}>
            <button onClick={() => setSelected(u)}
              className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-3 text-left ring-1 ring-white/10">
              {u.photo_url ? <img src={u.photo_url} className="h-9 w-9 rounded-full" /> : <div className="grid h-9 w-9 place-items-center rounded-full bg-white/10">{(u.first_name ?? "?")[0]}</div>}
              <div className="flex-1">
                <div className="text-sm">{u.first_name} @{u.username ?? "—"}</div>
                <div className="text-[10px] text-white/40">{u.tg_id} • {u.balance_cloud} ☁️</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-3" onClick={() => setSelected(null)}>
          <div className="mx-auto w-full max-w-md rounded-3xl bg-[#141a30] p-5 ring-1 ring-white/10 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">{selected.first_name} @{selected.username}</h3>

            <div className="mt-3 flex gap-2">
              <button disabled={busy === "ban"} onClick={() => toggleBan(selected)}
                className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold ${
                  selected.status === "banned"
                    ? "bg-emerald-600/80 text-white"
                    : "bg-red-600/80 text-white"
                } disabled:opacity-50`}>
                {selected.status === "banned" ? <><ShieldCheck className="h-3.5 w-3.5" /> Unban</> : <><Ban className="h-3.5 w-3.5" /> Ban</>}
              </button>
            </div>

            <div className="mt-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-white/50">Adjust ☁️ Balance</div>
              <div className="flex gap-2">
                <input
                  type="number" inputMode="numeric" value={balanceDelta}
                  onChange={(e) => setBalanceDelta(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 rounded-lg bg-black/40 px-2 py-1.5 text-sm outline-none ring-1 ring-white/10"
                />
                <button disabled={busy === "bal" || !balanceDelta}
                  onClick={() => adjustBalance(selected, Math.abs(Number(balanceDelta) || 0))}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600/80 px-3 text-xs font-semibold disabled:opacity-40">
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
                <button disabled={busy === "bal" || !balanceDelta}
                  onClick={() => adjustBalance(selected, -Math.abs(Number(balanceDelta) || 0))}
                  className="flex items-center gap-1 rounded-lg bg-red-600/80 px-3 text-xs font-semibold disabled:opacity-40">
                  <Minus className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>

            <dl className="mt-3 space-y-1 text-xs">
              {Object.entries({
                "Telegram ID": selected.tg_id, "Username": selected.username,
                "Balance ☁️": selected.balance_cloud, "Balance USDT": selected.balance_usdt,
                "Total Earned": selected.total_earned_cloud, "Ref Earnings": selected.ref_earnings_cloud,
                "Referral Count": selected.referral_count, "Referred By": selected.referred_by,
                "IP": selected.ip_address, "Country": selected.country,
                "Status": selected.status, "Warnings": selected.warnings_count,
              }).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-white/5 py-1">
                  <span className="text-white/50">{k}</span><span>{String(v ?? "—")}</span>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}