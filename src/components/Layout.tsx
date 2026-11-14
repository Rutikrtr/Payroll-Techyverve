import { Suspense, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Building, Building2, CalendarCheck, FileText, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, Users, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { cx, IconButton, Skeleton } from "./ui";
import { initials } from "../lib/format";

type Item = { to: string; label: string; icon: ReactNode; end?: boolean; multiOnly?: boolean };

const adminNav: Item[] = [
  { to: "/admin", label: "Overview", icon: <LayoutDashboard className="size-[18px]" />, end: true },
  { to: "/admin/firms", label: "Firms", icon: <Building2 className="size-[18px]" /> },
];
const hrNav: Item[] = [
  { to: "/app", label: "Dashboard", icon: <LayoutDashboard className="size-[18px]" />, end: true },
  { to: "/app/attendance", label: "Attendance", icon: <CalendarCheck className="size-[18px]" /> },
  { to: "/app/employees", label: "Employees", icon: <Users className="size-[18px]" /> },
  { to: "/app/branches", label: "Branches", icon: <Building className="size-[18px]" />, multiOnly: true },
  { to: "/app/payroll", label: "Payroll & Slips", icon: <FileText className="size-[18px]" /> },
  { to: "/app/settings", label: "Settings", icon: <Settings className="size-[18px]" /> },
];

function LogoMark() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-wine-600 to-wine-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_4px_12px_-4px_rgba(138,37,70,.7)]">
      <svg viewBox="0 0 32 32" className="size-5" aria-hidden><path d="M8 9h16M16 9v15" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /></svg>
    </div>
  );
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className={cx("font-display text-[15px] font-semibold tracking-tight", light ? "text-white" : "text-ink")}>Techyverve</div>
        <div className={cx("text-[11px] mt-0.5", light ? "text-white/60" : "text-ink-3")}>Payroll</div>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" /><Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 grid gap-4 grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[124px]" />)}</div>
      <Skeleton className="mt-4 h-72" />
    </div>
  );
}

const COLLAPSE_KEY = "sidebar-collapsed";
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; } };

export default function Layout() {
  const { profile, firm, session, signOut } = useAuth();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(readCollapsed); // desktop: icons only
  const nav = profile?.role === "superadmin" ? adminNav : hrNav.map((n) => (n.multiOnly && !firm?.multi_branch ? { ...n, label: "Office & QR" } : n));

  useEffect(() => { try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch { /* private mode */ } }, [collapsed]);

  // Warm every page chunk after login so later navigation never waits on a download.
  useEffect(() => {
    const t = setTimeout(() => {
      if (profile?.role === "superadmin") { import("../pages/admin/Overview"); import("../pages/admin/Firms"); import("../pages/admin/FirmDetail"); }
      else { import("../pages/hr/Dashboard"); import("../pages/hr/Attendance"); import("../pages/hr/Employees"); import("../pages/hr/Branches"); import("../pages/hr/Payroll"); import("../pages/hr/Settings"); }
    }, 300);
    return () => clearTimeout(t);
  }, [profile?.role]);
  const name = profile?.role === "superadmin" ? (profile.full_name || "Super Admin") : (firm?.name ?? "");

  /** mini = desktop collapsed rail (icons only). The mobile drawer is always full width. */
  const sidebar = (mini: boolean) => (
    <div className="sidebar-gloss relative flex h-full flex-col text-white">
      <div className={cx("flex h-16 items-center", mini ? "justify-center px-2" : "justify-between px-4")}>
        {mini ? (
          // Collapsed: the T mark turns into an "open" button on hover / focus.
          <button type="button" onClick={() => setCollapsed(false)} aria-label="Open sidebar" title="Open sidebar"
            className="group relative flex size-10 items-center justify-center rounded-lg cursor-pointer hover:bg-white/10">
            <span className="transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0"><LogoMark /></span>
            <PanelLeftOpen className="absolute size-5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        ) : (
          <>
            <Logo light />
            <IconButton label="Close sidebar" className="hidden lg:inline-flex text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setCollapsed(true)}><PanelLeftClose className="size-[18px]" /></IconButton>
            <IconButton label="Close menu" className="lg:hidden text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)}><X className="size-4" /></IconButton>
          </>
        )}
      </div>
      {!mini && (
        <div className="px-3 pb-2">
          <div className="rounded-lg bg-white/[.06] px-3 py-2.5 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
            <div className="text-[11px] uppercase tracking-[0.08em] text-white/45">{profile?.role === "superadmin" ? "Platform" : "Workspace"}</div>
            <div className="mt-0.5 truncate text-[14px] font-medium" title={name}>{profile?.role === "superadmin" ? "Super Admin Console" : firm?.name}</div>
          </div>
        </div>
      )}
      <nav className={cx("flex-1 space-y-1 py-3", mini ? "px-2" : "px-3")} aria-label="Main">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} title={mini ? n.label : undefined} aria-label={mini ? n.label : undefined}
            className={({ isActive }) => cx(
              "group flex h-10 items-center rounded-lg text-[14px] transition-all",
              mini ? "justify-center" : "gap-3 px-3",
              isActive ? "nav-active text-white" : "text-white/65 hover:bg-white/[.07] hover:text-white",
            )}>
            {n.icon}{!mini && n.label}
          </NavLink>
        ))}
      </nav>
      <div className={cx("border-t border-white/10", mini ? "p-2" : "p-3")}>
        {mini ? (
          <div className="flex flex-col items-center gap-2">
            <div title={session?.user.email ?? ""} className="flex size-9 items-center justify-center rounded-full bg-wine-500/30 text-[13px] font-semibold text-wine-200">{initials(name || "U")}</div>
            <IconButton label="Sign out" className="text-white/60 hover:bg-white/10 hover:text-white" onClick={signOut}><LogOut className="size-4" /></IconButton>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-wine-500/30 text-[13px] font-semibold text-wine-200">{initials(name || "U")}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{profile?.role === "superadmin" ? name : "HR Manager"}</div>
              <div className="truncate text-[12px] text-white/50">{session?.user.email}</div>
            </div>
            <IconButton label="Sign out" className="text-white/60 hover:bg-white/10 hover:text-white" onClick={signOut}><LogOut className="size-4" /></IconButton>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className={cx("no-print fixed inset-y-0 left-0 z-30 hidden overflow-hidden transition-[width] duration-200 lg:block", collapsed ? "w-[72px]" : "w-64")}>{sidebar(collapsed)}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 animate-pop">{sidebar(false)}</aside>
        </div>
      )}
      <div className={cx("transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas/75 px-4 backdrop-blur-md lg:hidden">
          <IconButton label="Open menu" onClick={() => setOpen(true)}><Menu className="size-5" /></IconButton>
          <Logo />
        </header>
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
