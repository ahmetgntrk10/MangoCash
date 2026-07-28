import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { apiCall } from "@/lib/api";
import { openLink } from "@/lib/telegram";

// Ekrandaki "Join" butonlarının gideceği kanallar — backend'deki
// GATE_NEWS_CHANNEL / GATE_PAYMENT_CHANNEL ile AYNI username olmalı.
const NEWS_CHANNEL = "mangocashnews";
const PAYMENT_CHANNEL = "mangocashpayments";

export default function ChannelJoinGate({ onDone }: { onDone: () => void }) {
  const [okNews, setOkNews] = useState(false);
  const [okPay, setOkPay] = useState(false);
  const [busy, setBusy] = useState<"" | "news" | "pay" | "final">("");
  const [err, setErr] = useState<string | null>(null);

  async function verify(kind: "news" | "pay") {
    setBusy(kind); setErr(null);
    try {
      const r = await apiCall<{ ok: boolean }>("gate_channel_check", {
        kind: kind === "news" ? "news" : "payment",
      });
      if (r?.ok) { kind === "news" ? setOkNews(true) : setOkPay(true); }
      else setErr("You haven't joined yet. Please join and try again.");
    } catch (e: any) { setErr(e?.message ?? "Verification failed"); }
    finally { setBusy(""); }
  }

  async function finalVerify() {
    if (!okNews || !okPay) { setErr("Please verify both channels first."); return; }
    setBusy("final"); setErr(null);
    try {
      const r = await apiCall<{ ok: boolean }>("gate_channel_verify", {});
      if (r?.ok) onDone();
      else setErr("Verification failed. Make sure you joined both channels.");
    } catch (e: any) { setErr(e?.message ?? "Verification failed"); }
    finally { setBusy(""); }
  }

  const Row = ({ label, username, ok, kind }: { label: string; username: string; ok: boolean; kind: "news" | "pay" }) => (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface-1/60 p-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="truncate text-xs text-muted-foreground">@{username}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => openLink(`https://t.me/${username}`)}
          className="inline-flex items-center gap-1 rounded-full bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Join <ExternalLink className="h-3 w-3" />
        </button>
        <button
          onClick={() => verify(kind)}
          disabled={busy === kind}
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${
            ok ? "bg-success/20 text-success" : "border border-border bg-surface-2/60"
          }`}
        >
          {busy === kind ? <Loader2 className="h-3 w-3 animate-spin" /> : ok ? <CheckCircle2 className="h-3 w-3" /> : null}
          {ok ? "Verified" : "Verify"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="grid min-h-screen place-items-center p-5">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-gradient-card p-6 shadow-glow">
        <h2 className="text-center font-display text-lg font-bold text-gradient-primary">
          Join to enter the bot
        </h2>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Please join both channels below to continue.
        </p>
        <div className="mt-4 space-y-2">
          <Row label="News Channel" username={NEWS_CHANNEL} ok={okNews} kind="news" />
          <Row label="Payment Channel" username={PAYMENT_CHANNEL} ok={okPay} kind="pay" />
        </div>
        {err && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-2 text-center text-xs text-destructive">{err}</div>}
        <button
          onClick={finalVerify}
          disabled={!okNews || !okPay || busy === "final"}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant disabled:opacity-50"
        >
          {busy === "final" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Verify & Continue
        </button>
      </div>
    </div>
  );
}
