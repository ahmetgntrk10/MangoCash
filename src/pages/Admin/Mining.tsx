import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { apiCall } from "@/lib/api";

type Row = { tg_id: number; note: string | null; created_at: string };

export default function AdminMining() {
  const qc = useQueryClient();
  const [tg, setTg] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["adm_mining_boost"],
    queryFn: async () => (await apiCall<{ data: Row[] }>("admin_list_mining_boost")).data ?? [],
    staleTime: 30_000,
  });

  async function add() {
    if (busy || !/^\d+$/.test(tg)) { toast.error("Enter a numeric Telegram ID"); return; }
    setBusy(true);
    try {
      await apiCall("admin_add_mining_boost", { tg_id: Number(tg), note: note || null });
      setTg(""); setNote("");
      qc.invalidateQueries({ queryKey: ["adm_mining_boost"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  async function remove(id: number) {
    try { await apiCall("admin_remove_mining_boost", { tg_id: id });
      qc.invalidateQueries({ queryKey: ["adm_mining_boost"] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-gradient-card p-3 shadow-elegant">
        <div className="text-sm font-semibold">Mining boost whitelist</div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Listed users can extend their active mining session by +1 hour per
          rewarded ad (max 6h). Regular users get the standard 1h session only.
        </div>
        <div className="mt-3 flex gap-2">
          <input value={tg} onChange={(e) => setTg(e.target.value)} placeholder="Telegram ID"
            className="flex-1 rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
            className="flex-1 rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary" />
          <button disabled={busy} onClick={add}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </button>
        </div>
      </div>

      <ul className="space-y-1.5">
        {!data?.length && <li className="rounded-xl bg-surface-1/40 p-4 text-center text-xs text-muted-foreground">No boost users yet</li>}
        {data?.map((r) => (
          <li key={r.tg_id} className="flex items-center gap-2 rounded-xl bg-surface-1/40 px-3 py-2 text-xs">
            <div className="flex-1">
              <div className="font-semibold">{r.tg_id}</div>
              <div className="text-muted-foreground">{r.note ?? "—"}</div>
            </div>
            <button onClick={() => remove(r.tg_id)} className="rounded-lg bg-destructive/20 p-1.5 text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}