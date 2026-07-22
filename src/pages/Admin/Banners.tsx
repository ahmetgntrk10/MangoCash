import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Power } from "lucide-react";
import { apiCall } from "@/lib/api";

type Banner = {
  id: string; title: string; description: string; link: string | null;
  target_views: number | null; views_count: number; is_active: boolean;
};

export default function AdminBanners() {
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "", description: "", link: "", target_views: "" });
  const { data: list } = useQuery({
    queryKey: ["adm-banners"],
    queryFn: async () => (await apiCall<{ data: Banner[] }>("admin_list_banners")).data ?? [],
  });

  async function create() {
    if (!f.title.trim() || !f.description.trim()) { toast.error("Title and description required"); return; }
    try {
      await apiCall("admin_create_banner", {
        title: f.title.trim(),
        description: f.description.trim(),
        link: f.link.trim() || null,
        target_views: f.target_views ? Math.max(1, Number(f.target_views)) : null,
      });
      toast.success("Banner created");
      setF({ title: "", description: "", link: "", target_views: "" });
      qc.invalidateQueries({ queryKey: ["adm-banners"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function toggle(id: string, is_active: boolean) {
    await apiCall("admin_toggle_banner", { id, is_active });
    qc.invalidateQueries({ queryKey: ["adm-banners"] });
  }
  async function del(id: string) {
    if (!confirm("Delete this banner?")) return;
    await apiCall("admin_delete_banner", { id });
    qc.invalidateQueries({ queryKey: ["adm-banners"] });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-2xl bg-gradient-card p-4 shadow-elegant">
        <In label="Title" v={f.title} on={(v) => setF({ ...f, title: v })} />
        <In label="Description" v={f.description} on={(v) => setF({ ...f, description: v })} />
        <In label="Link (optional)" v={f.link} on={(v) => setF({ ...f, link: v })} />
        <In label="Target views (optional)" v={f.target_views} on={(v) => setF({ ...f, target_views: v })} />
        <button onClick={create} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-2 text-sm font-semibold text-primary-foreground shadow-elegant">
          <Plus className="h-4 w-4" /> Create Banner
        </button>
      </div>
      <ul className="space-y-2">
        {list?.map((b) => (
          <li key={b.id} className="rounded-xl bg-gradient-card p-3 text-xs shadow-elegant">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{b.title}</div>
                <div className="text-muted-foreground">{b.description}</div>
                {b.link && <div className="mt-0.5 truncate text-primary-glow">{b.link}</div>}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Views: {b.views_count}{b.target_views ? ` / ${b.target_views}` : ""}
                  {" · "}{b.is_active ? <span className="text-earn">active</span> : <span className="text-muted-foreground">inactive</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => toggle(b.id, !b.is_active)} className="rounded-lg bg-surface-1/60 p-1.5 text-primary-glow"><Power className="h-3.5 w-3.5" /></button>
                <button onClick={() => del(b.id)} className="rounded-lg bg-destructive/20 p-1.5 text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </li>
        ))}
        {!list?.length && <li className="rounded-2xl bg-gradient-card p-6 text-center text-sm text-muted-foreground">No banners yet</li>}
      </ul>
    </div>
  );
}

function In({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase text-muted-foreground">{label}</div>
      <input value={v} onChange={(e) => on(e.target.value)} className="w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary" />
    </div>
  );
}