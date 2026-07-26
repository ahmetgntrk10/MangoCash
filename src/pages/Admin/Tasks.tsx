import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Power } from "lucide-react";
import { toast } from "sonner";
import { apiCall } from "@/lib/api";

const CATEGORIES = ["social", "exclusive", "ads", "partners"] as const;
const VERIFICATIONS = ["timer", "channel", "manual"] as const;

export default function AdminTasks() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({ open: false, category: "social", title: "", description: "", link: "", icon_url: "", reward_cloud: 100, reward_usdt: "", verification: "timer", timer_seconds: 15, channel_username: "", max_completions: "" });
  
  const { data: tasks } = useQuery({
    queryKey: ["adm-tasks"],
    queryFn: async () => {
      const res = await apiCall<{ data: any[] }>("admin_list_tasks");
      return res.data ?? [];
    },
  });

  async function create() {
    const isExclusive = form.category === "exclusive";
    const payload: any = {
      category: form.category, title: form.title, description: form.description, link: form.link,
      icon_url: form.icon_url || null,
      reward_cloud: isExclusive ? 0 : (Number(form.reward_cloud) || 0),
      verification: form.verification,
      max_completions: form.max_completions ? Number(form.max_completions) : null,
    };
    if (isExclusive) {
      const usdt = Number(form.reward_usdt);
      if (!Number.isFinite(usdt) || usdt <= 0) {
        toast.error("USDT reward required for Exclusive tasks");
        return;
      }
      payload.reward_usdt = usdt;
      payload.payout_usdt = usdt;
      payload.is_exclusive = true;
    }
    if (form.category === "exclusive") {
      const mc = Number(form.max_completions);
      if (!Number.isFinite(mc) || mc < 100) {
        toast.error("Minimum 100 participants required for Exclusive tasks");
        return;
      }
    }
    if (form.verification === "timer") payload.timer_seconds = Number(form.timer_seconds) || 15;
    if (form.verification === "channel") payload.channel_username = form.channel_username;
    try {
      await apiCall("admin_create_task", { payload });
      toast.success("Task created");
      setForm({ ...form, open: false, title: "", description: "", link: "" });
      qc.invalidateQueries({ queryKey: ["adm-tasks"] });
    } catch (e: any) {
      const msg = String(e?.message || "");
      toast.error(msg.includes("min_100_participants")
        ? "Minimum 100 participants required for Exclusive tasks"
        : msg);
    }
  }

  async function toggleActive(t: any) {
    await apiCall("admin_toggle_task", { id: t.id, is_active: !t.is_active });
    qc.invalidateQueries({ queryKey: ["adm-tasks"] });
  }
  async function del(t: any) {
    if (!confirm("Delete this task?")) return;
    await apiCall("admin_delete_task", { id: t.id });
    qc.invalidateQueries({ queryKey: ["adm-tasks"] });
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setForm({ ...form, open: !form.open })}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 py-2.5 text-sm font-semibold">
        <Plus className="h-4 w-4" /> Add Task
      </button>
      {form.open && (
        <div className="space-y-2 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <Select label="Category" value={form.category} onChange={(v: string) => setForm({ ...form, category: v })} options={CATEGORIES as unknown as string[]} />
          <In label="Title" v={form.title} on={(v: string) => setForm({ ...form, title: v })} />
          <In label="Description" v={form.description} on={(v: string) => setForm({ ...form, description: v })} />
          <In label="Link" v={form.link} on={(v: string) => setForm({ ...form, link: v })} />
          <In label="Profile picture URL (optional)" v={form.icon_url} on={(v: string) => setForm({ ...form, icon_url: v })} />
          {form.category === "exclusive" ? (
            <In label="Reward per user (USDT)" v={form.reward_usdt} on={(v: string) => setForm({ ...form, reward_usdt: v })} type="number" />
          ) : (
            <In label="Reward (🥭)" v={form.reward_cloud} on={(v: string) => setForm({ ...form, reward_cloud: v })} type="number" />
          )}
          <Select label="Verification" value={form.verification} onChange={(v: string) => setForm({ ...form, verification: v })} options={VERIFICATIONS as unknown as string[]} />
          {form.verification === "timer" && <In label="Timer (sec)" v={form.timer_seconds} on={(v: string) => setForm({ ...form, timer_seconds: v })} type="number" />}
          {form.verification === "channel" && <In label="Channel @username" v={form.channel_username} on={(v: string) => setForm({ ...form, channel_username: v })} />}
          <In label={form.category === "exclusive" ? "Participants (min 100)" : "Max completions (optional)"} v={form.max_completions ?? ""} on={(v: string) => setForm({ ...form, max_completions: v })} type="number" />
          <button onClick={create} className="w-full rounded-xl bg-sky-500 py-2 text-sm font-semibold">Create</button>
        </div>
      )}
      <ul className="space-y-2">
        {tasks?.map((t: any) => (
          <li key={t.id} className={`rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 ${!t.is_active && "opacity-50"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {t.icon_url && <img src={t.icon_url} alt="" className="h-8 w-8 rounded-full object-cover" />}
                <div>
                  <div className="text-sm font-semibold">{t.title}</div>
                  <div className="text-[10px] text-white/40">{t.category} • {t.verification} • +{t.reward_cloud} 🥭</div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggleActive(t)} className="rounded-lg bg-white/10 p-1.5"><Power className="h-3.5 w-3.5" /></button>
                <button onClick={() => del(t)} className="rounded-lg bg-rose-500/20 p-1.5"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function In({ label, v, on, type = "text" }: any) {
  return (
    <div><div className="mb-1 text-[10px] uppercase text-white/40">{label}</div>
      <input type={type} value={v} onChange={(e) => on(e.target.value)} className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none" />
    </div>
  );
}
function Select({ label, value, onChange, options }: any) {
  return (
    <div><div className="mb-1 text-[10px] uppercase text-white/40">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none">
        {options.map((o: string) => <option key={o} value={o} className="bg-[#141a30]">{o}</option>)}
      </select>
    </div>
  );
}
