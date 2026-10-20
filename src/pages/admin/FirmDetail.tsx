import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, KeyRound, Pencil, Power, Trash2 } from "lucide-react";
import { supabase, adminFirm } from "../../lib/supabase";
import type { Firm } from "../../lib/types";
import { Badge, Button, Field, Modal, PageHeader, Skeleton, useToast } from "../../components/ui";
import FirmForm, { type FirmDraft } from "./FirmForm";
import { dateLabel, money } from "../../lib/format";

type Stat = { firm_id: string; employees: number; present_today: number; last_payroll: string | null; last_net: number | null };

function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex justify-between gap-4 py-2.5 border-b border-line/70 last:border-0"><dt className="text-ink-3">{k}</dt><dd className="text-right font-medium text-ink break-all">{v || "—"}</dd></div>;
}

export default function FirmDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [firm, setFirm] = useState<Firm | null>(null);
  const [stat, setStat] = useState<Stat | null>(null);
  const [edit, setEdit] = useState<FirmDraft | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: f }, { data: s }] = await Promise.all([supabase.from("firms").select("*").eq("id", id!).single(), supabase.rpc("platform_stats")]);
    setFirm(f);
    setStat(((s as Stat[]) ?? []).find((x) => x.firm_id === id) ?? null);
  }
  useEffect(() => { load(); }, [id]);

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const { id: _id, created_at, hr_email, status, code, ...rest } = edit as Firm;
    const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v]));
    const { error } = await supabase.from("firms").update(clean).eq("id", id!);
    setBusy(false);
    if (error) return toast("error", error.message);
    toast("ok", "Firm details updated"); setEdit(null); load();
  }

  async function toggle() {
    const next = firm!.status === "active" ? "suspended" : "active";
    const { error } = await supabase.from("firms").update({ status: next }).eq("id", id!);
    if (error) return toast("error", error.message);
    toast("ok", next === "active" ? "Workspace reactivated" : "Workspace suspended. HR can no longer sign in."); load();
  }

  async function resetPw(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await adminFirm({ action: "reset_password", firm_id: id, password: pw }); toast("ok", "HR password updated"); setPwOpen(false); setPw(""); }
    catch (err) { toast("error", (err as Error).message); }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try { await adminFirm({ action: "delete", firm_id: id }); toast("ok", `${firm!.name} deleted`); nav("/admin/firms"); }
    catch (err) { toast("error", (err as Error).message); setBusy(false); }
  }

  if (!firm) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></div>;

  return (
    <>
      <Link to="/admin/firms" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> All firms</Link>
      <PageHeader title={firm.name}
        subtitle={<span className="inline-flex items-center gap-2"><Badge dot tone={firm.status === "active" ? "ok" : "bad"}>{firm.status === "active" ? "Active" : "Suspended"}</Badge> Onboarded {dateLabel(firm.created_at.slice(0, 10))}</span>}
        actions={<>
          <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(firm)}>Edit details</Button>
          <Button variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => setPwOpen(true)}>Reset HR password</Button>
          <Button variant={firm.status === "active" ? "danger" : "primary"} icon={<Power className="size-4" />} onClick={toggle}>{firm.status === "active" ? "Suspend" : "Reactivate"}</Button>
        </>} />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-4">
        {[
          ["Active employees", `${stat?.employees ?? 0} / ${firm.employee_limit}`],
          ["Present today", String(stat?.present_today ?? 0)],
          ["Last payroll", stat?.last_payroll ? dateLabel(stat.last_payroll).slice(3) : "Not run yet"],
          ["Last net payout", stat?.last_net ? money(Number(stat.last_net)) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="card p-5"><div className="text-[13px] text-ink-3">{k}</div><div className="num mt-2 font-display text-[22px] font-medium tracking-tight">{v}</div></div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5"><h2 className="eyebrow mb-2">Company</h2><dl className="text-[14px]">
          <Row k="Workspace" v={firm.multi_branch ? "Multi-branch" : "Single branch"} /><Row k="Firm code" v={firm.code} />
          <Row k="Legal name" v={firm.legal_name} /><Row k="Industry" v={firm.industry} />
          <Row k="Address" v={[firm.address, firm.city, firm.state, firm.pincode].filter(Boolean).join(", ")} /><Row k="Country" v={firm.country} />
        </dl></section>
        <section className="card p-5"><h2 className="eyebrow mb-2">Registrations</h2><dl className="text-[14px]">
          <Row k="GSTIN" v={firm.gstin} /><Row k="PAN" v={firm.pan} /><Row k="TAN" v={firm.tan} /><Row k="PF code" v={firm.pf_code} /><Row k="ESI code" v={firm.esi_code} />
        </dl></section>
        <section className="card p-5"><h2 className="eyebrow mb-2">Contact & login</h2><dl className="text-[14px]">
          <Row k="HR login" v={firm.hr_email} /><Row k="Contact" v={firm.contact_name} /><Row k="Email" v={firm.contact_email} /><Row k="Phone" v={firm.contact_phone} />
        </dl></section>
      </div>

      <section className="card mt-4 flex flex-col gap-3 border border-rose-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-[15px] font-medium text-bad">Delete firm</h2><p className="text-[13px] text-ink-3">Permanently removes the firm, its HR login, employees, attendance and payslips.</p></div>
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDelOpen(true)}>Delete firm</Button>
      </section>

      <Modal open={!!edit} onClose={() => setEdit(null)} wide title="Edit firm details"
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" form="firm-edit" loading={busy}>Save changes</Button></>}>
        <form id="firm-edit" onSubmit={save}>{edit && <FirmForm value={edit} onChange={setEdit} />}</form>
      </Modal>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Reset HR password" description={`New password for ${firm.hr_email}`}
        footer={<><Button variant="secondary" onClick={() => setPwOpen(false)}>Cancel</Button><Button type="submit" form="pw" loading={busy}>Update password</Button></>}>
        <form id="pw" onSubmit={resetPw}><Field label="New password" hint="8+ characters"><input className="input" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field></form>
      </Modal>

      <Modal open={delOpen} onClose={() => setDelOpen(false)} title={`Delete ${firm.name}?`} description="This cannot be undone."
        footer={<><Button variant="secondary" onClick={() => setDelOpen(false)}>Cancel</Button><Button className="!bg-bad !text-white" disabled={confirm !== firm.name} loading={busy} onClick={remove}>Delete permanently</Button></>}>
        <Field label={`Type "${firm.name}" to confirm`}><input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
