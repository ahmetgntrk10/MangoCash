import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Power, Edit2, X } from "lucide-react";
import { toast } from "sonner";
import { apiCall } from "@/lib/api";

type Cond =
  | { type: "ads_today"; network: string; min: number }
  | { type: "mining_claim_today"; min: number }
  | { type: "channel_member"; chat: string }
  | { type: "min_referrals"; min: number }
  | { type: "min_balance_cloud"; min: number }
  | { type: "bio_verified" };

const COND_LABELS: Record<string, string> = {
  ads_today: "Watch N ads today (network)",
  mining_claim_today: "Claim mining N× today",
  channel_member: "Join channel/group",
  min_referrals: "Have N referrals",
  min_balance_cloud: "Hold N 🥭 balance",
  bio_verified: "Link-in-Bio verified",
};

export default function AdminPromos() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ open: boolean; code: string; reward_amount: string; reward_type: string; max_completions: string; expires_at: string; conditions: Cond[] }>(
    { open: false, code: "", reward_amount: "1", reward_type: "usdt", max_completions: "", expires_at: "", conditions: [] },
  );
  const [editing, setEditing] = useState<any>(null);

  const { data: promos } = useQuery({
    queryKey: ["adm-promos"],
    queryFn: async () => (await apiCall<{ data: any[] }>("admin_list_promos")).data ?? [],
  });

  async function create() {
    const payload: any = {
      code: form.code.trim().toUpperCase(),
      reward_amount: Number(form.reward_amount),
      reward_type: form.reward_type,
      max_completions: form.max_completions ? Number(form.max_completions) : null,
      expires_at: form.expires_at || null,
      conditions: form.conditions,
    };
    try {
      await apiCall("admin_create_promo", { payload });
      toast.success("Promo created"); setForm({ ...form, open: false, code: "", conditions: [] });
      qc.invalidateQueries({ queryKey: ["adm-promos"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function toggle(p: any) {
    await apiCall("admin_toggle_promo", { id: p.id, is_active: !p.is_active });
    qc.invalidateQueries({ queryKey: ["adm-promos"] });
  }
  async function saveEdit() {
    try {
      await apiCall("admin_update_promo", {
        id: editing.id,
        payload: {
          code: editing.code, reward_amount: Number(editing.reward_amount),
          reward_type: editing.reward_type,
          max_completions: editing.max_completions || null,
          expires_at: editing.expires_at || null,
          conditions: Array.isArray(editing.conditions) ? editing.conditions : [],
        },
      });
      setEditing(null); qc.invalidateQueries({ queryKey: ["adm-promos"] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setForm({ ...form, open: !form.open })}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 py-2.5 text-sm font-semibold">
        <Plus className="h-4 w-4" /> Add Promo Code
      </button>
      {form.open && (
        <div className="space-y-2 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <In label="Code" v={form.code} on={(v) => setForm({ ...form, code: v })} />
          <div className="grid grid-cols-2 gap-2">
            <In label="Reward Amount" v={form.reward_amount} on={(v) => setForm({ ...form, reward_amount: v })} />
            <div><div className="mb-1 text-[10px] uppercase text-white/40">Type</div>
              <select value={form.reward_type} onChange={(e) => setForm({ ...form, reward_type: e.target.value })} className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none">
                <option value="usdt" className="bg-[#141a30]">USDT</option><option value="cloud" className="bg-[#141a30]">🥭</option>
              </select></div>
          </div>
          <In label="Max completions (optional)" v={form.max_completions} on={(v) => setForm({ ...form, max_completions: v })} />
          <In label="Expires at (ISO, optional)" v={form.expires_at} on={(v) => setForm({ ...form, expires_at: v })} />
          <CondEditor conditions={form.conditions} onChange={(conditions) => setForm({ ...form, conditions })} />
          <button onClick={create} className="w-full rounded-xl bg-sky-500 py-2 text-sm font-semibold">Create</button>
        </div>
      )}
      <ul className="space-y-2">
        {promos?.map((p: any) => (
          <li key={p.id} className={`rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 ${!p.is_active && "opacity-50"}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-sm font-bold">{p.code}</div>
                <div className="text-[10px] text-white/40">+{p.reward_amount} {p.reward_type === "usdt" ? "USDT" : "🥭"} • used {p.completions_count}/{p.max_completions ?? "∞"}</div>
                {p.expires_at && <div className="text-[10px] text-white/40">exp: {new Date(p.expires_at).toLocaleDateString()}</div>}
                {Array.isArray(p.conditions) && p.conditions.length > 0 && (
                  <div className="mt-1 text-[10px] text-sky-300/80">+{p.conditions.length} condition{p.conditions.length > 1 ? "s" : ""}</div>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggle(p)} className="rounded-lg bg-white/10 p-1.5"><Power className="h-3.5 w-3.5" /></button>
                <button onClick={() => setEditing({ ...p, conditions: Array.isArray(p.conditions) ? p.conditions : [] })} className="rounded-lg bg-white/10 p-1.5"><Edit2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-3" onClick={() => setEditing(null)}>
          <div className="mx-auto w-full max-w-md max-h-[90vh] space-y-2 overflow-y-auto rounded-3xl bg-[#141a30] p-5 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">Edit Promo</h3>
            <In label="Code" v={editing.code} on={(v) => setEditing({ ...editing, code: v })} />
            <In label="Reward" v={String(editing.reward_amount)} on={(v) => setEditing({ ...editing, reward_amount: v })} />
            <In label="Max" v={String(editing.max_completions ?? "")} on={(v) => setEditing({ ...editing, max_completions: v })} />
            <In label="Expires (ISO)" v={editing.expires_at ?? ""} on={(v) => setEditing({ ...editing, expires_at: v })} />
            <CondEditor conditions={editing.conditions ?? []} onChange={(conditions) => setEditing({ ...editing, conditions })} />
            <button onClick={saveEdit} className="w-full rounded-xl bg-sky-500 py-2 text-sm font-semibold">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function In({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div><div className="mb-1 text-[10px] uppercase text-white/40">{label}</div>
      <input value={v} onChange={(e) => on(e.target.value)} className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none" />
    </div>
  );
}

function CondEditor({ conditions, onChange }: { conditions: Cond[]; onChange: (c: Cond[]) => void }) {
  const [type, setType] = useState<string>("ads_today");
  function add() {
    let nc: Cond | null = null;
    if (type === "ads_today") nc = { type, network: "adsgram", min: 1 };
    else if (type === "mining_claim_today") nc = { type, min: 1 };
    else if (type === "channel_member") nc = { type, chat: "" };
    else if (type === "min_referrals") nc = { type, min: 1 };
    else if (type === "min_balance_cloud") nc = { type, min: 100 };
    else if (type === "bio_verified") nc = { type } as Cond;
    if (nc) onChange([...conditions, nc]);
  }
  function update(i: number, patch: any) {
    const next = conditions.slice();
    next[i] = { ...(next[i] as any), ...patch };
    onChange(next);
  }
  function remove(i: number) {
    const next = conditions.slice(); next.splice(i, 1); onChange(next);
  }
  return (
    <div className="space-y-2 rounded-xl bg-white/5 p-2 ring-1 ring-white/10">
      <div className="text-[10px] uppercase text-white/40">Conditions (optional)</div>
      {conditions.map((c, i) => (
        <div key={i} className="rounded-lg bg-white/5 p-2 ring-1 ring-white/10">
          <div className="mb-1 flex items-center justify-between text-[10px] text-white/60">
            <span>{COND_LABELS[c.type] ?? c.type}</span>
            <button onClick={() => remove(i)} className="rounded p-0.5 hover:bg-white/10"><X className="h-3 w-3" /></button>
          </div>
          {c.type === "ads_today" && (
            <div className="grid grid-cols-2 gap-1.5">
              <select value={(c as any).network} onChange={(e) => update(i, { network: e.target.value })} className="rounded-lg bg-white/10 px-2 py-1.5 text-xs outline-none">
                {["adsgram","monetag","richads","onclicka","gigapup"].map((n) => <option key={n} value={n} className="bg-[#141a30]">{n}</option>)}
              </select>
              <input type="number" min={1} value={(c as any).min} onChange={(e) => update(i, { min: Number(e.target.value) })} className="rounded-lg bg-white/10 px-2 py-1.5 text-xs outline-none" placeholder="min" />
            </div>
          )}
          {c.type === "mining_claim_today" && (
            <input type="number" min={1} value={(c as any).min} onChange={(e) => update(i, { min: Number(e.target.value) })} className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-xs outline-none" />
          )}
          {c.type === "channel_member" && (
            <input value={(c as any).chat} onChange={(e) => update(i, { chat: e.target.value })} placeholder="@username or -100…" className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-xs outline-none" />
          )}
          {c.type === "min_referrals" && (
            <input type="number" min={1} value={(c as any).min} onChange={(e) => update(i, { min: Number(e.target.value) })} className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-xs outline-none" />
          )}
          {c.type === "min_balance_cloud" && (
            <input type="number" min={1} value={(c as any).min} onChange={(e) => update(i, { min: Number(e.target.value) })} className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-xs outline-none" />
          )}
        </div>
      ))}
      <div className="flex gap-1.5">
        <select value={type} onChange={(e) => setType(e.target.value)} className="flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-xs outline-none">
          {Object.entries(COND_LABELS).map(([k, l]) => <option key={k} value={k} className="bg-[#141a30]">{l}</option>)}
        </select>
        <button onClick={add} className="rounded-lg bg-sky-500/80 px-3 py-1.5 text-xs font-semibold">Add</button>
      </div>
    </div>
  );
}
