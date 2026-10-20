import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, Pencil, Plus, Search, UserX, Users } from "lucide-react";
import { firmUsers, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import type { Branch, Employee } from "../../lib/types";
import { Badge, Button, Empty, Field, IconButton, Modal, PageHeader, Skeleton, Switch, useToast } from "../../components/ui";
import { useEmployees } from "../../lib/hooks";
import { dateLabel, initials, money } from "../../lib/format";
import { monthlyGross } from "../../lib/payroll";

type Draft = Partial<Employee>;
const blank: Draft = {
  emp_code: "", full_name: "", email: "", phone: "", designation: "", department: "", date_of_joining: "", date_of_exit: "",
  pan: "", uan: "", esi_number: "", bank_name: "", bank_account: "", ifsc: "",
  basic: 0, hra: 0, conveyance: 0, special_allowance: 0, other_allowance: 0, pf_applicable: true, esi_applicable: true, status: "active",
};

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset><legend className="eyebrow mb-3">{title}</legend><div className="grid gap-4 sm:grid-cols-2">{children}</div></fieldset>;
}

export default function Employees() {
  const { firm } = useAuth();
  const { employees, reload } = useEmployees();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"active" | "inactive" | "all">("active");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const multi = !!firm?.multi_branch;
  const [branches, setBranches] = useState<Pick<Branch, "id" | "name">[]>([]);
  const [logins, setLogins] = useState<Map<string, string>>(new Map());
  const [branchFilter, setBranchFilter] = useState("all");
  const [loginPw, setLoginPw] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const loadAccess = useCallback(async () => {
    if (!multi) return;
    const [{ data: b }, { data: p }] = await Promise.all([
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("profiles").select("employee_id, login_id").eq("role", "employee"),
    ]);
    setBranches(b ?? []);
    setLogins(new Map((p ?? []).map((x) => [x.employee_id as string, x.login_id as string])));
  }, [multi]);
  useEffect(() => { loadAccess(); }, [loadAccess]);
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";

  async function loginAction(action: "create_employee_login" | "reset_password" | "revoke_employee_login") {
    setLoginBusy(true);
    try {
      const r = await firmUsers<{ login_id?: string }>({ action, employee_id: draft!.id, password: loginPw });
      toast("ok", action === "create_employee_login" ? `Login created: ${r.login_id}` : action === "reset_password" ? "Password updated" : "Login removed");
      setLoginPw(""); loadAccess();
    } catch (err) { toast("error", (err as Error).message); }
    setLoginBusy(false);
  }

  const list = useMemo(() => (employees ?? [])
    .filter((e) => filter === "all" || e.status === filter)
    .filter((e) => branchFilter === "all" || e.branch_id === branchFilter)
    .filter((e) => [e.full_name, e.emp_code, e.department, e.designation, e.email].some((v) => v?.toLowerCase().includes(q.toLowerCase()))), [employees, q, filter, branchFilter]);

  const activeCount = (employees ?? []).filter((e) => e.status === "active").length;
  const payrollCost = (employees ?? []).filter((e) => e.status === "active").reduce((t, e) => t + monthlyGross(e), 0);

  function openNew() {
    const nextNo = (employees?.length ?? 0) + 1;
    setLoginPw(""); setDraft({ ...blank, emp_code: `EMP${String(nextNo).padStart(3, "0")}` });
  }

  const set = (k: keyof Employee) => ({
    value: (draft?.[k] as string | number | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft({ ...draft, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }),
  });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (multi && !draft!.branch_id) return toast("error", "Choose the employee's branch.");
    if (!draft!.id && firm && activeCount >= firm.employee_limit) return toast("error", `Your plan allows ${firm.employee_limit} active employees. Contact the platform admin to raise the limit.`);
    setBusy(true);
    const { id, ...rest } = draft as Employee;
    const payload = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v]));
    const res = id
      ? await supabase.from("employees").update(payload).eq("id", id)
      : await supabase.from("employees").insert({ ...payload, firm_id: firm!.id });
    setBusy(false);
    if (res.error) return toast("error", res.error.code === "23505" ? "That employee code is already in use." : res.error.message);
    toast("ok", id ? "Employee updated" : `${draft!.full_name} added`);
    setDraft(null); reload();
  }

  const gross = draft ? monthlyGross(draft as Employee) : 0;

  return (
    <>
      <PageHeader title="Employees" subtitle={`${activeCount} active of ${firm?.employee_limit} allowed · Monthly gross ${money(payrollCost)}`}
        actions={<Button icon={<Plus className="size-4" />} onClick={openNew}>Add employee</Button>} />

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 px-1">
            <Search className="size-4 text-ink-4" aria-hidden />
            <input aria-label="Search employees" className="h-8 flex-1 bg-transparent outline-none placeholder:text-ink-4" placeholder="Search by name, code, department…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select aria-label="Filter by status" className="input h-9 w-auto" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
          </select>
          {multi && (
            <select aria-label="Filter by branch" className="input h-9 w-auto" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="all">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>
        {employees === null ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          : list.length === 0 ? <Empty icon={<Users className="size-6" />} title={q ? "No matches" : "No employees yet"} body={q ? "Try another search." : "Add your first employee with their salary structure."}
            action={!q && <Button icon={<Plus className="size-4" />} onClick={openNew}>Add employee</Button>} />
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead><tr><th className="th">Employee</th><th className="th">{multi ? "Branch" : "Department"}</th>{multi && <th className="th">Login ID</th>}<th className="th">Joined</th><th className="th text-right">Monthly gross</th><th className="th">Statutory</th><th className="th">Status</th><th className="th w-12" /></tr></thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id} className="hover:bg-canvas/60">
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">{initials(e.full_name)}</div>
                          <div><div className="font-medium">{e.full_name}</div><div className="text-[12px] text-ink-3">{e.emp_code} · {e.designation || "—"}</div></div>
                        </div>
                      </td>
                      <td className="td text-ink-2">{multi ? branchName(e.branch_id) : e.department || "—"}</td>
                      {multi && <td className="td">{logins.get(e.id) ? <span className="font-mono text-[13px]">{logins.get(e.id)}</span> : <span className="text-[12px] text-ink-4">No login</span>}</td>}
                      <td className="td text-ink-2">{dateLabel(e.date_of_joining)}</td>
                      <td className="td num text-right font-medium">{money(monthlyGross(e))}</td>
                      <td className="td"><div className="flex gap-1">{e.pf_applicable && <Badge>PF</Badge>}{e.esi_applicable && <Badge>ESI</Badge>}</div></td>
                      <td className="td"><Badge dot tone={e.status === "active" ? "ok" : "neutral"}>{e.status === "active" ? "Active" : "Inactive"}</Badge></td>
                      <td className="td"><IconButton label={`Edit ${e.full_name}`} onClick={() => { setLoginPw(""); setDraft(e); }}><Pencil className="size-4" /></IconButton></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <Modal open={!!draft} onClose={() => setDraft(null)} wide title={draft?.id ? `Edit ${draft.full_name}` : "Add employee"} description="Salary components are monthly amounts before deductions."
        footer={<><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" form="emp" loading={busy}>{draft?.id ? "Save changes" : "Add employee"}</Button></>}>
        {draft && (
          <form id="emp" onSubmit={save} className="space-y-7">
            <Group title="Basic details">
              <Field label="Full name *"><input className="input" required {...set("full_name")} /></Field>
              <Field label="Employee code *"><input className="input uppercase" required {...set("emp_code")} /></Field>
              <Field label="Email"><input className="input" type="email" {...set("email")} /></Field>
              <Field label="Phone"><input className="input" type="tel" {...set("phone")} /></Field>
            </Group>
            <Group title="Job">
              <Field label="Designation"><input className="input" {...set("designation")} /></Field>
              <Field label="Department"><input className="input" list="depts" {...set("department")} />
                <datalist id="depts">{[...new Set((employees ?? []).map((e) => e.department).filter(Boolean))].map((d) => <option key={d!} value={d!} />)}</datalist>
              </Field>
              <Field label="Date of joining"><input className="input" type="date" {...set("date_of_joining")} /></Field>
              <Field label="Date of exit" hint="Leave empty if still employed"><input className="input" type="date" {...set("date_of_exit")} /></Field>
              {multi && (
                <Field label="Branch *" hint={branches.length ? "Employee checks in with this branch's QR" : "Create a branch first under Branches"}>
                  <select className="input" required value={draft.branch_id ?? ""} onChange={(e) => setDraft({ ...draft, branch_id: e.target.value || null })}>
                    <option value="">Choose branch…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
              )}
            </Group>
            <fieldset>
              <legend className="eyebrow mb-3">Salary structure (monthly)</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Basic"><input className="input num" type="number" min={0} {...set("basic")} /></Field>
                <Field label="HRA"><input className="input num" type="number" min={0} {...set("hra")} /></Field>
                <Field label="Conveyance"><input className="input num" type="number" min={0} {...set("conveyance")} /></Field>
                <Field label="Special allowance"><input className="input num" type="number" min={0} {...set("special_allowance")} /></Field>
                <Field label="Other allowance"><input className="input num" type="number" min={0} {...set("other_allowance")} /></Field>
                <div className="rounded-lg bg-wine-50 p-3 ring-1 ring-wine-100"><div className="text-[12px] text-wine-700">Monthly gross</div><div className="num font-display text-[20px] font-medium text-wine-800">{money(gross)}</div></div>
              </div>
            </fieldset>
            <Group title="Statutory & bank">
              <Field label="PAN"><input className="input uppercase" {...set("pan")} /></Field>
              <Field label="UAN (PF)"><input className="input" {...set("uan")} /></Field>
              <Field label="ESI number"><input className="input" {...set("esi_number")} /></Field>
              <Field label="Bank name"><input className="input" {...set("bank_name")} /></Field>
              <Field label="Account number"><input className="input num" {...set("bank_account")} /></Field>
              <Field label="IFSC"><input className="input uppercase" {...set("ifsc")} /></Field>
            </Group>
            <div className="divide-y divide-line rounded-xl border border-line px-4">
              <Switch label="PF applicable" description="Deduct employee provident fund" checked={!!draft.pf_applicable} onChange={(v) => setDraft({ ...draft, pf_applicable: v })} />
              <Switch label="ESI applicable" description="Deduct ESI when gross is under the threshold" checked={!!draft.esi_applicable} onChange={(v) => setDraft({ ...draft, esi_applicable: v })} />
              <Switch label="Active" description="Inactive employees are excluded from attendance and payroll" checked={draft.status === "active"} onChange={(v) => setDraft({ ...draft, status: v ? "active" : "inactive" })} />
            </div>
            {multi && (
              <fieldset className="rounded-xl border border-line p-4">
                <legend className="eyebrow px-1">Employee login</legend>
                {!draft.id ? <p className="text-[13px] text-ink-3">Save the employee first, then create their login here.</p>
                  : logins.get(draft.id) ? (
                    <div className="space-y-3">
                      <p className="text-[13px] text-ink-2">Login ID <span className="font-mono font-medium text-ink">{logins.get(draft.id)}</span>. The employee scans their branch QR to check in and out, and sees their own attendance and payslips.</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <Field label="New password" className="flex-1"><input className="input" minLength={8} value={loginPw} autoComplete="new-password" onChange={(e) => setLoginPw(e.target.value)} placeholder="8+ characters" /></Field>
                        <Button type="button" variant="secondary" icon={<KeyRound className="size-4" />} loading={loginBusy} disabled={loginPw.length < 8} onClick={() => loginAction("reset_password")}>Reset password</Button>
                        <Button type="button" variant="danger" icon={<UserX className="size-4" />} loading={loginBusy} onClick={() => loginAction("revoke_employee_login")}>Remove login</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <Field label="Password" className="flex-1" hint={`Login ID will be ${firm?.code}-${(draft.emp_code ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`}>
                        <input className="input" minLength={8} value={loginPw} autoComplete="new-password" onChange={(e) => setLoginPw(e.target.value)} placeholder="8+ characters" />
                      </Field>
                      <Button type="button" icon={<KeyRound className="size-4" />} loading={loginBusy} disabled={loginPw.length < 8 || !draft.branch_id} onClick={() => loginAction("create_employee_login")}>Create login</Button>
                    </div>
                  )}
              </fieldset>
            )}
          </form>
        )}
      </Modal>
    </>
  );
}
