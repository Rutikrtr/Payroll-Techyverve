import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Building2, CalendarCheck, FileText, LayoutDashboard, LogOut, Menu, Settings, Users, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { cx, IconButton } from "./ui";
import { initials } from "../lib/format";

type Item = { to: string; label: string; icon: ReactNode; end?: boolean };

const adminNav: Item[] = [
  { to: "/admin", label: "Overview", icon: <LayoutDashboard className="size-[18px]" />, end: true },
  { to: "/admin/firms", label: "Firms", icon: <Building2 className="size-[18px]" /> },
];
const hrNav: Item[] = [
  { to: "/app", label: "Dashboard", icon: <LayoutDashboard className="size-[18px]" />, end: true },
  { to: "/app/attendance", label: "Attendance", icon: <CalendarCheck className="size-[18px]" /> },
  { to: "/app/employees", label: "Employees", icon: <Users className="size-[18px]" /> },
  { to: "/app/payroll", label: "Payroll & Slips", icon: <FileText className="size-[18px]" /> },
  { to: "/app/settings", label: "Settings", icon: <Settings className="size-[18px]" /> },
];

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-lg bg-wine-700 text-white">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden><path d="M8 9h16M16 9v15" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /></svg>
      </div>
      <div className="leading-none">
        <div className={cx("font-display text-[15px] font-semibold tracking-tight", light ? "text-white" : "text-ink")}>Techyverve</div>
        <div className={cx("text-[11px] mt-0.5", light ? "text-white/60" : "text-ink-3")}>Payroll</div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { profile, firm, session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = profile?.role === "superadmin" ? adminNav : hrNav;
  const name = profile?.role === "superadmin" ? (profile.full_name || "Super Admin") : (firm?.name ?? "");

  const sidebar = (
    <div className="flex h-full flex-col bg-[#14060c] text-white">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo light />
        <IconButton label="Close menu" className="lg:hidden text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)}><X className="size-4" /></IconButton>
      </div>
      <div className="px-3 pb-2">
        <div className="rounded-lg bg-white/[.06] px-3 py-2.5 ring-1 ring-white/10">
          <div className="text-[11px] uppercase tracking-[0.08em] text-white/45">{profile?.role === "superadmin" ? "Platform" : "Workspace"}</div>
          <div className="mt-0.5 truncate text-[14px] font-medium">{profile?.role === "superadmin" ? "Super Admin Console" : firm?.name}</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-3 space-y-0.5" aria-label="Main">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
            className={({ isActive }) => cx(
              "group flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors",
              isActive ? "bg-wine-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.1)]" : "text-white/65 hover:bg-white/[.06] hover:text-white",
            )}>
            {n.icon}{n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex size-9 items-center justify-center rounded-full bg-wine-500/30 text-[13px] font-semibold text-wine-200">{initials(name || "U")}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{profile?.role === "superadmin" ? name : "HR Manager"}</div>
            <div className="truncate text-[12px] text-white/50">{session?.user.email}</div>
          </div>
          <IconButton label="Sign out" className="text-white/60 hover:bg-white/10 hover:text-white" onClick={signOut}><LogOut className="size-4" /></IconButton>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 animate-pop">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur lg:hidden">
          <IconButton label="Open menu" onClick={() => setOpen(true)}><Menu className="size-5" /></IconButton>
          <Logo />
        </header>
        <main id="main" key={loc.pathname} className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
