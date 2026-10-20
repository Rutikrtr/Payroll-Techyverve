import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calculator, ChevronLeft, ChevronRight, Download, Eye, FileText, Lock, Printer, RotateCcw, Search, Unlock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import type { Payslip as Slip, PayrollRun, SlipTemplate } from "../../lib/types";
import { Badge, Button, Empty, IconButton, Modal, PageHeader, Skeleton, useToast } from "../../components/ui";
import { useSettings } from "../../lib/hooks";
import { computeSlip } from "../../lib/payroll";
import Payslip from "../../components/Payslip";
import { daysInMonth, firstOfMonth, initials, money, monthLabel, parseYmd, ymd } from "../../lib/format";

export default function Payroll() {
  const { firm } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const [month, setMonth] = useState(() => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth() - (d.getDate() < 25 ? 1 : 0), 1)); });
  const [run, setRun] = useState<PayrollRun | null | undefined>(undefined);
  const [slips, setSlips] = useState<(Slip & { employees?: { full_name: string } })[]>([]);
  const [history, setHistory] = useState<PayrollRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<Slip | null>(null);
  const [template, setTemplate] = useState<SlipTemplate | null>(null);

  async function load() {
    setRun(undefined);
    const [{ data: r }, { data: h }] = await Promise.all([
      supabase.from("payroll_runs").select("*").eq("month", month).maybeSingle(),
      supabase.from("payroll_runs").select("*").order("month", { ascending: false }).limit(12),
    ]);
    setRun(r); setHistory(h ?? []);
    if (r) {
      const { data } = await supabase.from("payslips").select("*").eq("run_id", r.id);
      setSlips((data ?? []).sort((a, b) => a.snapshot.employee.emp_code.localeCompare(b.snapshot.employee.emp_code)));
    } else setSlips([]);
  }
  useEffect(() => { load(); }, [month]);

  async function generate() {
    if (!settings || !firm) return;
    setBusy(true);
    const end = ymd(new Date(parseYmd(month).getFullYear(), parseYmd(month).getMonth(), daysInMonth(month)));
    const [{ data: emps }, { data: att }, { data: hol }] = await Promise.all([
      supabase.from("employees").select("*").eq("status", "active"),
      supabase.from("attendance").select("*").gte("date", month).lte("date", end),
      supabase.from("holidays").select("*").gte("date", month).lte("date", end),
    ]);
    const eligible = (emps ?? []).filter((e) => (!e.date_of_joining || e.date_of_joining <= end) && (!e.date_of_exit || e.date_of_exit >= month));
    if (!eligible.length) { setBusy(false); return toast("error", "No active employees for this month."); }

    const computed = eligible.map((e) => ({ e, s: computeSlip(e, settings, month, (att ?? []).filter((a) => a.employee_id === e.id), hol ?? []) }));
    const totals = computed.reduce((t, x) => ({ g: t.g + x.s.gross, n: t.n + x.s.net_pay }), { g: 0, n: 0 });

    const { data: r, error } = await supabase.from("payroll_runs").upsert({
      firm_id: firm.id, month, status: "draft", total_gross: totals.g, total_net: totals.n, employee_count: computed.length,
    }, { onConflict: "firm_id,month" }).select().single();
    if (error) { setBusy(false); return toast("error", error.message); }
    await supabase.from("payslips").delete().eq("run_id", r.id);
    const { error: e2 } = await supabase.from("payslips").insert(computed.map(({ e, s }) => ({
      run_id: r.id, firm_id: firm.id, employee_id: e.id, month, snapshot: s, gross: s.gross, total_deductions: s.total_deductions, net_pay: s.net_pay,
    })));
    setBusy(false);
    if (e2) return toast("error", e2.message);
    toast("ok", `Payroll calculated for ${computed.length} employees`);
    load();
  }

  async function setStatus(status: "draft" | "finalized") {
    const { error } = await supabase.from("payroll_runs").update({ status, finalized_at: status === "finalized" ? new Date().toISOString() : null }).eq("id", run!.id);
    if (error) return toast("error", error.message);
    toast("ok", status === "finalized" ? "Payroll finalized and locked. Payslips are ready." : "Payroll reopened for changes");
    load();
  }

  function exportCsv() {
    const head = ["Emp code", "Name", "Paid days", "LOP days", "Gross", "Deductions", "Net pay", "Bank", "Account", "IFSC"];
    const rows = slips.map((s) => { const e = s.snapshot.employee; return [e.emp_code, e.full_name, s.snapshot.attendance.paid_days, s.snapshot.attendance.lop_days, s.gross, s.total_deductions, s.net_pay, e.bank_name ?? "", e.bank_account ?? "", e.ifsc ?? ""]; });
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `payroll-${month.slice(0, 7)}.csv`; a.click();
  }

  function shift(n: number) { const d = parseYmd(month); setMonth(ymd(new Date(d.getFullYear(), d.getMonth() + n, 1))); }

  const list = useMemo(() => slips.filter((s) => [s.snapshot.employee.full_name, s.snapshot.employee.emp_code].some((v) => v.toLowerCase().includes(q.toLowerCase()))), [slips, q]);
  const tpl = template ?? settings?.slip_template ?? "classic";
  const totalDed = slips.reduce((t, s) => t + Number(s.total_deductions), 0);
  const lopTotal = slips.reduce((t, s) => t + s.snapshot.attendance.lop_days, 0);
  const finalized = run?.status === "finalized";
  const printUrl = (emp?: string) => `/app/slips/${run?.id}?template=${tpl}${emp ? `&emp=${emp}` : ""}`;

  return (
    <>
      <PageHeader title="Payroll & payslips" subtitle="Calculate from attendance and your deduction rules, review, then finalize and print."
        actions={<>
          <div className="flex items-center rounded-lg bg-white ring-1 ring-line">
            <IconButton label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="size-4" /></IconButton>
            <span className="min-w-[132px] text-center font-medium">{monthLabel(month)}</span>
            <IconButton label="Next month" onClick={() => shift(1)} disabled={month >= firstOfMonth()}><ChevronRight className="size-4" /></IconButton>
          </div>
          {!finalized && <Button loading={busy} icon={run ? <RotateCcw className="size-4" /> : <Calculator className="size-4" />} onClick={generate}>{run ? "Recalculate" : "Run payroll"}</Button>}
        </>} />

      {run === undefined ? <Skeleton className="h-72" /> : !run ? (
        <div className="card">
          <Empty icon={<Calculator className="size-6" />} title={`No payroll for ${monthLabel(month)} yet`}
            body="Make sure attendance for the month is complete, then run payroll. You can recalculate any time before finalizing."
            action={<div className="flex gap-2"><Link to="/app/attendance"><Button variant="secondary">Review attendance</Button></Link><Button loading={busy} onClick={generate} icon={<Calculator className="size-4" />}>Run payroll</Button></div>} />
        </div>
      ) : (<>
        <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
          <div className="col-span-2 xl:col-span-1 rounded-xl bg-wine-700 p-5 text-white shadow-card">
            <div className="flex items-center justify-between text-[13px] text-white/70">Net payout <Badge tone={finalized ? "ok" : "warn"} dot>{finalized ? "Finalized" : "Draft"}</Badge></div>
            <div className="num mt-2 font-display text-[32px] font-medium tracking-[-0.03em]">{money(Number(run.total_net))}</div>
            <div className="text-[12px] text-white/60">{run.employee_count} employees</div>
          </div>
          {[["Gross earnings", money(Number(run.total_gross))], ["Total deductions", money(totalDed)], ["Loss-of-pay days", String(lopTotal)]].map(([k, v]) => (
            <div key={k} className="card p-5"><div className="text-[13px] text-ink-3">{k}</div><div className="num mt-2 font-display text-[26px] font-medium tracking-[-0.02em]">{v}</div></div>
          ))}
        </div>

        <div className="card mt-4 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 items-center gap-2 px-1">
              <Search className="size-4 text-ink-4" aria-hidden />
              <input aria-label="Search payslips" className="h-8 flex-1 bg-transparent outline-none placeholder:text-ink-4" placeholder="Search employee…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-[13px] text-ink-3">Format
                <select className="input h-8 w-auto" value={tpl} onChange={(e) => setTemplate(e.target.value as SlipTemplate)}>
                  <option value="classic">Classic</option><option value="modern">Modern</option><option value="compact">Compact</option>
                </select>
              </label>
              <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>Bank CSV</Button>
              <Button size="sm" variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.open(printUrl(), "_blank")}>Print all slips</Button>
              {finalized
                ? <Button size="sm" variant="secondary" icon={<Unlock className="size-4" />} onClick={() => setStatus("draft")}>Reopen</Button>
                : <Button size="sm" icon={<Lock className="size-4" />} onClick={() => setStatus("finalized")}>Finalize payroll</Button>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead><tr>
                <th className="th">Employee</th><th className="th text-right">Paid / payable</th><th className="th text-right">LOP</th>
                <th className="th text-right">Gross</th><th className="th text-right">Deductions</th><th className="th text-right">Net pay</th><th className="th w-24 text-right">Slip</th>
              </tr></thead>
              <tbody>
                {list.map((s) => {
                  const e = s.snapshot.employee, a = s.snapshot.attendance;
                  return (
                    <tr key={s.id} className="hover:bg-canvas/60">
                      <td className="td"><div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">{initials(e.full_name)}</div>
                        <div><div className="font-medium">{e.full_name}</div><div className="text-[12px] text-ink-3">{e.emp_code} · {e.designation || "—"}</div></div>
                      </div></td>
                      <td className="td num text-right">{a.paid_days} <span className="text-ink-4">/ {a.basis_days}</span></td>
                      <td className="td num text-right">{a.lop_days > 0 ? <span className="text-bad">{a.lop_days}</span> : <span className="text-ink-4">0</span>}</td>
                      <td className="td num text-right">{money(Number(s.gross))}</td>
                      <td className="td num text-right text-ink-2">−{money(Number(s.total_deductions))}</td>
                      <td className="td num text-right font-semibold">{money(Number(s.net_pay))}</td>
                      <td className="td"><div className="flex justify-end">
                        <IconButton label={`Preview ${e.full_name}'s slip`} onClick={() => setPreview(s)}><Eye className="size-4" /></IconButton>
                        <IconButton label={`Print ${e.full_name}'s slip`} onClick={() => window.open(printUrl(s.employee_id), "_blank")}><Printer className="size-4" /></IconButton>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      {history.length > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="text-[16px] font-medium">Payroll history</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {history.map((h) => (
              <button key={h.id} onClick={() => setMonth(h.month)} className={`flex items-center justify-between rounded-xl p-3 text-left ring-1 cursor-pointer transition ${h.month === month ? "bg-wine-50 ring-wine-300" : "ring-line hover:ring-ink-4"}`}>
                <div><div className="font-medium">{monthLabel(h.month)}</div><div className="num text-[12px] text-ink-3">{money(Number(h.total_net))} · {h.employee_count} emp</div></div>
                {h.status === "finalized" ? <Lock className="size-4 text-ok" aria-label="Finalized" /> : <FileText className="size-4 text-warn" aria-label="Draft" />}
              </button>
            ))}
          </div>
        </section>
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} wide title="Payslip preview" description={preview ? `${preview.snapshot.employee.full_name} · ${monthLabel(month)}` : ""}
        footer={<><Button variant="secondary" onClick={() => setPreview(null)}>Close</Button><Button icon={<Printer className="size-4" />} onClick={() => window.open(printUrl(preview!.employee_id), "_blank")}>Print / Save PDF</Button></>}>
        {preview && firm && settings && <div className="overflow-x-auto"><div className="min-w-[640px]"><Payslip firm={firm} opts={{ ...settings, slip_template: tpl }} month={month} slip={preview.snapshot} /></div></div>}
      </Modal>
    </>
  );
}
