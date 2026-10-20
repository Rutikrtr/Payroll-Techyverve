import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Firm, Profile, Role } from "./types";

/** Landing page for each role. */
export const HOME: Record<Role, string> = { superadmin: "/admin", hr: "/app", branch: "/branch", employee: "/me" };

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  firm: Firm | null;
  loading: boolean;
  refreshFirm: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [firm, setFirm] = useState<Firm | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(s: Session | null) {
    setSession(s);
    if (!s) { setProfile(null); setFirm(null); setLoading(false); return; }
    const { data: p } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    setProfile(p);
    if (p?.firm_id) {
      const { data: f } = await supabase.from("firms").select("*").eq("id", p.firm_id).maybeSingle();
      setFirm(f);
    } else setFirm(null);
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    // Supabase re-emits SIGNED_IN on tab focus and TOKEN_REFRESHED hourly. Only a change of
    // user should reload the profile; otherwise just swap the session so the UI never remounts.
    let currentUser: string | undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      const uid = s?.user.id;
      if (event === "INITIAL_SESSION") { currentUser = uid; return; }
      if (uid !== currentUser) { currentUser = uid; setLoading(true); load(s); }
      else setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    session, profile, firm, loading,
    refreshFirm: async () => {
      if (!profile?.firm_id) return;
      const { data } = await supabase.from("firms").select("*").eq("id", profile.firm_id).maybeSingle();
      setFirm(data);
    },
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
