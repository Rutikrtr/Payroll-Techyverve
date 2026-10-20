import type { Firm, FirmSettings, Line, SlipSnapshot } from "../lib/types";
import { amountInWords, dateLabel, money2, monthLabel } from "../lib/format";

type Opts = Pick<FirmSettings, "slip_template" | "slip_accent" | "slip_show_bank" | "slip_show_attendance" | "slip_show_logo" | "slip_amount_in_words" | "slip_footer">;

interface Props { firm: Firm; opts: Opts; month: string; slip: SlipSnapshot }

const rupee = (n: number) => `₹ ${money2(n)}`;

function pad(earn: Line[], ded: Line[]) {
  const n = Math.max(earn.length, ded.length);
  return Array.from({ length: n }, (_, i) => [earn[i], ded[i]] as const);
}

function FirmMark({ firm, accent, size = 44 }: { firm: Firm; accent: string; size?: number }) {
  if (firm.logo_url) return <img src={firm.logo_url} alt="" style={{ height: size, width: "auto" }} />;
  return (
    <div style={{ width: size, height: size, background: accent }} className="flex items-center justify-center rounded-lg font-display text-[16px] font-semibold text-white">
      {firm.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
    </div>
  );
}

const address = (f: Firm) => [f.address, f.city, f.state, f.pincode].filter(Boolean).join(", ");

function infoPairs(s: SlipSnapshot, opts: Opts) {
  const e = s.employee;
  const pairs: [string, string][] = [
    ["Employee name", e.full_name], ["Employee code", e.emp_code],
    ["Designation", e.designation || "—"], ["Department", e.department || "—"],
    ["Date of joining", dateLabel(e.date_of_joining)], ["PAN", e.pan || "—"],
    ["UAN", e.uan || "—"], ["ESI no.", e.esi_number || "—"],
  ];
  if (opts.slip_show_bank) pairs.push(["Bank", e.bank_name || "—"], ["Account no.", e.bank_account || "—"]);
  return pairs;
}

function attPairs(s: SlipSnapshot): [string, string][] {
  const a = s.attendance;
  return [["Payable days", String(a.basis_days)], ["Paid days", String(a.paid_days)], ["LOP days", String(a.lop_days)],
    ["Present", String(a.present)], ["Half days", String(a.half_days)], ["Paid leave", String(a.paid_leave)], ["Late marks", String(a.late_marks)]];
}

/* ─────────────── Classic: bordered, formal, two-column table ─────────────── */
function Classic({ firm, opts, month, slip }: Props) {
  const a = opts.slip_accent;
  return (
    <div className="bg-white text-[12px] text-ink" style={{ border: `1px solid #d6d9e2` }}>
      <div className="flex items-center gap-4 px-6 py-5" style={{ borderBottom: `3px solid ${a}` }}>
        {opts.slip_show_logo && <FirmMark firm={firm} accent={a} />}
        <div className="flex-1">
          <div className="font-display text-[18px] font-semibold">{firm.legal_name || firm.name}</div>
          <div className="text-ink-3">{address(firm)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-ink-3">Payslip for</div>
          <div className="font-display text-[15px] font-semibold" style={{ color: a }}>{monthLabel(month)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-8 px-6 py-4">
        {infoPairs(slip, opts).map(([k, v]) => <div key={k} className="flex justify-between border-b border-dashed border-line py-1.5"><span className="text-ink-3">{k}</span><span className="font-medium">{v}</span></div>)}
      </div>
      {opts.slip_show_attendance && (
        <div className="mx-6 mb-4 grid grid-cols-7 overflow-hidden rounded border border-line text-center">
          {attPairs(slip).map(([k, v]) => <div key={k} className="border-r border-line py-2 last:border-0"><div className="text-[10px] text-ink-3">{k}</div><div className="num font-semibold">{v}</div></div>)}
        </div>
      )}
      <table className="mx-6 mb-4 w-[calc(100%-3rem)] border border-line">
        <thead><tr style={{ background: a, color: "#fff" }}>
          <th className="px-3 py-2 text-left font-semibold">Earnings</th><th className="px-3 py-2 text-right font-semibold">Amount</th>
          <th className="border-l border-white/30 px-3 py-2 text-left font-semibold">Deductions</th><th className="px-3 py-2 text-right font-semibold">Amount</th>
        </tr></thead>
        <tbody>
          {pad(slip.earnings, slip.deductions).map(([e, d], i) => (
            <tr key={i} className="border-b border-line">
              <td className="px-3 py-1.5">{e?.label}</td><td className="num px-3 py-1.5 text-right">{e && money2(e.amount)}</td>
              <td className="border-l border-line px-3 py-1.5">{d?.label}</td><td className="num px-3 py-1.5 text-right">{d && money2(d.amount)}</td>
            </tr>
          ))}
          <tr className="font-semibold" style={{ background: "#f7f5f4" }}>
            <td className="px-3 py-2">Gross earnings</td><td className="num px-3 py-2 text-right">{money2(slip.gross)}</td>
            <td className="border-l border-line px-3 py-2">Total deductions</td><td className="num px-3 py-2 text-right">{money2(slip.total_deductions)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mx-6 mb-5 flex items-center justify-between rounded px-4 py-3" style={{ background: a + "12", border: `1px solid ${a}40` }}>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3">Net pay</div>
          {opts.slip_amount_in_words && <div className="text-[11px] italic text-ink-2">{amountInWords(slip.net_pay)}</div>}
        </div>
        <div className="num font-display text-[20px] font-semibold" style={{ color: a }}>{rupee(slip.net_pay)}</div>
      </div>
      <div className="border-t border-line px-6 py-3 text-center text-[10px] text-ink-3">{opts.slip_footer}</div>
    </div>
  );
}

/* ─────────────── Modern: bold header band, cards, big net pay ─────────────── */
function Modern({ firm, opts, month, slip }: Props) {
  const a = opts.slip_accent;
  return (
    <div className="overflow-hidden rounded-xl bg-white text-[12px] text-ink" style={{ boxShadow: "0 0 0 1px #e6e8ef" }}>
      <div className="flex items-start justify-between gap-4 px-7 py-6 text-white" style={{ background: `linear-gradient(135deg, ${a}, #14060c)` }}>
        <div className="flex items-center gap-3">
          {opts.slip_show_logo && <div className="rounded-lg bg-white/15 p-1"><FirmMark firm={firm} accent="transparent" size={40} /></div>}
          <div><div className="font-display text-[18px] font-semibold">{firm.legal_name || firm.name}</div><div className="text-white/70">{address(firm)}</div></div>
        </div>
        <div className="text-right"><div className="text-white/60 text-[11px] uppercase tracking-wider">Salary slip</div><div className="font-display text-[16px] font-semibold">{monthLabel(month)}</div></div>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-center gap-6 px-7 py-5 border-b border-line">
        <div>
          <div className="font-display text-[17px] font-semibold">{slip.employee.full_name}</div>
          <div className="text-ink-3">{slip.employee.emp_code} · {slip.employee.designation || "—"} · {slip.employee.department || "—"}</div>
        </div>
        <div className="rounded-xl px-5 py-3 text-right" style={{ background: a + "10" }}>
          <div className="text-[11px] text-ink-3">Net pay</div>
          <div className="num font-display text-[24px] font-semibold leading-tight" style={{ color: a }}>{rupee(slip.net_pay)}</div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-x-6 gap-y-2 px-7 py-4 border-b border-line">
        {infoPairs(slip, opts).slice(4).map(([k, v]) => <div key={k}><div className="text-[10px] uppercase tracking-wider text-ink-3">{k}</div><div className="font-medium">{v}</div></div>)}
      </div>
      {opts.slip_show_attendance && (
        <div className="flex flex-wrap gap-2 px-7 py-4 border-b border-line">
          {attPairs(slip).map(([k, v]) => <span key={k} className="rounded-full px-3 py-1" style={{ background: "#f6f5f3" }}><span className="text-ink-3">{k}</span> <b className="num">{v}</b></span>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-5 px-7 py-5">
        {([["Earnings", slip.earnings, slip.gross, "Gross"], ["Deductions", slip.deductions, slip.total_deductions, "Total"]] as const).map(([title, lines, total, tl]) => (
          <div key={title} className="rounded-xl border border-line">
            <div className="px-4 py-2.5 font-semibold" style={{ color: a }}>{title}</div>
            {lines.map((l) => <div key={l.label} className="flex justify-between border-t border-line/70 px-4 py-1.5"><span>{l.label}</span><span className="num">{money2(l.amount)}</span></div>)}
            {lines.length === 0 && <div className="border-t border-line/70 px-4 py-1.5 text-ink-3">None</div>}
            <div className="flex justify-between border-t border-line px-4 py-2.5 font-semibold" style={{ background: "#faf9f8" }}><span>{tl}</span><span className="num">{money2(total)}</span></div>
          </div>
        ))}
      </div>
      {opts.slip_amount_in_words && <div className="px-7 pb-4 text-ink-2"><span className="text-ink-3">In words:</span> {amountInWords(slip.net_pay)}</div>}
      <div className="px-7 py-3 text-[10px] text-ink-3" style={{ background: "#faf9f8" }}>{opts.slip_footer}</div>
    </div>
  );
}

/* ─────────────── Compact: minimal, single list, fits half page ─────────────── */
function Compact({ firm, opts, month, slip }: Props) {
  const a = opts.slip_accent;
  return (
    <div className="bg-white px-6 py-5 text-[12px] text-ink" style={{ borderTop: `4px solid ${a}`, boxShadow: "0 0 0 1px #e6e8ef" }}>
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">{opts.slip_show_logo && <FirmMark firm={firm} accent={a} size={28} />}<span className="font-display text-[15px] font-semibold">{firm.name}</span></div>
        <span className="text-ink-3">Payslip · {monthLabel(month)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-ink-2">
        <span><b>{slip.employee.full_name}</b> ({slip.employee.emp_code})</span>
        <span>{slip.employee.designation || "—"}</span>
        {opts.slip_show_bank && slip.employee.bank_account && <span>A/c {slip.employee.bank_account}</span>}
        {opts.slip_show_attendance && <span>Paid days {slip.attendance.paid_days}/{slip.attendance.basis_days} · LOP {slip.attendance.lop_days}</span>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>{slip.earnings.map((l) => <div key={l.label} className="flex justify-between py-0.5"><span>{l.label}</span><span className="num">{money2(l.amount)}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Gross</span><span className="num">{money2(slip.gross)}</span></div></div>
        <div>{slip.deductions.map((l) => <div key={l.label} className="flex justify-between py-0.5"><span>{l.label}</span><span className="num">−{money2(l.amount)}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Deductions</span><span className="num">−{money2(slip.total_deductions)}</span></div></div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-md px-3 py-2 text-white" style={{ background: a }}>
        <span className="font-medium">Net pay{opts.slip_amount_in_words && <span className="ml-2 text-[10px] font-normal text-white/75">{amountInWords(slip.net_pay)}</span>}</span>
        <span className="num font-display text-[16px] font-semibold">{rupee(slip.net_pay)}</span>
      </div>
      <div className="mt-3 text-[10px] text-ink-3">{opts.slip_footer}</div>
    </div>
  );
}

export default function Payslip(p: Props) {
  if (p.opts.slip_template === "modern") return <Modern {...p} />;
  if (p.opts.slip_template === "compact") return <Compact {...p} />;
  return <Classic {...p} />;
}

export const SAMPLE_SLIP: SlipSnapshot = {
  employee: { emp_code: "EMP001", full_name: "Aarav Sharma", designation: "Senior Engineer", department: "Engineering", date_of_joining: "2024-04-01",
    pan: "ABCPS1234K", uan: "100234567890", esi_number: null, bank_name: "HDFC Bank", bank_account: "XXXXXX4321", ifsc: "HDFC0001234" },
  attendance: { basis_days: 26, paid_days: 25, lop_days: 1, present: 23, half_days: 0, paid_leave: 2, absent: 1, late_marks: 2, ot_hours: 0 },
  earnings: [{ label: "Basic Salary", amount: 24038 }, { label: "House Rent Allowance", amount: 9615 }, { label: "Special Allowance", amount: 7212 }, { label: "Conveyance", amount: 1538 }],
  deductions: [{ label: "Provident Fund (EPF)", amount: 1800 }, { label: "Professional Tax", amount: 200 }],
  gross: 42403, total_deductions: 2000, net_pay: 40403,
};
