import { useState, type ReactNode } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Users, ListChecks, Megaphone, Wallet, Shield, Ticket, ArrowLeft, Image as ImageIcon, UserCheck, Link2, Gem } from "lucide-react";
import { useIsAdmin } from "@/hooks/useUser";
import AdminUsers from "./Users";
import AdminTasks from "./Tasks";
import AdminAnnounce from "./Announce";
import AdminPayments from "./Payments";
import AdminAdmins from "./Admins";
import AdminPromos from "./Promos";
import AdminBanners from "./Banners";
import AdminWhitelist from "./Whitelist";
import AdminPartners from "./Partners";
import AdminMining from "./Mining";
import ErrorBoundary from "@/components/ErrorBoundary";

type SectionKey = "users" | "tasks" | "payments" | "promos" | "announce" | "banners" | "partners" | "mining" | "whitelist" | "admins";
const SECTIONS: { key: SectionKey; label: string; icon: any; render: () => ReactNode }[] = [
  { key: "users",     label: "Users",      icon: Users,      render: () => <AdminUsers /> },
  { key: "tasks",     label: "Tasks",      icon: ListChecks, render: () => <AdminTasks /> },
  { key: "payments",  label: "Payments",   icon: Wallet,     render: () => <AdminPayments /> },
  { key: "promos",    label: "Promo Code", icon: Ticket,     render: () => <AdminPromos /> },
  { key: "announce",  label: "Announce",   icon: Megaphone,  render: () => <AdminAnnounce /> },
  { key: "banners",   label: "Banners",    icon: ImageIcon,  render: () => <AdminBanners /> },
  { key: "partners",  label: "Partners",   icon: Link2,      render: () => <AdminPartners /> },
  { key: "mining",    label: "Mining",     icon: Gem,        render: () => <AdminMining /> },
  { key: "whitelist", label: "Whitelist",  icon: UserCheck,  render: () => <AdminWhitelist /> },
  { key: "admins",    label: "Admins",     icon: Shield,     render: () => <AdminAdmins /> },
];

export default function AdminPage({ tgId }: { tgId: number | null }) {
  const { data: isAdmin, isLoading } = useIsAdmin(tgId);
  const nav = useNavigate();
  const [tab, setTab] = useState<SectionKey>("users");
  // Track which tabs have ever been opened, so we can lazy-mount but then
  // keep them mounted (state preserved) when the user switches away.
  const [mounted, setMounted] = useState<Record<SectionKey, boolean>>({
    users: true, tasks: false, payments: false, promos: false, announce: false,
    banners: false, partners: false, mining: false, whitelist: false, admins: false,
  });
  function openTab(k: SectionKey) {
    setTab(k);
    setMounted((m) => (m[k] ? m : { ...m, [k]: true }));
  }

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen text-foreground">
      <header className="glass-strong sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button onClick={() => nav("/")} className="grid h-9 w-9 place-items-center rounded-full bg-surface-1/70 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <div className="font-display text-base font-bold">Admin Panel</div>
            <div className="text-[10px] text-muted-foreground">MangoCash</div>
          </div>
        </div>
        <nav className="overflow-x-auto px-2 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <ul className="mx-auto flex max-w-3xl gap-1.5">
            {SECTIONS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => openTab(key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "bg-gradient-primary text-primary-foreground shadow-elegant"
                        : "bg-surface-1/60 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {SECTIONS.map((s) => (
          <div key={s.key} style={{ display: tab === s.key ? "block" : "none" }}>
            {mounted[s.key] && (
              <ErrorBoundary>
                {s.render()}
              </ErrorBoundary>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
