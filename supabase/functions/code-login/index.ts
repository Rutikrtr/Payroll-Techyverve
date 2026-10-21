// Public: exchange an employee login ID + one-time code for a session on this device.
// Codes are single-use, expire after 15 minutes and die after 5 wrong tries.
// A successful login ends every other session, so an employee is on one phone at a time.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_ATTEMPTS = 5;
const WRONG = "Login ID or code is incorrect";

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let loginId = "", code = "";
  try {
    const body = await req.json();
    loginId = String(body.login_id ?? "").trim().toLowerCase();
    code = String(body.code ?? "").replace(/\D/g, "");
  } catch { return json({ error: "Bad request" }, 400); }
  if (!loginId || code.length !== 6) return json({ error: "Enter your login ID and the 6-digit code" }, 400);

  const { data: p } = await admin.from("profiles").select("id, employee_id, firm_id").eq("login_id", loginId).eq("role", "employee").maybeSingle();
  if (!p) return json({ error: WRONG }, 401);

  const [{ data: emp }, { data: firm }] = await Promise.all([
    admin.from("employees").select("status").eq("id", p.employee_id).single(),
    admin.from("firms").select("status").eq("id", p.firm_id).single(),
  ]);
  if (emp?.status !== "active" || firm?.status !== "active") return json({ error: "This account is not active. Contact your admin." }, 403);

  const { data: row } = await admin.from("login_codes").select("*").eq("employee_id", p.employee_id).maybeSingle();
  if (!row || new Date(row.expires_at) < new Date()) {
    if (row) await admin.from("login_codes").delete().eq("employee_id", p.employee_id);
    return json({ error: "No active code. Ask your admin for a new login code." }, 401);
  }
  if ((await sha256(`${p.employee_id}:${code}`)) !== row.code_hash) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await admin.from("login_codes").delete().eq("employee_id", p.employee_id);
      return json({ error: "Too many wrong tries. Ask your admin for a new code." }, 401);
    }
    await admin.from("login_codes").update({ attempts }).eq("employee_id", p.employee_id);
    return json({ error: `${WRONG}. ${MAX_ATTEMPTS - attempts} tries left.` }, 401);
  }

  // Single use: burn the code before minting the session.
  await admin.from("login_codes").delete().eq("employee_id", p.employee_id);
  await admin.rpc("revoke_user_sessions", { p_user: p.id });

  const { data: user } = await admin.auth.admin.getUserById(p.id);
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.user!.email! });
  if (linkErr) return json({ error: "Could not sign in. Try again." }, 500);

  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { data: s, error: vErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (vErr || !s.session) return json({ error: "Could not sign in. Try again." }, 500);

  return json({ access_token: s.session.access_token, refresh_token: s.session.refresh_token });
});
