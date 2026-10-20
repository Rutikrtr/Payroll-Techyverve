import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

/** Calls an edge function and throws with the server's message on failure. */
async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context.json()).error ?? msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return data as T;
}

/** Superadmin: firms and their HR login. */
export const adminFirm = <T = unknown>(body: Record<string, unknown>) => invoke<T>("admin-firm", body);

/** Firm admin: branch and employee logins. */
export const firmUsers = <T = unknown>(body: Record<string, unknown>) => invoke<T>("firm-users", body);

/** Branch and employee logins sign in with a login ID; the auth email is derived from it. */
export const LOGIN_DOMAIN = "payroll.local";
export const loginEmail = (id: string) => (id.includes("@") ? id.trim() : `${id.trim().toLowerCase()}@${LOGIN_DOMAIN}`);
