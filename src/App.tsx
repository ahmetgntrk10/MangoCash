import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import HomePage from "@/pages/Home";
import TaskPage from "@/pages/Task";
import EarnPage from "@/pages/Earn";
import ReferralPage from "@/pages/Referral";
import ProfilePage from "@/pages/Profile";
import AdminPage from "@/pages/Admin";
import AuthGate from "@/components/AuthGate";
import { AdGateProvider } from "@/components/ads/AdGate";
import { useAutoInterstitial } from "@/lib/ads/useAutoInterstitial";
import ChannelJoinGate from "@/components/ChannelJoinGate";

function MainApp({ tgId }: { tgId: number | null }) {
  const nav = useNavigate();
  useEffect(() => {
    try {
      const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      const isReload = entries[0]?.type === "reload";
      if (isReload && window.location.pathname !== "/") {
        nav("/", { replace: true });
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Routes>
      {/* Admin = full-page shell (no bottom tab bar) */}
      <Route path="/admin/*" element={<AdminPage tgId={tgId} />} />
      <Route element={<Layout tgId={tgId} />}>
        <Route path="/" element={<HomePage tgId={tgId} />} />
        <Route path="/task" element={<TaskPage tgId={tgId} />} />
        <Route path="/earn" element={<EarnPage tgId={tgId} />} />
        <Route path="/referral" element={<ReferralPage tgId={tgId} />} />
        <Route path="/profile" element={<ProfilePage tgId={tgId} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const auth = useAuth();
  const [verifiedOverride, setVerifiedOverride] = useState(false);
  const verified = auth.channelsVerified || verifiedOverride;
  return (
    <>
      <AuthGate auth={auth}>
        {verified ? (
          <AdGateProvider>
            <VerifiedShell tgId={auth.tgId} />
          </AdGateProvider>
        ) : (
          <ChannelJoinGate onDone={() => setVerifiedOverride(true)} />
        )}
      </AuthGate>
      <Toaster position="top-center" theme="dark" duration={3000} />
    </>
  );
}

function VerifiedShell({ tgId }: { tgId: number | null }) {
  useAutoInterstitial();
  return <MainApp tgId={tgId} />;
}
