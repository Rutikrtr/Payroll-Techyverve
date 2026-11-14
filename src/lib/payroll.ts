import type { Attendance, Employee, FirmSettings, Holiday, Line, SlipSnapshot } from "./types";
import { daysInMonth, parseYmd, ymd } from "./format";

const r = (n: number) => Math.round(n);

export const monthlyGross = (e: Employee) =>
  Number(e.basic) + Number(e.hra) + Number(e.conveyance) + Number(e.special_allowance) + Number(e.other_allowance);

/** Whether a calendar day is a scheduled non-working day (weekly off or holiday). */
export function dayKind(date: string, s: FirmSettings, holidaySet: Set<string>): "working" | "week_off" | "holiday" {
  if (holidaySet.has(date)) return "holiday";
  if (s.weekly_offs.includes(parseYmd(date).getDay())) return "week_off";
  return "working";
}

/** A loan's EMI due this month, already capped at the outstanding balance. */
export interface LoanDue { id: string; name: string; amount: number }

/** Per-employee inputs beyond the salary structure: pay head amounts and loan EMIs due. */
export interface SlipExtras { headAmounts?: Map<string, number>; loans?: LoanDue[] }

/** Month's recovery for a loan: the EMI, or what is left if less; nothing before the start month or once closed/repaid. */
export function loanDue(loan: { emi: number; principal: number; start_month: string; closed: boolean }, month: string, recoveredBefore: number) {
  if (loan.closed || loan.start_month > month) return 0;
  return Math.max(0, Math.min(Number(loan.emi), Number(loan.principal) - recoveredBefore));
}

