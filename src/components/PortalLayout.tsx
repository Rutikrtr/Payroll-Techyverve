import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Logo } from "./Layout";
import { IconButton } from "./ui";

/** Slim top-bar shell for branch kiosks and employees (no admin sidebar). */
export default function PortalLayout({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const { firm, profile, signOut } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <div className="ml-2 hidden min-w-0 border-l border-line pl-3 sm:block">
            <div className="truncate text-[13px] font-medium">{firm?.name}</div>
            <div className="truncate text-[12px] text-ink-3">{subtitle}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden font-mono text-[12px] text-ink-3 sm:inline">{profile?.login_id}</span>
            {/* Employees stay signed in on their phone; only the admin can end that session. */}
            {profile?.role !== "employee" && <IconButton label="Sign out" onClick={signOut}><LogOut className="size-4" /></IconButton>}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
