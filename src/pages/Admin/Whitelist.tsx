import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { apiCall } from "@/lib/api";

type Row = { tg_id: number; note: string | null; created_at: string };

export default function AdminWhitelist() {
  const qc = useQueryClient();
  const [tg, setTg] = useState("");
  const [note, setNote] = useState("");
  const { data: list } = useQuery({
    queryKey: ["adm-whitelist"],
    queryFn: async () => (await apiCall<{ data: Row[] }>("admin_list_whitelist")).data ?? [],
  });

  async function add() {
    const id = Number(tg.trim());
    if (!id) { toast.error("Telegram user ID required"); return; }
    try {
      await apiCall("admin_add_whitelist", { tg_id: id, note });
      toast.success("Added");
      setTg(""); setNote("");
      qc.invalidateQueries({ queryKey: ["adm-whitelist"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function del(id: number) {
    if (!confirm(`Remove ${id} from whitelist?`)) return;
    await apiCall("admin_remove_whitelist", { tg_id: id });
    qc.invalidateQueries({ queryKey: ["adm-whitelist"] });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-gradient-card p-4 shadow-elegant">
        <div className="text-xs text-muted-foreground">
          Bu listedeki Telegram ID'ler birden-fazla-hesap kontrolünden muaftır. Aynı cihazdan giriş yapmaya çalışsalar bile engellenmezler.
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <input
            value={tg} onChange={(e) => setTg(e.target.value)} placeholder="Telegram user ID"
            className="col-span-1 rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
            className="col-span-2 rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <button onClick={add} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-2 text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> Add to Whitelist
        </button>
      </div>
      <ul className="space-y-1.5">
        {list?.map((r) => (
          <li key={r.tg_id} className="flex items-center justify-between rounded-xl bg-gradient-card p-3 text-xs shadow-elegant">
            <div className="min-w-0">
              <div className="text-sm font-semibold tabular-nums">{r.tg_id}</div>
              {r.note && <div className="text-muted-foreground">{r.note}</div>}
            </div>
            <button onClick={() => del(r.tg_id)} className="rounded-lg bg-destructive/20 p-1.5 text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {!list?.length && <li className="rounded-2xl bg-gradient-card p-6 text-center text-sm text-muted-foreground">Whitelist is empty</li>}
      </ul>
    </div>
  );
}