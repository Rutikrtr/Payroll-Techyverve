// Superadmin-only: create a firm together with its single HR login,
// reset the HR password, or delete a firm (and every login that belongs to it).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Verify caller is a superadmin
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "superadmin") return json({ error: "Forbidden" }, 403);

  const body = await req.json();

  try {
    if (body.action === "create") {
      const { firm, hr_password } = body;
      if (!firm?.name || !firm?.hr_email || !hr_password || hr_password.length < 8)
        return json({ error: "Firm name, HR email and a password of 8+ characters are required" }, 400);
      firm.code = String(firm.code ?? "").toLowerCase();
      if (!/^[a-z0-9]{2,12}$/.test(firm.code))
        return json({ error: "Firm code must be 2–12 lowercase letters or digits" }, 400);

      const { data: created, error: fErr } = await admin.from("firms").insert(firm).select().single();
      if (fErr) throw new Error(fErr.code === "23505" ? "That firm code is already used by another firm" : fErr.message);

      const { data: u, error: uErr } = await admin.auth.admin.createUser({
        email: firm.hr_email,
        password: hr_password,
        email_confirm: true,
        user_metadata: { full_name: firm.contact_name ?? `${firm.name} HR` },
      });
      if (uErr) {
        await admin.from("firms").delete().eq("id", created.id);
        throw uErr;
      }
      const { error: pErr } = await admin.from("profiles").insert({
        id: u.user.id, role: "hr", firm_id: created.id, full_name: firm.contact_name ?? null,
      });
      if (pErr) throw pErr;
      return json({ firm: created });
    }

    if (body.action === "reset_password") {
      const { firm_id, password } = body;
      if (!password || password.length < 8) return json({ error: "Password must be 8+ characters" }, 400);
      const { data: p } = await admin.from("profiles").select("id").eq("firm_id", firm_id).eq("role", "hr").single();
      if (!p) return json({ error: "HR login not found" }, 404);
      const { error } = await admin.auth.admin.updateUserById(p.id, { password });
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "delete") {
      const { data: ps } = await admin.from("profiles").select("id").eq("firm_id", body.firm_id);
      for (const p of ps ?? []) await admin.auth.admin.deleteUser(p.id);
      const { error } = await admin.from("firms").delete().eq("id", body.firm_id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
