import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Megaphone, ExternalLink } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiCall } from "@/lib/api";

type Banner = { id: string; title: string; description: string; link: string | null };

/**
 * Auto-fitting banner card. Mounts between MAIN BALANCE and Daily Reward.
 * - Renders nothing when no active banner is available.
 * - Counts ≤ 1 view per 12h window per user (server-enforced).
 * - User × closes it for ≥ 12h. Re-shows after 12h or when a new banner exists.
 */
export default function HomeBanner() {
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(false);
  const { data } = useQuery({
    queryKey: ["current_banner"],
    queryFn: async () => (await apiCall<{ banner: Banner | null }>("current_banner")).banner,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data?.id) return;
    apiCall("banner_view", { id: data.id }).catch(() => {});
  }, [data?.id]);

  if (!data || hidden) return null;

  const open = () => {
    if (!data.link) return;
    try { window.open(data.link, "_blank", "noopener,noreferrer"); } catch {}
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="overflow-hidden"
      >
        <div
          onClick={open}
          role={data.link ? "button" : undefined}
          className={`group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-primary-glow/30 bg-gradient-card p-4 shadow-elegant ${data.link ? "cursor-pointer" : ""}`}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-glow/70 to-transparent" />
          <div className="pointer-events-none absolute -right-10 -bottom-12 h-32 w-32 rounded-full bg-primary/25 blur-3xl" />
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary-glow">
            <Megaphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <span className="truncate">{data.title}</span>
              {data.link && <ExternalLink className="h-3 w-3 shrink-0 text-primary-glow opacity-70" />}
            </div>
            <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{data.description}</div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setHidden(true);
              apiCall("banner_dismiss", { id: data.id }).catch(() => {});
              qc.invalidateQueries({ queryKey: ["current_banner"] });
            }}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2/80 text-muted-foreground transition hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}