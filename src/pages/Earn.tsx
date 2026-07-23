import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import MiningCard from "@/components/MiningCard";
import MangoMarket from "@/components/MangoMarket";
import MangoTapTap from "@/components/MangoTapTap";
import { Zap, ChevronRight } from "lucide-react";
import { haptic } from "@/lib/telegram";
import { apiCall } from "@/lib/api";

/** XOX has been retired. Legacy client state is cleaned up on mount. */
function cleanupLegacyXox() {
  try {
    localStorage.removeItem("xox_state_v1");
    localStorage.removeItem("xox_last_end");
  } catch { /* ignore */ }
  apiCall("xox_close_session", {}).catch(() => {});
}

export default function EarnPage({ tgId }: { tgId: number | null }) {
  const { t } = useTranslation();
  const [view, setView] = useState<"earn" | "taptap">("earn");
  useEffect(() => { cleanupLegacyXox(); }, []);

  if (view === "taptap") {
    return <MangoTapTap tgId={tgId} onBack={() => setView("earn")} />;
  }

  return (
    <div className="space-y-5">
      <MiningCard tgId={tgId} />

      {/* Cloud Tap-Tap entry (market-style card, opens a sub-view) */}
      <button
        onClick={() => { haptic("light"); setView("taptap"); }}
        className="flex w-full items-center gap-3 rounded-3xl bg-gradient-card px-4 py-4 text-left shadow-elegant ring-1 ring-primary-glow/15 transition active:scale-[0.99]"
      >
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-earn shadow-earn">
          <Zap className="h-5 w-5 text-earn-foreground" />
        </div>
        <div className="flex-1">
          <div className="font-display text-base font-bold">Cloud Tap-Tap</div>
          <div className="text-[11px] text-muted-foreground">
            Tap to earn up to 1,000 ☁️ every day. Short ad every 100 ☁️.
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-primary-glow" />
      </button>

      <div className="pt-2">
        <h1 className="mb-3 font-display text-xl font-bold text-gradient-earn">
          {t("earn.marketTitle", "Cloud Market")}
        </h1>
        <MangoMarket tgId={tgId} />
      </div>
    </div>
  );
}
