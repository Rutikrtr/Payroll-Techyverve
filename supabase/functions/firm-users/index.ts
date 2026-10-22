// Firm admin (HR) only: manage branch kiosk logins and employee device logins.
// Logins use a login ID like "techyverve-pune" / "techyverve-emp002"; the auth email is
// derived from it (<login_id>@payroll.local) and never receives mail.
// Employees have no usable password: they sign in once per phone with a one-time code
// (see the code-login function), and only the admin can end that device session.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const LOGIN_DOMAIN = "payroll.local";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20);
const checkPassword = (p: unknown) => typeof p === "string" && p.length >= 8;
const CODE_TTL_MIN = 15;

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
const randomCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { data: me } = await admin.from("profiles").select("role, firm_id").eq("id", user.id).single();
  if (me?.role !== "hr") return json({ error: "Only the firm admin can manage logins" }, 403);
  const { data: firm } = await admin.from("firms").select("id, code, status, multi_branch").eq("id", me.firm_id).single();
  if (!firm || firm.status !== "active") return json({ error: "Workspace is suspended" }, 403);
  if (!firm.multi_branch) return json({ error: "Branches and employee logins are available for multi-branch firms only" }, 403);

  async function createLogin(loginId: string, password: string, profile: Record<string, unknown>) {
    const { data: u, error } = await admin.auth.admin.createUser({
      email: `${loginId}@${LOGIN_DOMAIN}`, password, email_confirm: true,
    });
    if (error) throw new Error(error.message.includes("already") ? `Login ID "${loginId}" is already taken` : error.message);
    const { error: pErr } = await admin.from("profiles").insert({ id: u.user.id, firm_id: firm!.id, login_id: loginId, ...profile });
    if (pErr) { await admin.auth.admin.deleteUser(u.user.id); throw pErr; }
  }
  async function profileFor(col: "branch_id" | "employee_id", id: string) {
    const { data } = await admin.from("profiles").select("id").eq(col, id).eq("firm_id", firm!.id).maybeSingle();
    return data;
  }
  /** New one-time code for an employee; signs out their current phone. */
  async function issueCode(employeeId: string, userId: string) {
    const code = randomCode();
    const expires = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString();
    const { error } = await admin.from("login_codes")
      .upsert({ employee_id: employeeId, code_hash: await sha256(`${employeeId}:${code}`), expires_at: expires, attempts: 0 });
    if (error) throw error;
    await admin.rpc("revoke_user_sessions", { p_user: userId });
    return { code, expires_at: expires };
  }

  try {
    const body = await req.json();
    switch (body.action) {
      case "create_branch": {
        const name = String(body.name ?? "").trim();
        const username = slug(String(body.username ?? ""));
        if (!name || !username) return json({ error: "Branch name and login username are required" }, 400);
        if (!checkPassword(body.password)) return json({ error: "Password must be at least 8 characters" }, 400);
        const { data: b, error } = await admin.from("branches")
          .insert({ firm_id: firm.id, name, address: body.address || null }).select("id, name, address").single();
        if (error) throw new Error(error.code === "23505" ? "A branch with this name already exists" : error.message);
        try { await createLogin(`${firm.code}-${username}`, body.password, { role: "branch", branch_id: b.id }); }
        catch (e) { await admin.from("branches").delete().eq("id", b.id); throw e; }
        return json({ branch: b, login_id: `${firm.code}-${username}` });
      }

      case "delete_branch": {
        const { data: b } = await admin.from("branches").select("id").eq("id", body.branch_id).eq("firm_id", firm.id).maybeSingle();
        if (!b) return json({ error: "Branch not found" }, 404);
        const { count } = await admin.from("employees").select("id", { count: "exact", head: true }).eq("branch_id", b.id).eq("status", "active");
        if (count) return json({ error: `Move this branch's ${count} active employee(s) to another branch first` }, 400);
        const p = await profileFor("branch_id", b.id);
        if (p) await admin.auth.admin.deleteUser(p.id);
        await admin.from("branches").delete().eq("id", b.id);
        return json({ ok: true });
      }

      case "create_employee_login": {
        const { data: e } = await admin.from("employees").select("id, emp_code, status, branch_id").eq("id", body.employee_id).eq("firm_id", firm.id).maybeSingle();
        if (!e) return json({ error: "Employee not found" }, 404);
        if (!e.branch_id) return json({ error: "Assign the employee to a branch first" }, 400);
        if (e.status !== "active") return json({ error: "Activate the employee first" }, 400);
        const loginId = `${firm.code}-${slug(e.emp_code)}`;
        await createLogin(loginId, randomSecret(), { role: "employee", employee_id: e.id });
        const p = await profileFor("employee_id", e.id);
        return json({ login_id: loginId, ...(await issueCode(e.id, p!.id)) });
      }

      case "generate_code": {
        const { data: e } = await admin.from("employees").select("id, status").eq("id", body.employee_id).eq("firm_id", firm.id).maybeSingle();
        if (!e) return json({ error: "Employee not found" }, 404);
        if (e.status !== "active") return json({ error: "Activate the employee first" }, 400);
        const p = await profileFor("employee_id", e.id);
        if (!p) return json({ error: "Create the employee's login first" }, 400);
        return json(await issueCode(e.id, p.id));
      }

      case "logout_device": {
        const p = await profileFor("employee_id", body.employee_id);
        if (!p) return json({ error: "Login not found" }, 404);
        await admin.rpc("revoke_user_sessions", { p_user: p.id });
        await admin.from("login_codes").delete().eq("employee_id", body.employee_id);
        return json({ ok: true });
      }

      case "revoke_employee_login": {
        // profileFor() is scoped to this firm, so another firm's employee is never touched.
        const p = await profileFor("employee_id", body.employee_id);
        if (!p) return json({ error: "Login not found" }, 404);
        await admin.auth.admin.deleteUser(p.id);
        await admin.from("login_codes").delete().eq("employee_id", body.employee_id);
        return json({ ok: true });
      }

      case "reset_password": {
        if (!checkPassword(body.password)) return json({ error: "Password must be at least 8 characters" }, 400);
        if (!body.branch_id) return json({ error: "Employees sign in with a one-time code, not a password" }, 400);
        const p = await profileFor("branch_id", body.branch_id);
        if (!p) return json({ error: "Login not found" }, 404);
        const { error } = await admin.auth.admin.updateUserById(p.id, { password: body.password });
        if (error) throw error;
        return json({ ok: true });
      }
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
