import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Send } from "lucide-react";
import { apiCall } from "@/lib/api";

type Mode = "copy" | "custom";

export default function AdminAnnounce() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("custom");
  const [copy, setCopy] = useState({ source_chat: "", source_message_id: "" });
  const [custom, setCustom] = useState({ text: "", photo_url: "", buttons: [] as Array<{text:string;url:string}> });
  const [batch, setBatch] = useState({ batch_size: 25, delay_seconds: 1 });

  const { data: list } = useQuery({
    queryKey: ["adm-announce"],
    queryFn: async () => (await apiCall<{ data: any[] }>("admin_list_announcements")).data ?? [],
  });

  async function queueCopy() {
    // Accept either:
    //  • a Telegram message URL:  https://t.me/<chatusername>/<id>   or   https://t.me/c/<internal_id>/<id>
    //  • or two raw fields: chat (numeric id or @username) + message id
    let source_chat: string | number | null = null;
    let source_message_id: number | null = Number(copy.source_message_id) || null;
    const raw = copy.source_chat.trim();
    const m = raw.match(/^https?:\/\/t\.me\/(c\/)?([^/?#]+)\/(\d+)(?:\/(\d+))?/i);
    if (m) {
      // /c/<bigint>/<msg>  → use -100<bigint> as numeric chat id
      if (m[1]) {
        source_chat = Number(`-100${m[2]}`);
      } else {
        source_chat = `@${m[2]}`;
      }
      source_message_id = Number(m[4] ?? m[3]);
    } else {
      // Raw entry: numeric id or @username
      source_chat = /^-?\d+$/.test(raw) ? Number(raw) : (raw.startsWith("@") ? raw : `@${raw}`);
    }
    if (!source_chat || !source_message_id) {
      toast.error("Source chat / message id missing"); return;
    }
    try {
      await apiCall("admin_create_announcement", {
        payload: {
          mode: "copy",
          source_chat,           // can be number or "@username"
          source_message_id,
          batch_size: Number(batch.batch_size),
          delay_seconds: Number(batch.delay_seconds),
        },
      });
      toast.success("Copy broadcast queued");
      qc.invalidateQueries({ queryKey: ["adm-announce"] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function queueCustom() {
    try {
      await apiCall("admin_create_announcement", {
        payload: {
          mode: "custom",
          text: custom.text,
          photo_url: custom.photo_url || null,
          buttons: custom.buttons.filter((b) => b.text && b.url),
          batch_size: Number(batch.batch_size),
          delay_seconds: Number(batch.delay_seconds),
        },
      });
      toast.success("Custom broadcast queued");
      qc.invalidateQueries({ queryKey: ["adm-announce"] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-2xl bg-surface-1/60 p-1 ring-1 ring-border">
        {(["custom", "copy"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 rounded-xl py-1.5 text-xs ${mode === m ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground"}`}>
            {m === "custom" ? "Custom Message" : "Copy from chat"}
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded-2xl bg-gradient-card p-4 shadow-elegant">
        {mode === "copy" ? (
          <>
            <div className="text-[10px] text-muted-foreground">
              Paste a Telegram message link (https://t.me/mangocashpayment/15) OR set chat + message id manually.
              The bot copies the message as its own (no "forwarded from" header). Bot must be admin in the source chat.
            </div>
            <In label="Telegram link or chat @username / id" v={copy.source_chat} on={(v) => setCopy({ ...copy, source_chat: v })} />
            <In label="Source message ID (auto-filled from link)" v={copy.source_message_id} on={(v) => setCopy({ ...copy, source_message_id: v })} />
            <BatchFields batch={batch} setBatch={setBatch} />
            <button onClick={queueCopy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-2 text-sm font-semibold text-primary-foreground">
              <Send className="h-4 w-4" /> Queue Copy Broadcast
            </button>
          </>
        ) : (
          <>
            <Textarea label="Message text (HTML allowed)" v={custom.text} on={(v) => setCustom({ ...custom, text: v })} />
            <In label="Image URL (optional)" v={custom.photo_url} on={(v) => setCustom({ ...custom, photo_url: v })} />
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-muted-foreground">
                <span>Inline Buttons</span>
                <button onClick={() => setCustom({ ...custom, buttons: [...custom.buttons, { text: "", url: "" }] })}
                  className="flex items-center gap-1 text-primary-glow"><Plus className="h-3 w-3" /> Add</button>
              </div>
              <div className="space-y-1.5">
                {custom.buttons.map((b, i) => (
                  <div key={i} className="grid grid-cols-2 gap-1.5">
                    <input value={b.text} onChange={(e) => {
                      const c = [...custom.buttons]; c[i] = { ...c[i], text: e.target.value }; setCustom({ ...custom, buttons: c });
                    }} placeholder="Button text" className="rounded-xl border border-border bg-surface-2/60 px-2 py-1.5 text-xs outline-none" />
                    <input value={b.url} onChange={(e) => {
                      const c = [...custom.buttons]; c[i] = { ...c[i], url: e.target.value }; setCustom({ ...custom, buttons: c });
                    }} placeholder="https://…" className="rounded-xl border border-border bg-surface-2/60 px-2 py-1.5 text-xs outline-none" />
                  </div>
                ))}
              </div>
            </div>
            <BatchFields batch={batch} setBatch={setBatch} />
            <button onClick={queueCustom} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-2 text-sm font-semibold text-primary-foreground">
              <Send className="h-4 w-4" /> Queue Custom Broadcast
            </button>
          </>
        )}
      </div>

      <ul className="space-y-2">
        {list?.map((a: any) => (
          <li key={a.id} className="rounded-xl bg-gradient-card p-3 text-xs shadow-elegant">
            <div className="flex justify-between">
              <span className="font-semibold">
                {a.mode === "custom" ? "Custom" : `Copy #${a.source_message_id}`}
              </span>
              <span className="text-muted-foreground">{a.status}</span>
            </div>
            <div className="mt-0.5 text-muted-foreground">sent {a.sent_count} • failed {a.failed_count}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BatchFields({ batch, setBatch }: any) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <In label="Batch size" v={String(batch.batch_size)} on={(v: string) => setBatch({ ...batch, batch_size: Number(v) || 25 })} />
      <In label="Delay (sec)" v={String(batch.delay_seconds)} on={(v: string) => setBatch({ ...batch, delay_seconds: Number(v) || 1 })} />
    </div>
  );
}
function In({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div><div className="mb-1 text-[10px] uppercase text-muted-foreground">{label}</div>
      <input value={v} onChange={(e) => on(e.target.value)} className="w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary" />
    </div>
  );
}
function Textarea({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <div><div className="mb-1 text-[10px] uppercase text-muted-foreground">{label}</div>
      <textarea value={v} onChange={(e) => on(e.target.value)} rows={4} className="w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm outline-none focus:border-primary" />
    </div>
  );
}
