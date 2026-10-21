import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRightLeft, Building, Copy, FileText, KeyRound, Lock, LogOut, MessageCircle, Smartphone, UserX } from "lucide-react";
import { firmUsers, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import type { Branch, Employee } from "../../lib/types";
import { Badge, Button, Empty, Field, Modal, PageHeader, Skeleton, useToast } from "../../components/ui";
import { dateLabel, firstOfMonth, initials, money, monthLabel, today } from "../../lib/format";
import { monthlyGross } from "../../lib/payroll";

type Transfer = { id: string; from_branch_id: string | null; to_branch_id: string | null; effective_date: string; note: string | null; created_at: string };
type LoginStatus = { login_id: string; devices: number; last_seen: string | null; code_pending: boolean } | null;
type SlipRow = { id: string; run_id: string; month: string; gross: number; total_deductions: number; net_pay: number; payroll_runs: { status: string } | null };

function Card({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-medium"><span className="text-wine-700">{icon}</span>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const { firm } = useAuth();
  const toast = useToast();
  const multi = !!firm?.multi_branch;
  const [emp, setEmp] = useState<Employee | null>(null);
  const [branches, setBranches] = useState<Pick<Branch, "id" | "name">[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [login, setLogin] = useState<LoginStatus | undefined>(undefined);
  const [slips, setSlips] = useState<SlipRow[]>([]);
  const [month, setMonth] = useState({ present: 0, absent: 0, leave: 0, late: 0 });
  const [move, setMove] = useState<{ to: string; date: string; note: string } | null>(null);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: e }, { data: b }, { data: t }, { data: s }, { data: a }] = await Promise.all([
      supabase.from("employees").select("*").eq("id", id!).single(),
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("branch_transfers").select("*").eq("employee_id", id!).order("effective_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("payslips").select("id, run_id, month, gross, total_deductions, net_pay, payroll_runs(status)").eq("employee_id", id!).order("month", { ascending: false }),
      supabase.from("attendance").select("status, is_late").eq("employee_id", id!).gte("date", firstOfMonth()).lte("date", today()),
    ]);
    setEmp(e); setBranches(b ?? []); setTransfers(t ?? []); setSlips((s as unknown as SlipRow[]) ?? []);
    const rows = a ?? [];
    setMonth({
      present: rows.filter((r) => r.status === "present").length + rows.filter((r) => r.status === "half_day").length * 0.5,
      absent: rows.filter((r) => ["absent", "unpaid_leave"].includes(r.status)).length,
      leave: rows.filter((r) => r.status === "paid_leave").length,
      late: rows.filter((r) => r.is_late).length,
    });
    if (multi) { const { data: l } = await supabase.rpc("employee_login_status", { p_employee: id }); setLogin((l as LoginStatus) ?? null); }
    else setLogin(null);
  }, [id, multi]);
  useEffect(() => { load(); }, [load]);

  const branchName = (b: string | null) => branches.find((x) => x.id === b)?.name ?? "—";

  async function transfer(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.rpc("transfer_employee", { p_employee: id, p_to_branch: move!.to, p_date: move!.date, p_note: move!.note || null });
    setBusy(false);
    if (error) return toast("error", error.message);
    toast("ok", `${emp!.full_name} moved to ${branchName(move!.to)}`); setMove(null); load();
  }

  async function act(action: "create_employee_login" | "generate_code" | "logout_device" | "revoke_employee_login") {
    setBusy(true);
    try {
      const r = await firmUsers<{ code?: string; expires_at?: string }>({ action, employee_id: id });
      if (r.code) setCode({ code: r.code, expires_at: r.expires_at! });
      else toast("ok", action === "logout_device" ? "Signed out from the employee's phone" : "Login removed");
      load();
    } catch (err) { toast("error", (err as Error).message); }
    setBusy(false);
  }

  if (!emp) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /></div>;

  const gross = monthlyGross(emp);
  const appUrl = `${window.location.origin}/get-app`;
  const shareText = code && login ? `Your ${firm?.name} attendance app login:\nLogin ID: ${login.login_id}\nOne-time code: ${code.code}\n(valid 15 minutes)\nInstall: ${appUrl}` : "";
  const components: [string, number][] = [["Basic", emp.basic], ["HRA", emp.hra], ["Conveyance", emp.conveyance], ["Special allowance", emp.special_allowance], ["Other allowance", emp.other_allowance]];

  return (
    <>
      <Link to="/app/employees" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="size-4" /> All employees</Link>
      <PageHeader
        title={emp.full_name}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-ink/[.06] px-2 py-0.5 font-mono text-[12px] text-ink-2"><Lock className="size-3" />{emp.emp_code}</span>
          {emp.designation || "—"}{multi && <> · {branchName(emp.branch_id)} branch</>}
          <Badge dot tone={emp.status === "active" ? "ok" : "neutral"}>{emp.status === "active" ? "Active" : "Inactive"}</Badge>
        </span>}
        actions={multi && branches.length > 1 && <Button variant="secondary" icon={<ArrowRightLeft className="size-4" />} onClick={() => setMove({ to: "", date: today(), note: "" })}>Transfer branch</Button>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Salary" icon={<FileText className="size-4" />}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><div className="text-[13px] text-ink-3">Monthly gross</div><div className="num font-display text-[32px] font-medium tracking-[-0.03em]">{money(gross)}</div></div>
              <div className="text-right text-[13px] text-ink-3">Annual CTC (gross)<div className="num font-medium text-ink">{money(gross * 12)}</div></div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              {components.map(([k, v]) => (
                <div key={k} className="rounded-lg bg-canvas p-3"><div className="text-[11px] text-ink-3">{k}</div><div className="num font-medium">{money(Number(v))}</div>
                  <div className="mt-1.5 h-1 rounded-full bg-wine-100"><div className="h-full rounded-full bg-wine-600" style={{ width: `${gross ? (Number(v) / gross) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
              {emp.pf_applicable && <Badge>PF</Badge>}{emp.esi_applicable && <Badge>ESI</Badge>}
              <span className="text-ink-3">Joined {dateLabel(emp.date_of_joining)} · Bank {emp.bank_name || "—"} {emp.bank_account ? `· ${emp.bank_account}` : ""}</span>
            </div>
          </Card>

          <Card title="Payslips" icon={<FileText className="size-4" />}>
            {slips.length === 0 ? <p className="text-ink-3">No payroll has been run for this employee yet.</p> : (
              <ul className="divide-y divide-line">
                {slips.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1"><div className="font-medium">{monthLabel(s.month)}</div><div className="num text-[12px] text-ink-3">Gross {money(Number(s.gross))} · Deductions {money(Number(s.total_deductions))}</div></div>
                    <Badge tone={s.payroll_runs?.status === "finalized" ? "ok" : "warn"}>{s.payroll_runs?.status === "finalized" ? "Released" : "Draft"}</Badge>
                    <div className="num w-24 text-right font-semibold">{money(Number(s.net_pay))}</div>
                    <Button size="sm" variant="ghost" onClick={() => window.open(`/app/slips/${s.run_id}?emp=${emp.id}`, "_blank")}>View</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="This month" icon={<FileText className="size-4" />}>
            <div className="grid grid-cols-2 gap-2">
              {[["Present", month.present, "text-ok"], ["Absent", month.absent, "text-bad"], ["Paid leave", month.leave, "text-iris"], ["Late", month.late, "text-warn"]].map(([k, v, c]) => (
                <div key={k as string} className="rounded-lg bg-canvas p-3"><div className="text-[11px] text-ink-3">{k}</div><div className={`num font-display text-[22px] font-medium ${c}`}>{v}</div></div>
              ))}
            </div>
          </Card>

          {multi && (
            <Card title="Branch" icon={<Building className="size-4" />}>
              <div className="rounded-lg bg-wine-50 p-3 ring-1 ring-wine-100"><div className="text-[12px] text-wine-700">Current branch</div><div className="font-display text-[18px] font-medium text-wine-900">{branchName(emp.branch_id)}</div></div>
              <ol className="mt-4 space-y-3 border-l-2 border-line pl-4">
                {transfers.map((t) => (
                  <li key={t.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-wine-600 ring-4 ring-white" aria-hidden />
                    <div className="text-[13px] font-medium">{branchName(t.from_branch_id)} → {branchName(t.to_branch_id)}</div>
                    <div className="text-[12px] text-ink-3">{dateLabel(t.effective_date)}{t.note ? ` · ${t.note}` : ""}</div>
                  </li>
                ))}
                <li className="relative"><span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-ink-4 ring-4 ring-white" aria-hidden />
                  <div className="text-[13px] text-ink-3">Joined {dateLabel(emp.date_of_joining)}</div></li>
              </ol>
            </Card>
          )}

          {multi && (
            <Card title="App login" icon={<Smartphone className="size-4" />}>
              {login === undefined ? <Skeleton className="h-20" /> : !login ? (
                <>
                  <p className="text-[13px] text-ink-3">No app login yet. Creating one gives a one-time code the employee uses to sign in on their phone.</p>
                  <Button className="mt-3 w-full" icon={<KeyRound className="size-4" />} loading={busy} disabled={!emp.branch_id || emp.status !== "active"} onClick={() => act("create_employee_login")}>Create login & code</Button>
                </>
              ) : (
                <>
                  <div className="text-[13px] text-ink-3">Login ID</div>
                  <div className="font-mono font-medium">{login.login_id}</div>
                  <div className="mt-3 flex items-center gap-2 text-[13px]">
                    <span className={`size-2 rounded-full ${login.devices ? "bg-ok" : "bg-ink-4"}`} aria-hidden />
                    {login.devices ? <>Signed in on a phone{login.last_seen && <span className="text-ink-3"> · active {dateLabel(login.last_seen.slice(0, 10))}</span>}</> : login.code_pending ? "Code issued, not used yet" : "Not signed in on any phone"}
                  </div>
                  <div className="mt-4 grid gap-2">
                    <Button icon={<KeyRound className="size-4" />} loading={busy} onClick={() => act("generate_code")}>{login.devices ? "New code (move to new phone)" : "Generate login code"}</Button>
                    {login.devices > 0 && <Button variant="secondary" icon={<LogOut className="size-4" />} loading={busy} onClick={() => act("logout_device")}>Log out device</Button>}
                    <Button variant="danger" icon={<UserX className="size-4" />} loading={busy} onClick={() => act("revoke_employee_login")}>Remove app access</Button>
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal open={!!move} onClose={() => setMove(null)} title={`Transfer ${emp.full_name}`} description={`Currently at ${branchName(emp.branch_id)}. Employee ID ${emp.emp_code} stays the same.`}
        footer={<><Button variant="secondary" onClick={() => setMove(null)}>Cancel</Button><Button type="submit" form="move" loading={busy} disabled={!move?.to}>Transfer</Button></>}>
        {move && (
          <form id="move" onSubmit={transfer} className="space-y-4">
            <Field label="Move to branch *">
              <select className="input" required value={move.to} onChange={(e) => setMove({ ...move, to: e.target.value })}>
                <option value="">Choose branch…</option>
                {branches.filter((b) => b.id !== emp.branch_id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Effective date" hint="From this date they check in with the new branch's QR."><input className="input" type="date" required max={today()} value={move.date} onChange={(e) => setMove({ ...move, date: e.target.value })} /></Field>
            <Field label="Note"><input className="input" value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} placeholder="Reason (optional)" /></Field>
          </form>
        )}
      </Modal>

      <Modal open={!!code} onClose={() => setCode(null)} title="One-time login code" description="Valid for 15 minutes and works once. The employee's old phone has been signed out."
        footer={<>
          <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => { navigator.clipboard.writeText(shareText); toast("ok", "Copied"); }}>Copy</Button>
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"><Button icon={<MessageCircle className="size-4" />}>Send on WhatsApp</Button></a>
        </>}>
        {code && login && (
          <div className="text-center">
            <div className="text-[13px] text-ink-3">Login ID</div>
            <div className="font-mono text-[16px] font-medium">{login.login_id}</div>
            <div className="mt-4 text-[13px] text-ink-3">Code</div>
            <div className="num mt-1 font-display text-[44px] font-semibold tracking-[0.3em] text-wine-700">{code.code}</div>
            <div className="mt-1 text-[12px] text-ink-3">Expires at {new Date(code.expires_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</div>
            <p className="mt-4 rounded-lg bg-canvas p-3 text-[13px] text-ink-2">On the employee's phone: open <b>{appUrl.replace(/^https?:\/\//, "")}</b>, install the app, choose <b>Employee</b> and enter this login ID and code.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
