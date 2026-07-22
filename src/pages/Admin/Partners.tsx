import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Copy, ChevronRight, BarChart3, Power, Link2 } from "lucide-react";
import { toast } from "sonner";
import { apiCall } from "@/lib/api";

const BOT_USERNAME =
  (import.meta.env.VITE_TG_BOT_USERNAME as string) || "CloudEarnBot";

export default function AdminPartners() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: list } = useQuery({
    queryKey: ["adm-partners"],
    queryFn: async () => (await apiCall<{ data: any[] }>("admin_list_partners")).data ?? [],
  });

  async function create() {
    if (!label.trim()) { toast.error("Label is required"); return; }
    try {
      const r = await apiCall<{ link: string; code: string }>("admin_create_partner", {
        label: label.trim(), code: code.trim(),
      });
      toast.success(`Partner created: ${r.code}`);
      setOpen(false); setLabel(""); setCode("");
      qc.invalidateQueries({ queryKey: ["adm-partners"] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function toggle(p: any) {
    await apiCall("admin_toggle_partner", { code: p.code, is_active: !p.is_active });
    qc.invalidateQueries({ queryKey: ["adm-partners"] });
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 py-2.5 text-sm font-semibold">
        <Plus className="h-4 w-4" /> New Partner Link
      </button>
      {open && (
        <div className="space-y-2 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <Field label="Partner name (label)">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="LTC Miner"
              className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none" />
          </Field>
          <Field label="Custom code (optional)">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="LTCMiner (auto-generated if empty)"
              className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none" />
          </Field>
          <button onClick={create} className="w-full rounded-xl bg-sky-500 py-2 text-sm font-semibold">Create</button>
        </div>
      )}

      <ul className="space-y-2">
        {!list?.length && <li className="rounded-2xl bg-white/5 p-6 text-center text-sm text-white/50">No partners yet</li>}
        {list?.map((p: any) => {
          const link = `https://t.me/${BOT_USERNAME}/earn?startapp=partner_${p.code}`;
          return (
            <li key={p.code} className={`rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 ${!p.is_active && "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 text-sky-300" />
                    <span className="text-sm font-semibold">{p.label}</span>
                    <span className="text-[10px] text-white/40">({p.code})</span>
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}
                    className="mt-2 flex w-full items-center gap-1 truncate rounded-lg bg-white/5 px-2 py-1 text-left text-[10px] text-white/60">
                    <Copy className="h-3 w-3 shrink-0" /> <span className="truncate">{link}</span>
                  </button>
                  <div className="mt-2 flex gap-3 text-[11px] text-white/60">
                    <span>👆 Clicks: <b className="text-white/90">{p.click_count ?? 0}</b></span>
                    <span>👤 Signups: <b className="text-white/90">{p.signup_count ?? 0}</b></span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button onClick={() => setSelected(p.code)} className="rounded-lg bg-sky-500/20 p-1.5 text-sky-300">
                    <BarChart3 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => toggle(p)} className="rounded-lg bg-white/10 p-1.5">
                    <Power className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {selected && <StatsModal code={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StatsModal({ code, onClose }: { code: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["partner-stats", code],
    queryFn: async () => apiCall<{ link: any; stats: any }>("admin_partner_stats", { code }),
  });
  const s = data?.stats;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-3" onClick={onClose}>
      <div className="mx-auto w-full max-w-md rounded-3xl bg-[#141a30] p-5 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-sky-300" />
          <h3 className="text-base font-bold">{data?.link?.label ?? code}</h3>
          <span className="text-[10px] text-white/40">({code})</span>
        </div>
        {!s ? <div className="py-6 text-center text-sm text-white/50">Loading…</div> : (
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <Stat label="Clicks" value={s.clicks} />
            <Stat label="Signups" value={s.signups} />
            <Stat label="Active 24h" value={s.dau} />
            <Stat label="Active 7d" value={s.wau} />
            <Stat label="D1 retention" value={`${s.d1}%`} />
            <Stat label="D7 retention" value={`${s.d7}%`} />
            <Stat label="Total earned ☁️" value={s.total_earned_cloud} />
            <Stat label="Total paid USDT" value={Number(s.total_paid_usdt).toFixed(4)} />
          </div>
        )}
        <div className="mt-4 text-right">
          <button onClick={onClose} className="rounded-full bg-white/10 px-4 py-1.5 text-xs">Close</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="text-[10px] uppercase text-white/40">{label}</div>
      <div className="mt-1 text-sm font-semibold">{String(value ?? "—")}</div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-white/40">
        <span>{label}</span>
        <ChevronRight className="h-3 w-3" />
      </div>
      {children}
    </div>
  );
}
