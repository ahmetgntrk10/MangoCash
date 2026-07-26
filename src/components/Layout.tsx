import { NavLink, Outlet } from "react-router-dom";
import { Home, ListChecks, Users, User, Coins } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

const SIDE_TABS = [
  { to: "/", icon: Home, key: "home" },
  { to: "/task", icon: ListChecks, key: "task" },
] as const;
const RIGHT_TABS = [
  { to: "/referral", icon: Users, key: "referral" },
  { to: "/profile", icon: User, key: "profile" },
] as const;

export default function Layout({ tgId: _tgId }: { tgId: number | null }) {
  const { t } = useTranslation();

  return (
    <div className="relative min-h-screen text-foreground">
      <main className="mx-auto max-w-md px-4 pb-28 pt-6 animate-page-enter">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2">
        <div className="glass-strong relative flex items-end justify-around rounded-t-3xl px-2 pb-3 pt-2">
          {SIDE_TABS.map((tab) => (
            <SideTab key={tab.to} to={tab.to} icon={tab.icon} label={t(`common.${tab.key}`)} />
          ))}
          {/* Center Earn button (raised) */}
          <NavLink to="/earn" className="-mt-7 mx-1">
            {({ isActive }) => (
              <motion.div
                whileTap={{ scale: 0.92 }}
                animate={{ y: isActive ? -2 : 0 }}
                className={`grid h-16 w-16 place-items-center rounded-full bg-gradient-earn shadow-earn ring-4 ring-background ${
                  isActive ? "saturate-150" : "saturate-100"
                }`}
              >
                <Coins className="h-7 w-7 text-earn-foreground" strokeWidth={2.5} />
              </motion.div>
            )}
          </NavLink>
          {RIGHT_TABS.map((tab) => (
            <SideTab key={tab.to} to={tab.to} icon={tab.icon} label={t(`common.${tab.key}`)} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function SideTab({ to, icon: Icon, label }: any) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-3 py-2 text-[10px] font-medium transition ${
          isActive ? "text-primary-glow" : "text-muted-foreground"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <motion.span
            animate={isActive ? { y: -2, scale: 1.1 } : { y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className={isActive ? "drop-shadow-[0_0_8px_rgba(76,201,240,0.7)]" : ""}
          >
            <Icon className="h-5 w-5" />
          </motion.span>
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}