export function computeSlip(
  e: Employee, s: FirmSettings, month: string, rows: Attendance[], holidays: Holiday[], extras: SlipExtras = {},
): SlipSnapshot {
  const total = daysInMonth(month);
  const start = parseYmd(month);
  const holidaySet = new Set(holidays.map((h) => h.date));
  const byDate = new Map(rows.map((a) => [a.date, a]));

  let present = 0, halfDays = 0, paidLeave = 0, absent = 0, unpaid = 0, lates = 0, ot = 0, notEmployed = 0, workingDays = 0;

  for (let i = 0; i < total; i++) {
    const date = ymd(new Date(start.getFullYear(), start.getMonth(), i + 1));
    const kind = dayKind(date, s, holidaySet);
    if (kind === "working") workingDays++;

    const employed = (!e.date_of_joining || date >= e.date_of_joining) && (!e.date_of_exit || date <= e.date_of_exit);
    if (!employed) { if (kind === "working" || s.lop_basis !== "working") notEmployed++; continue; }

    const a = byDate.get(date);
    if (a) {
      if (a.is_late) lates++;
      ot += Number(a.ot_hours) || 0;
    }
    const status = a?.status ?? (kind === "working" ? (s.unmarked_as === "present" ? "present" : "absent") : kind);
    switch (status) {
      case "present": present++; break;
      case "half_day": halfDays++; break;
      case "paid_leave": paidLeave++; break;
      case "unpaid_leave": unpaid++; break;
      case "absent": absent++; break;
      default: break; // holiday / week_off are paid
    }
  }

  const basis = s.lop_basis === "calendar" ? total : s.lop_basis === "fixed30" ? 30 : workingDays;
  const excessLeave = Math.max(0, paidLeave - Number(s.paid_leaves_per_month));
  const latePenalty = s.lates_per_half_day > 0 ? Math.floor(lates / s.lates_per_half_day) * 0.5 : 0;
  const lop = Math.min(basis, absent + unpaid + halfDays * 0.5 + excessLeave + latePenalty + notEmployed);
  const paid = Math.max(0, basis - lop);
  const ratio = basis > 0 ? paid / basis : 0;

  const heads = s.custom_components ?? [];
  const headValue = (c: (typeof heads)[number]) =>
    c.calc === "per_employee" ? extras.headAmounts?.get(c.id) ?? 0 : c.calc === "fixed" ? Number(c.value) : 0;

  const earnings: Line[] = [];
  const add = (key: string, label: string, amount: number, group: "fixed" | "variable" = "fixed") => {
    if (amount) earnings.push({ key, label, amount: r(amount), group });
  };
  const basic = Number(e.basic) * ratio;
  add("basic", "Basic Salary", basic);
  add("hra", "House Rent Allowance", Number(e.hra) * ratio);
  add("conveyance", "Conveyance", Number(e.conveyance) * ratio);
  add("special", "Special Allowance", Number(e.special_allowance) * ratio);
  add("other", "Other Allowance", Number(e.other_allowance) * ratio);
  // Amount-based earning heads (per employee / same for all); prorated for absent days unless switched off.
  for (const c of heads.filter((c) => c.kind === "earning" && (c.calc === "per_employee" || c.calc === "fixed"))) {
    add(`c:${c.id}`, c.name, headValue(c) * (c.prorate === false ? 1 : ratio), c.group ?? "fixed");
  }
  if (s.ot_enabled && ot > 0 && basis > 0) {
    add("ot", `Overtime (${ot} h)`, (monthlyGross(e) / basis / Number(s.standard_hours)) * Number(s.ot_multiplier) * ot, "variable");
  }
  // Percentage earning heads use the earnings above as their base.
  const baseGross = earnings.reduce((t, l) => t + l.amount, 0);
  for (const c of heads.filter((c) => c.kind === "earning" && (c.calc === "pct_basic" || c.calc === "pct_gross"))) {
    add(`c:${c.id}`, c.name, ((c.calc === "pct_basic" ? basic : baseGross) * Number(c.value)) / 100, c.group ?? "fixed");
  }
  const gross = earnings.reduce((t, l) => t + l.amount, 0);

  const deductions: Line[] = [];
  const ded = (key: string, label: string, amount: number, loan_id?: string) => {
    if (amount > 0) deductions.push({ key, label, amount: r(amount), ...(loan_id ? { loan_id } : {}) });
  };
  if (s.pf_enabled && e.pf_applicable) ded("pf", "Provident Fund (EPF)", (Math.min(basic, Number(s.pf_wage_cap)) * Number(s.pf_rate)) / 100);
  if (s.esi_enabled && e.esi_applicable && monthlyGross(e) <= Number(s.esi_threshold))
    ded("esi", "ESI", Math.ceil((gross * Number(s.esi_rate)) / 100));
  if (s.pt_enabled && gross > Number(s.pt_threshold)) ded("pt", "Professional Tax", Number(s.pt_amount));
  if (s.tds_enabled && Number(s.tds_rate) > 0) ded("tds", "Income Tax (TDS)", (gross * Number(s.tds_rate)) / 100);
  for (const c of heads.filter((c) => c.kind === "deduction")) {
    const amount = c.calc === "pct_basic" ? (basic * Number(c.value)) / 100 : c.calc === "pct_gross" ? (gross * Number(c.value)) / 100 : headValue(c);
    ded(`c:${c.id}`, c.name, amount);
  }
  // Loans / advances: the EMI due this month (already capped at the balance), whole rupees.
  for (const l of extras.loans ?? []) ded(`loan:${l.name.trim().toLowerCase()}`, l.name, l.amount, l.id);

  // Never deduct more than was earned: trim loan recoveries first, so net pay can't go negative.
  let totalDed = deductions.reduce((t, l) => t + l.amount, 0);
  for (let i = deductions.length - 1; i >= 0 && totalDed > gross; i--) {
    const l = deductions[i];
    if (!l.loan_id) continue;
    const cut = Math.min(l.amount, totalDed - gross);
    l.amount -= cut; totalDed -= cut;
    if (l.amount === 0) deductions.splice(i, 1);
  }

  return {
    employee: {
      emp_code: e.emp_code, full_name: e.full_name, designation: e.designation, department: e.department,
      date_of_joining: e.date_of_joining, pan: e.pan, uan: e.uan, esi_number: e.esi_number,
      bank_name: e.bank_name, bank_account: e.bank_account, ifsc: e.ifsc,
    },
    attendance: {
      basis_days: basis, paid_days: paid, lop_days: lop, present, half_days: halfDays, paid_leave: paidLeave,
      absent: absent + unpaid, late_marks: lates, ot_hours: ot,
    },
    earnings, deductions, gross, total_deductions: totalDed, net_pay: Math.max(0, gross - totalDed),
  };
}
