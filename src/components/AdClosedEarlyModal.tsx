import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, MousePointerClick, Eye, Ban, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function AdClosedEarlyModal({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (!open) { setCount(3); return; }
    setCount(3);
    const id = setInterval(() => setCount((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            className="glass-strong relative w-full max-w-sm rounded-3xl p-6 text-center shadow-glow"
          >
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-primary shadow-elegant">
              <span className="text-3xl">⏱️</span>
            </div>
            <h2 className="text-gradient-primary text-lg font-bold font-display">
              {t("adModal.title")}
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-xs text-muted-foreground">
              {t("adModal.desc")}
            </p>

            <div className="mt-5 space-y-2 text-left">
              <Step n={1} icon={Play} text={t("adModal.step1")} color="text-primary-glow" />
              <Step n={2} icon={MousePointerClick} text={t("adModal.step2")} color="text-primary" />
              <Step n={3} icon={Eye} text={t("adModal.step3")} color="text-earn" />
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <Ban className="h-4 w-4" /> {t("adModal.warning")}
            </div>

            <button
              disabled={count > 0}
              onClick={onClose}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-3 text-sm font-bold text-primary-foreground shadow-elegant transition disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              {count > 0 ? `${t("adModal.understood")} (${count})` : t("adModal.understood")}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Step({ n, icon: Icon, text, color }: any) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-1/40 px-3 py-2.5">
      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-surface-2 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Step {n}</div>
        <div className="text-xs font-medium text-foreground">{text}</div>
      </div>
    </div>
  );
}
