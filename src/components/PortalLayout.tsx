import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarCheck, FileText, House, LogOut, ScanLine } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Logo } from "./Layout";
import { cx, IconButton } from "./ui";

/** Employee bottom tab bar (phones): the app's main navigation, like a native app. */
function EmployeeTabBar() {
  const loc = useLocation();
  const tab = loc.pathname === "/scan" ? "scan" : new URLSearchParams(loc.search).get("tab") ?? "today";
  const item = (to: string, key: string, label: string, icon: ReactNode) => (
    <Link to={to} replace aria-current={tab === key ? "page" : undefined}
      className={cx("flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
        tab === key ? "text-wine-700" : "text-ink-3 active:text-ink")}>
      {icon}{label}
    </Link>
  );
  return (
    <nav aria-label="App" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex h-16 items-stretch">
        {item("/me?tab=today", "today", "Today", <House className="size-[22px]" />)}
        {item("/me?tab=attendance", "attendance", "Attendance", <CalendarCheck className="size-[22px]" />)}
        <Link to="/scan" aria-label="Scan QR" className="flex flex-1 items-start justify-center">
          <span className={cx("-mt-5 flex size-14 items-center justify-center rounded-full text-white shadow-pop ring-4 ring-white transition-transform active:scale-95",
            tab === "scan" ? "bg-wine-800" : "bg-wine-700")}>
            <ScanLine className="size-6" />
          </span>
        </Link>
        {item("/me?tab=payslips", "payslips", "Payslips", <FileText className="size-[22px]" />)}
      </div>
    </nav>
  );
}

/** Slim top-bar shell for branch kiosks and employees (no admin sidebar). */
export default function PortalLayout({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const { firm, profile, signOut } = useAuth();
  const employee = profile?.role === "employee";
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          {employee ? (
            <>
              <img src="/icons/icon-192.png" alt="" width={32} height={32} className="size-8 rounded-lg sm:hidden" />
              <div className="hidden sm:block"><Logo /></div>
              <div className="min-w-0 sm:ml-2 sm:border-l sm:border-line sm:pl-3">
                <div className="truncate text-[15px] font-semibold leading-tight sm:text-[13px] sm:font-medium">{firm?.name}</div>
                <div className="truncate text-[12px] text-ink-3">{subtitle}</div>
              </div>
            </>
          ) : (
            <>
              <Logo />
              <div className="ml-2 hidden min-w-0 border-l border-line pl-3 sm:block">
                <div className="truncate text-[13px] font-medium">{firm?.name}</div>
                <div className="truncate text-[12px] text-ink-3">{subtitle}</div>
              </div>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden font-mono text-[12px] text-ink-3 sm:inline">{profile?.login_id}</span>
            {/* Employees stay signed in on their phone; only the admin can end that session. */}
            {!employee && <IconButton label="Sign out" onClick={signOut}><LogOut className="size-4" /></IconButton>}
          </div>
        </div>
      </header>
      <main id="main" className={cx("mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:py-8", employee && "pb-28 sm:pb-8")}>{children}</main>
      {employee && <EmployeeTabBar />}
    </div>
  );
}
