import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Building, KeyRound, LocateFixed, MapPin, Plus, Printer, QrCode as QrIcon, Trash2, Users } from "lucide-react";
import { firmUsers, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import type { Branch } from "../../lib/types";
import { Badge, Button, Empty, Field, IconButton, Modal, PageHeader, Skeleton, useToast } from "../../components/ui";
import QrCode, { scanUrl } from "../../components/QrCode";
import { today } from "../../lib/format";
import BranchLocation, { mapsUrl } from "./BranchLocation";

type Row = Branch & { login_id: string | null; staff: number; inToday: number; outToday: number };

export default function Branches() {
  const { firm } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", username: "", password: "" });
  const [pw, setPw] = useState<{ branch: Row; value: string } | null>(null);
  const [del, setDel] = useState<Row | null>(null);
  const [qr, setQr] = useState<{ branch: Row; token: string } | null>(null);
  const [geo, setGeo] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: b }, { data: p }, { data: e }, { data: a }] = await Promise.all([
      supabase.from("branches").select("id, firm_id, name, address, created_at, lat, lng, radius_m").order("created_at"),
      supabase.from("profiles").select("branch_id, login_id").eq("role", "branch"),
      supabase.from("employees").select("id, branch_id").eq("status", "active"),
      supabase.from("attendance").select("employee_id, check_in, check_out").eq("date", today()),
    ]);
    const empBranch = new Map((e ?? []).map((x) => [x.id, x.branch_id]));
    setRows((b ?? []).map((br) => {
      const att = (a ?? []).filter((x) => empBranch.get(x.employee_id) === br.id);
      return {
        ...br,
        login_id: p?.find((x) => x.branch_id === br.id)?.login_id ?? null,
        staff: (e ?? []).filter((x) => x.branch_id === br.id).length,
        inToday: att.filter((x) => x.check_in).length,
        outToday: att.filter((x) => x.check_out).length,
      };
    }));
  }
  useEffect(() => { load(); }, []);

  const loginPreview = useMemo(() => `${firm?.code}-${form.username.toLowerCase().replace(/[^a-z0-9]/g, "") || "branch"}`, [firm, form.username]);

  if (firm && !firm.multi_branch) return <Navigate to="/app" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await firmUsers<{ login_id: string }>({ action: "create_branch", ...form });
      toast("ok", `Branch created. Login ID: ${r.login_id}`);
      setCreate(false); setForm({ name: "", address: "", username: "", password: "" }); load();
    } catch (err) { toast("error", (err as Error).message); }
    setBusy(false);
  }

  async function resetPw(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await firmUsers({ action: "reset_password", branch_id: pw!.branch.id, password: pw!.value }); toast("ok", "Branch password updated"); setPw(null); }
    catch (err) { toast("error", (err as Error).message); }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try { await firmUsers({ action: "delete_branch", branch_id: del!.id }); toast("ok", `${del!.name} deleted`); setDel(null); load(); }
    catch (err) { toast("error", (err as Error).message); }
    setBusy(false);
  }

  async function showQr(b: Row) {
    const { data, error } = await supabase.rpc("branch_qr", { p_branch: b.id });
    if (error || !data) return toast("error", error?.message ?? "Could not load QR");
    setQr({ branch: b, token: data as string });
  }

  return (
    <>
      <PageHeader title="Branches" subtitle="Each branch has a kiosk login that shows today's attendance QR. Employees scan it to check in and out."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>New branch</Button>} />

      {rows === null ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div>
        : rows.length === 0 ? (
          <div className="card"><Empty icon={<Building className="size-6" />} title="No branches yet"
            body="Create your first branch (for example your head office), then assign employees to it."
            action={<Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>New branch</Button>} /></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((b) => (
              <section key={b.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-[17px] font-medium">{b.name}</h2>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-ink-3"><MapPin className="size-3.5 shrink-0" />{b.address || "No address"}</p>
                  </div>
                  <IconButton label={`Delete ${b.name}`} className="hover:text-bad" onClick={() => setDel(b)}><Trash2 className="size-4" /></IconButton>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[["Staff", b.staff], ["Checked in", b.inToday], ["Checked out", b.outToday]].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-canvas py-2.5"><div className="num font-display text-[20px] font-medium">{v}</div><div className="text-[11px] text-ink-3">{k}</div></div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-dashed border-line px-3 py-2 text-[13px]">
                  <span className="text-ink-3">Kiosk login ID </span><span className="font-mono font-medium">{b.login_id ?? "—"}</span>
                </div>
                <div className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] ${b.lat != null ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                  <LocateFixed className="size-4 shrink-0" />
                  {b.lat != null
                    ? <span>Geofence on · within {b.radius_m} m · <a className="font-medium underline" href={mapsUrl(b.lat, b.lng!)} target="_blank" rel="noreferrer">map</a></span>
                    : <span>No location set: scans are recorded but allowed from anywhere</span>}
                </div>
                <div className="mt-4 flex gap-2 pt-1">
                  <Button size="sm" className="flex-1" icon={<QrIcon className="size-4" />} onClick={() => showQr(b)}>Today's QR</Button>
                  <Button size="sm" variant="secondary" icon={<LocateFixed className="size-4" />} onClick={() => setGeo(b)}>Location</Button>
                  <Button size="sm" variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => setPw({ branch: b, value: "" })}>Password</Button>
                </div>
              </section>
            ))}
          </div>
        )}

      <div className="mt-6 flex items-start gap-3 rounded-xl bg-indigo-50 px-4 py-3 text-[13px] text-indigo-900 ring-1 ring-indigo-100">
        <Users className="mt-0.5 size-4 shrink-0" />
        <p>Assign employees to a branch and create their logins from <b>Employees</b>. An employee can only check in with the QR of their own branch, and the QR changes every day at midnight.</p>
      </div>

      <Modal open={create} onClose={() => setCreate(false)} title="New branch" description="The branch login only shows company info, today's QR and the day's check-ins."
        footer={<><Button variant="secondary" onClick={() => setCreate(false)}>Cancel</Button><Button type="submit" form="branch" loading={busy}>Create branch</Button></>}>
        <form id="branch" onSubmit={submit} className="space-y-4">
          <Field label="Branch name *"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pune Office" /></Field>
          <Field label="Address"><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Login username *" hint={`Login ID: ${loginPreview}`}>
              <input className="input lowercase" required value={form.username} autoComplete="off"
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") })} placeholder="pune" />
            </Field>
            <Field label="Password *" hint="8+ characters"><input className="input" required minLength={8} value={form.password} autoComplete="new-password" onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          </div>
        </form>
      </Modal>

      <Modal open={!!pw} onClose={() => setPw(null)} title="Reset branch password" description={pw ? `${pw.branch.name} · ${pw.branch.login_id}` : ""}
        footer={<><Button variant="secondary" onClick={() => setPw(null)}>Cancel</Button><Button type="submit" form="bpw" loading={busy}>Update password</Button></>}>
        <form id="bpw" onSubmit={resetPw}><Field label="New password" hint="8+ characters"><input className="input" required minLength={8} autoComplete="new-password" value={pw?.value ?? ""} onChange={(e) => setPw({ ...pw!, value: e.target.value })} /></Field></form>
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} title={`Delete ${del?.name}?`} description="Its kiosk login is removed. Attendance history is kept."
        footer={<><Button variant="secondary" onClick={() => setDel(null)}>Cancel</Button><Button className="!bg-bad !text-white" loading={busy} onClick={remove}>Delete branch</Button></>}>
        <p className="text-ink-2">Employees still assigned to this branch must be moved to another branch first.</p>
      </Modal>

      <BranchLocation branch={geo} onClose={() => setGeo(null)} onSaved={load} />

      <Modal open={!!qr} onClose={() => setQr(null)} title={`${qr?.branch.name} · today's QR`} description="Valid until midnight. Employees scan it to check in, and again to check out."
        footer={<><Button variant="secondary" onClick={() => setQr(null)}>Close</Button><Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button></>}>
        {qr && <div className="flex flex-col items-center gap-3 py-2">
          <QrCode value={scanUrl(qr.branch.id, qr.token)} size={260} label={`Attendance QR for ${qr.branch.name}`} />
          <Badge tone="wine">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</Badge>
        </div>}
      </Modal>
    </>
  );
}
