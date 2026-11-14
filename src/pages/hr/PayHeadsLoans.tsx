import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { HandCoins, ListPlus, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useEmployees } from "../../lib/hooks";
import type { CustomComponent, Loan } from "../../lib/types";
import { Badge, Button, cx, Empty, Field, IconButton, Modal, Skeleton, useToast } from "../../components/ui";
import { firstOfMonth, money, monthLabel } from "../../lib/format";

function Card({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-[16px] font-medium">{title}</h2>{description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}</div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const CALC_LABEL: Record<CustomComponent["calc"], string> = {
  per_employee: "Amount per employee", fixed: "Same amount for everyone", pct_basic: "% of earned basic", pct_gross: "% of gross",
};

const PRESETS: Omit<CustomComponent, "id">[] = [
  { name: "Dearness Allowance", kind: "earning", calc: "per_employee", value: 0, group: "fixed", prorate: true },
  { name: "City Allowance", kind: "earning", calc: "per_employee", value: 0, group: "fixed", prorate: true },
  { name: "Cash Allowance", kind: "earning", calc: "per_employee", value: 0, group: "variable", prorate: false },
  { name: "Travel Allowance", kind: "earning", calc: "per_employee", value: 0, group: "variable", prorate: false },
  { name: "Insurance", kind: "deduction", calc: "per_employee", value: 0 },
  { name: "LIC", kind: "deduction", calc: "per_employee", value: 0 },
  { name: "Deduction 1", kind: "deduction", calc: "per_employee", value: 0 },
];

/* ───────────────────────── Pay heads ───────────────────────── */

/** Named earnings/deductions the firm defines; per-employee amounts are entered in a grid. Saved with the Settings Save button. */
export function PayHeads({ items, onChange }: { items: CustomComponent[]; onChange: (c: CustomComponent[]) => void }) {
  const [amountsFor, setAmountsFor] = useState<CustomComponent | null>(null);
  const toast = useToast();
  const edit = (i: number, patch: Partial<CustomComponent>) => onChange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const unused = PRESETS.filter((p) => !items.some((c) => c.name.toLowerCase() === p.name.toLowerCase()));

  async function remove(c: CustomComponent) {
    // Amounts are stored separately; drop them with the head so nothing orphaned stays behind.
    const { error } = await supabase.from("employee_head_amounts").delete().eq("head_id", c.id);
    if (error) return toast("error", error.message);
    onChange(items.filter((x) => x.id !== c.id));
    toast("ok", `${c.name} removed. Click Save changes to apply.`);
  }

  return (
    <Card title="Pay heads"
      description="Earnings and deductions shown on payslips and the salary register. Choose 'Amount per employee' to enter a different amount for each person (e.g. DA, Insurance, LIC).">
      {items.length === 0 ? <p className="rounded-lg bg-canvas px-4 py-6 text-center text-ink-3">No pay heads yet. Add one below or pick a common one.</p> : (
        <div className="space-y-3">
          {items.map((c, i) => (
            <div key={c.id} className="rounded-xl border border-line p-3">
              <div className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_1.6fr_1fr_auto]">
                <Field label="Name"><input className="input" value={c.name} maxLength={40} onChange={(e) => edit(i, { name: e.target.value })} /></Field>
                <Field label="Type">
                  <select className="input" value={c.kind} onChange={(e) => edit(i, { kind: e.target.value as CustomComponent["kind"] })}>
                    <option value="earning">Earning</option><option value="deduction">Deduction</option>
                  </select>
                </Field>
                <Field label="Calculated as">
                  <select className="input" value={c.calc} onChange={(e) => edit(i, { calc: e.target.value as CustomComponent["calc"] })}>
                    {Object.entries(CALC_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                {c.calc === "per_employee"
                  ? <Button type="button" variant="secondary" className="mb-0" icon={<Users className="size-4" />} onClick={() => setAmountsFor(c)}>Amounts</Button>
                  : <Field label={c.calc === "fixed" ? "Amount (₹)" : "Percent"}><input className="input num" type="number" min={0} step="any" value={c.value} onChange={(e) => edit(i, { value: Number(e.target.value) })} /></Field>}
                <IconButton label={`Remove ${c.name}`} className="mb-0.5 hover:text-bad" onClick={() => remove(c)}><Trash2 className="size-4" /></IconButton>
              </div>
              {c.kind === "earning" && (
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3 text-[13px]">
                  <label className="inline-flex items-center gap-2">
                    <span className="text-ink-3">Register column</span>
                    <select className="input h-8 w-auto" value={c.group ?? "fixed"} onChange={(e) => edit(i, { group: e.target.value as "fixed" | "variable" })}>
                      <option value="fixed">Fixed pay</option><option value="variable">Variable pay</option>
                    </select>
                  </label>
                  {(c.calc === "per_employee" || c.calc === "fixed") && (
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input type="checkbox" className="size-4 accent-wine-700" checked={c.prorate !== false} onChange={(e) => edit(i, { prorate: e.target.checked })} />
                      Reduce for absent days
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Plus className="size-4" />}
          onClick={() => onChange([...items, { id: crypto.randomUUID(), name: "New head", kind: "deduction", calc: "per_employee", value: 0 }])}>Add pay head</Button>
        {unused.map((p) => (
          <Button key={p.name} size="sm" variant="ghost" icon={<ListPlus className="size-4" />} onClick={() => onChange([...items, { ...p, id: crypto.randomUUID() }])}>{p.name}</Button>
        ))}
      </div>
      <HeadAmounts head={amountsFor} onClose={() => setAmountsFor(null)} />
    </Card>
  );
}

/** Grid of per-employee amounts for one pay head. Saves immediately (independent of the Settings Save button). */
function HeadAmounts({ head, onClose }: { head: CustomComponent | null; onClose: () => void }) {
  const { firm } = useAuth();
  const { employees } = useEmployees(true);
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!head) return;
    setValues({}); setQ("");
    supabase.from("employee_head_amounts").select("employee_id, amount").eq("head_id", head.id)
      .then(({ data }) => setValues(Object.fromEntries((data ?? []).map((r) => [r.employee_id, String(Number(r.amount))]))));
  }, [head]);

  const list = (employees ?? []).filter((e) => [e.full_name, e.emp_code].some((v) => v.toLowerCase().includes(q.toLowerCase())));
  const total = Object.values(values).reduce((t, v) => t + (Number(v) || 0), 0);

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const rows = (employees ?? []).map((emp) => ({ firm_id: firm!.id, employee_id: emp.id, head_id: head!.id, amount: Math.max(0, Number(values[emp.id]) || 0) }));
    const keep = rows.filter((r) => r.amount > 0);
    const clear = rows.filter((r) => r.amount === 0).map((r) => r.employee_id);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      keep.length ? supabase.from("employee_head_amounts").upsert(keep, { onConflict: "employee_id,head_id" }) : Promise.resolve({ error: null }),
      clear.length ? supabase.from("employee_head_amounts").delete().eq("head_id", head!.id).in("employee_id", clear) : Promise.resolve({ error: null }),
    ]);
    setBusy(false);
    if (e1 || e2) return toast("error", (e1 ?? e2)!.message);
    toast("ok", `${head!.name}: amounts saved for ${keep.length} employee${keep.length === 1 ? "" : "s"}`); onClose();
  }

  return (
    <Modal open={!!head} onClose={onClose} title={`${head?.name ?? ""} · amount per employee`}
      description={`Monthly amount in ₹. Leave empty or 0 for none.${head?.kind === "earning" && head.prorate !== false ? " Reduced for absent days." : ""}`}
      footer={<><span className="mr-auto self-center text-[13px] text-ink-3">Total <b className="num text-ink">{money(total)}</b> / month</span>
        <Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="head-amounts" loading={busy}>Save amounts</Button></>}>
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-line px-3">
        <Search className="size-4 text-ink-4" aria-hidden />
        <input aria-label="Search employees" className="h-9 flex-1 bg-transparent outline-none" placeholder="Search employee…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {employees === null ? <Skeleton className="h-40" /> : (
        <form id="head-amounts" onSubmit={save} className="divide-y divide-line rounded-xl border border-line">
          {list.map((emp) => (
            <label key={emp.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{emp.full_name}</span><span className="text-[12px] text-ink-3">{emp.emp_code}</span></span>
              <span className="text-ink-3">₹</span>
              <input className="input num h-9 w-32 text-right" type="number" min={0} step="1" inputMode="numeric" placeholder="0"
                aria-label={`${head?.name} for ${emp.full_name}`} value={values[emp.id] ?? ""} onChange={(e) => setValues({ ...values, [emp.id]: e.target.value })} />
            </label>
          ))}
          {list.length === 0 && <p className="p-4 text-center text-ink-3">No employees match.</p>}
        </form>
      )}
    </Modal>
  );
}

/* ───────────────────────── Loans & advances ───────────────────────── */

type LoanRow = Loan & { recovered: number; employee: string; code: string };
type Draft = { id?: string; employee_id: string; name: string; principal: string; emi: string; start_month: string; note: string };
const blankDraft = (): Draft => ({ employee_id: "", name: "Loan", principal: "", emi: "", start_month: firstOfMonth(), note: "" });

/** Loans / advances (karj): the EMI is deducted automatically in payroll until the balance is recovered. */
export function Loans() {
  const { firm } = useAuth();
  const { employees } = useEmployees(true);
  const toast = useToast();
  const [rows, setRows] = useState<LoanRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<"active" | "closed" | "all">("active");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: loans }, { data: recs }, { data: emps }] = await Promise.all([
      supabase.from("loans").select("*").order("created_at", { ascending: false }),
      supabase.from("loan_recoveries").select("loan_id, amount"),
      supabase.from("employees").select("id, full_name, emp_code"),
    ]);
    const rec = new Map<string, number>();
    (recs ?? []).forEach((r) => rec.set(r.loan_id, (rec.get(r.loan_id) ?? 0) + Number(r.amount)));
    const emp = new Map((emps ?? []).map((e) => [e.id, e]));
    setRows((loans ?? []).map((l) => ({ ...l, recovered: rec.get(l.id) ?? 0, employee: emp.get(l.employee_id)?.full_name ?? "—", code: emp.get(l.employee_id)?.emp_code ?? "" })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((l) => {
    const done = l.closed || l.recovered >= Number(l.principal);
    return filter === "all" || (filter === "closed" ? done : !done);
  }), [rows, filter]);
  const outstanding = (rows ?? []).filter((l) => !l.closed).reduce((t, l) => t + Math.max(0, Number(l.principal) - l.recovered), 0);
  const monthlyEmi = (rows ?? []).filter((l) => !l.closed && l.recovered < Number(l.principal)).reduce((t, l) => t + Math.min(Number(l.emi), Number(l.principal) - l.recovered), 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    const d = draft!;
    const principal = Number(d.principal), emi = Number(d.emi);
    if (!d.employee_id) return toast("error", "Choose the employee.");
    if (!(principal > 0) || !(emi > 0)) return toast("error", "Enter the loan amount and monthly deduction.");
    if (emi > principal) return toast("error", "Monthly deduction can't be more than the loan amount.");
    setBusy(true);
    const payload = { firm_id: firm!.id, employee_id: d.employee_id, name: d.name.trim() || "Loan", principal, emi, start_month: d.start_month.slice(0, 7) + "-01", note: d.note.trim() || null };
    const { error } = d.id ? await supabase.from("loans").update(payload).eq("id", d.id) : await supabase.from("loans").insert(payload);
    setBusy(false);
    if (error) return toast("error", error.message);
    toast("ok", d.id ? "Loan updated" : `Loan added. ${money(emi)} will be deducted every month from ${monthLabel(payload.start_month)}.`);
    setDraft(null); load();
  }

  async function setClosed(l: LoanRow, closed: boolean) {
    const { error } = await supabase.from("loans").update({ closed }).eq("id", l.id);
    if (error) return toast("error", error.message);
    toast("ok", closed ? "Loan closed. No more deductions." : "Loan reopened"); load();
  }

  async function remove(l: LoanRow) {
    if (l.recovered > 0) return toast("error", "This loan already has recoveries on payslips. Close it instead of deleting.");
    const { error } = await supabase.from("loans").delete().eq("id", l.id);
    if (error) return toast("error", error.message);
    toast("ok", "Loan deleted"); load();
  }

  const months = draft && Number(draft.principal) > 0 && Number(draft.emi) > 0 ? Math.ceil(Number(draft.principal) / Number(draft.emi)) : null;

  return (
    <Card title="Loans & advances"
      description="Karj, salary advances or any amount to recover in instalments. The monthly deduction is taken automatically in payroll until the balance is zero."
      action={<Button icon={<Plus className="size-4" />} onClick={() => setDraft(blankDraft())}>Add loan</Button>}>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-canvas p-3"><div className="text-[12px] text-ink-3">Outstanding</div><div className="num font-display text-[20px] font-medium">{money(outstanding)}</div></div>
        <div className="rounded-lg bg-canvas p-3"><div className="text-[12px] text-ink-3">Deducted per month</div><div className="num font-display text-[20px] font-medium">{money(monthlyEmi)}</div></div>
        <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:justify-end">
          <select aria-label="Filter loans" className="input h-9 w-auto" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="active">Active</option><option value="closed">Closed / repaid</option><option value="all">All</option>
          </select>
        </div>
      </div>

      {rows === null ? <Skeleton className="h-40" /> : shown.length === 0 ? (
        <Empty icon={<HandCoins className="size-6" />} title={filter === "active" ? "No active loans" : "Nothing here"} body="Add a loan or advance to start deducting it from salary." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[760px]">
            <thead><tr>
              <th className="th">Employee</th><th className="th">Name</th><th className="th text-right">Amount</th><th className="th text-right">Monthly</th>
              <th className="th">From</th><th className="th">Recovered</th><th className="th text-right">Balance</th><th className="th w-24" />
            </tr></thead>
            <tbody>
              {shown.map((l) => {
                const balance = Math.max(0, Number(l.principal) - l.recovered);
                const pct = Math.min(100, (l.recovered / Number(l.principal)) * 100);
                const done = l.closed || balance === 0;
                return (
                  <tr key={l.id} className={cx(done && "opacity-60")}>
                    <td className="td"><div className="font-medium">{l.employee}</div><div className="text-[12px] text-ink-3">{l.code}</div></td>
                    <td className="td">{l.name}{l.note && <div className="text-[12px] text-ink-3">{l.note}</div>}</td>
                    <td className="td num text-right">{money(Number(l.principal))}</td>
                    <td className="td num text-right">{money(Number(l.emi))}</td>
                    <td className="td whitespace-nowrap text-ink-2">{monthLabel(l.start_month)}</td>
                    <td className="td min-w-[120px]">
                      <div className="h-1.5 overflow-hidden rounded-full bg-wine-50"><div className="h-full rounded-full bg-wine-600" style={{ width: `${pct}%` }} /></div>
                      <div className="num mt-1 text-[12px] text-ink-3">{money(l.recovered)}</div>
                    </td>
                    <td className="td num text-right font-semibold">{balance === 0 ? <Badge tone="ok">Repaid</Badge> : l.closed ? <Badge>Closed</Badge> : money(balance)}</td>
                    <td className="td"><div className="flex justify-end">
                      <IconButton label="Edit loan" onClick={() => setDraft({ id: l.id, employee_id: l.employee_id, name: l.name, principal: String(l.principal), emi: String(l.emi), start_month: l.start_month, note: l.note ?? "" })}><Pencil className="size-4" /></IconButton>
                      {l.recovered > 0
                        ? <Button size="sm" variant="ghost" onClick={() => setClosed(l, !l.closed)}>{l.closed ? "Reopen" : "Close"}</Button>
                        : <IconButton label="Delete loan" className="hover:text-bad" onClick={() => remove(l)}><Trash2 className="size-4" /></IconButton>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Edit loan" : "Add loan / advance"}
        description="The monthly amount is deducted in each payroll from the start month until the full amount is recovered."
        footer={<><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" form="loan" loading={busy}>{draft?.id ? "Save" : "Add loan"}</Button></>}>
        {draft && (
          <form id="loan" onSubmit={save} className="space-y-4">
            <Field label="Employee *">
              <select className="input" required value={draft.employee_id} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, employee_id: e.target.value })}>
                <option value="">Choose employee…</option>
                {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.emp_code})</option>)}
              </select>
            </Field>
            <Field label="Name *" hint="Shown on the payslip and as a column in the salary register, e.g. Loan, Karj, Salary Advance.">
              <input className="input" required maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} list="loan-names" />
              <datalist id="loan-names">{["Loan", "Karj", "Salary Advance", "Festival Advance"].map((n) => <option key={n} value={n} />)}</datalist>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Total amount (₹) *"><input className="input num" type="number" min={1} step="1" required value={draft.principal} onChange={(e) => setDraft({ ...draft, principal: e.target.value })} /></Field>
              <Field label="Deduct per month (₹) *" hint="Same as total for a one-time deduction"><input className="input num" type="number" min={1} step="1" required value={draft.emi} onChange={(e) => setDraft({ ...draft, emi: e.target.value })} /></Field>
            </div>
            <Field label="Start deducting from">
              <input className="input" type="month" required value={draft.start_month.slice(0, 7)} onChange={(e) => setDraft({ ...draft, start_month: `${e.target.value}-01` })} />
            </Field>
            <Field label="Note"><input className="input" value={draft.note} maxLength={120} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Optional, e.g. sanction no." /></Field>
            {months && <p className="rounded-lg bg-wine-50 px-3 py-2 text-[13px] text-wine-800">About <b>{months} month{months === 1 ? "" : "s"}</b> to recover{months > 1 ? `; the last month deducts only what is left` : ""}.</p>}
          </form>
        )}
      </Modal>
    </Card>
  );
}

