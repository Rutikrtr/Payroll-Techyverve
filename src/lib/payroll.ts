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

export function computeSlip(
  e: Employee, s: FirmSettings, month: string, rows: Attendance[], holidays: Holiday[],
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

  const earnings: Line[] = [];
  const add = (label: string, amount: number) => { if (amount) earnings.push({ label, amount: r(amount) }); };
  const basic = Number(e.basic) * ratio;
  add("Basic Salary", basic);
  add("House Rent Allowance", Number(e.hra) * ratio);
  add("Conveyance", Number(e.conveyance) * ratio);
  add("Special Allowance", Number(e.special_allowance) * ratio);
  add("Other Allowance", Number(e.other_allowance) * ratio);
  if (s.ot_enabled && ot > 0 && basis > 0) {
    add(`Overtime (${ot} h)`, (monthlyGross(e) / basis / Number(s.standard_hours)) * Number(s.ot_multiplier) * ot);
  }
  const baseGross = earnings.reduce((t, l) => t + l.amount, 0);
  for (const c of s.custom_components.filter((c) => c.kind === "earning")) {
    add(c.name, c.calc === "fixed" ? c.value : c.calc === "pct_basic" ? (basic * c.value) / 100 : (baseGross * c.value) / 100);
  }
  const gross = earnings.reduce((t, l) => t + l.amount, 0);

  const deductions: Line[] = [];
  const ded = (label: string, amount: number) => { if (amount > 0) deductions.push({ label, amount: r(amount) }); };
  if (s.pf_enabled && e.pf_applicable) ded("Provident Fund (EPF)", (Math.min(basic, Number(s.pf_wage_cap)) * Number(s.pf_rate)) / 100);
  if (s.esi_enabled && e.esi_applicable && monthlyGross(e) <= Number(s.esi_threshold))
    ded("ESI", Math.ceil((gross * Number(s.esi_rate)) / 100));
  if (s.pt_enabled && gross > Number(s.pt_threshold)) ded("Professional Tax", Number(s.pt_amount));
  if (s.tds_enabled && Number(s.tds_rate) > 0) ded("Income Tax (TDS)", (gross * Number(s.tds_rate)) / 100);
  for (const c of s.custom_components.filter((c) => c.kind === "deduction")) {
    ded(c.name, c.calc === "fixed" ? c.value : c.calc === "pct_basic" ? (basic * c.value) / 100 : (gross * c.value) / 100);
  }
  const totalDed = deductions.reduce((t, l) => t + l.amount, 0);

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
