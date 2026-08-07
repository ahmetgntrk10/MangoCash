import { ReactNode } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, XCircle } from "lucide-react";
import type { AuthState } from "@/hooks/useAuth";

export default function AuthGate({ auth, children }: { auth: AuthState; children: ReactNode }) {
  if (auth.loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <motion.div
          animate={{ scale: [1, 1.18, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="text-gradient-primary text-6xl font-display"
        >
          🥭
        </motion.div>
      </div>
    );
  }

  if (auth.blocked) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-destructive/30 bg-gradient-card p-7 text-center shadow-glow"
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-destructive/30 blur-3xl" />
          <div className="pointer-events-none absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />

          <motion.div
            initial={{ rotate: -10, scale: 0.7 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
            className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-destructive/15 ring-2 ring-destructive/40"
          >
            <XCircle className="h-12 w-12 text-destructive" strokeWidth={1.8} />
          </motion.div>

          <h2 className="relative mt-5 font-display text-xl font-bold text-gradient-primary">
            Multiple Accounts Detected
          </h2>
          <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
            An account is already registered on this device.
            Multiple accounts per device are not allowed.
          </p>
          <p className="relative mt-2 text-xs leading-relaxed text-muted-foreground">
            Please continue with your original account or contact support if this is a mistake.
          </p>

          {auth.matchedTgId ? (
            <div className="relative mt-4 rounded-2xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-left">
              <div className="text-[10px] uppercase tracking-wide text-destructive/80">
                {(auth.matchSignals?.length ? auth.matchSignals.join(" + ") : "Device")} Matches with
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
                {auth.matchedTgId}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                This is your first (original) account — please continue with it.
              </div>
            </div>
          ) : null}

          <div className="relative mt-5 flex items-center justify-center gap-2 rounded-2xl border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
          <ShieldAlert className="h-4 w-4" /> Device fingerprint protection is active
          </div>

          <a
            href="https://t.me/ahmetgntrk"
            className="relative mt-5 inline-flex w-full items-center justify-center rounded-full bg-gradient-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant"
          >
            Contact Support
          </a>
        </motion.div>
      </div>
    );
  }

  if (auth.error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-5xl">🥭</div>
        <h1 className="text-gradient-primary text-2xl font-bold font-display">MangoCash</h1>
        <p className="max-w-xs text-sm text-muted-foreground">{auth.error}</p>
        <div className="mt-4 flex flex-col gap-2">
          {auth.retry && (
            <button
              onClick={auth.retry}
              className="rounded-full bg-gradient-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant"
            >
              Retry
            </button>
          )}
          <a
            href="https://t.me/MangoCashBot"
            className="rounded-full border border-border bg-surface-1/60 px-6 py-2.5 text-sm font-semibold"
          >
            Open in Telegram
          </a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
