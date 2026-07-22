import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiCall } from "@/lib/api";

export default function AdminAdmins() {
  const qc = useQueryClient();
  const [tgId, setTgId] = useState("");
  const [username, setUsername] = useState("");

  const { data: admins } = useQuery({
    queryKey: ["adm-admins"],
    queryFn: async () => (await apiCall<{ data: any[] }>("admin_list_admins")).data ?? [],
  });

  async function add() {
    if (!tgId) return;
    try {
      await apiCall("admin_add_admin", { tg_id: Number(tgId), username });
      toast.success("Added"); setTgId(""); setUsername("");
      qc.invalidateQueries({ queryKey: ["adm-admins"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(id: number) {
    await apiCall("admin_remove_admin", { tg_id: id });
    qc.invalidateQueries({ queryKey: ["adm-admins"] });
  }
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <input className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none" placeholder="Telegram ID" value={tgId} onChange={(e) => setTgId(e.target.value)} />
        <input className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none" placeholder="Username (optional)" value={username} onChange={(e) => setUsername(e.target.value)} />
        <button onClick={add} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Add Admin</button>
      </div>
      <ul className="space-y-2">
        {admins?.map((a: any) => (
          <li key={a.tg_id} className="flex items-center justify-between rounded-xl bg-white/5 p-3 text-sm ring-1 ring-white/10">
            <div><div>@{a.username ?? "—"}</div><div className="text-[10px] text-white/40">{a.tg_id}</div></div>
            <button onClick={() => remove(a.tg_id)} className="rounded-lg bg-rose-500/20 p-1.5"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}