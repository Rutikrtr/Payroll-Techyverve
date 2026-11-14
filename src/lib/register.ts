import type { CustomComponent, Firm, Line, Payslip } from "./types";
import { monthLabel } from "./format";

/**
 * Salary register (the monthly "pagar patrak"): one row per employee, one column per pay head that has a value,
 * grouped as Fixed pay → Total pay → Variable pay → Gross → Deductions & loans → Net pay, with a Total row.
 */

type Group = "fixed" | "variable" | "deduction";
export interface RegisterColumn { key: string; label: string; group: Group }
export interface RegisterRow { sr: number; empCode: string; name: string; branch: string; days: number; basisDays: number; values: Map<string, number>; fixedTotal: number; gross: number; deductions: number; net: number }
export interface Register { title: string; subtitle: string; month: string; columns: RegisterColumn[]; rows: RegisterRow[]; showBranch: boolean }

const BUILTIN: Record<string, { label: string; group: Group; order: number }> = {
  basic: { label: "Basic", group: "fixed", order: 0 },
  hra: { label: "House Rent (HRA)", group: "fixed", order: 1 },
  conveyance: { label: "Conveyance", group: "fixed", order: 2 },
  special: { label: "Special Allowance", group: "fixed", order: 3 },
  other: { label: "Other Allowance", group: "fixed", order: 4 },
  ot: { label: "Overtime", group: "variable", order: 0 },
  pf: { label: "PF", group: "deduction", order: 0 },
  esi: { label: "ESI", group: "deduction", order: 1 },
  pt: { label: "Prof. Tax", group: "deduction", order: 2 },
  tds: { label: "TDS", group: "deduction", order: 3 },
};
const LEGACY: Record<string, string> = {
  "Basic Salary": "basic", "House Rent Allowance": "hra", Conveyance: "conveyance", "Special Allowance": "special",
  "Other Allowance": "other", "Provident Fund (EPF)": "pf", ESI: "esi", "Professional Tax": "pt", "Income Tax (TDS)": "tds",
};
/** Column key for a line; payslips made before keys existed are mapped from their label. */
const keyOf = (l: Line) => l.key ?? LEGACY[l.label] ?? (l.label.startsWith("Overtime") ? "ot" : `label:${l.label}`);

export function buildRegister(
  slips: Payslip[], firm: Firm, month: string, heads: CustomComponent[], branchOf: (employeeId: string) => string, branchFilter: string | null,
): Register {
  const headOrder = new Map(heads.map((h, i) => [`c:${h.id}`, i]));
  const cols = new Map<string, RegisterColumn & { order: number; sub: number }>();
  const note = (l: Line, g: Group) => {
    const key = keyOf(l);
    if (cols.has(key)) return;
    const b = BUILTIN[key];
    const group: Group = g === "deduction" ? "deduction" : b?.group ?? l.group ?? "fixed";
    // Order inside a group: built-ins first, then pay heads in Settings order, then loans, then anything else.
    const sub = b ? 0 : headOrder.has(key) ? 1 : key.startsWith("loan:") ? 2 : 3;
    cols.set(key, { key, group, label: b?.label ?? l.label.replace(/^Overtime.*/, "Overtime"), order: b?.order ?? headOrder.get(key) ?? 0, sub });
  };

  const picked = slips.filter((s) => !branchFilter || branchOf(s.employee_id) === branchFilter)
    .sort((a, b) => (branchOf(a.employee_id) + a.snapshot.employee.emp_code).localeCompare(branchOf(b.employee_id) + b.snapshot.employee.emp_code, undefined, { numeric: true }));

  const rows: RegisterRow[] = picked.map((s, i) => {
    const values = new Map<string, number>();
    for (const l of s.snapshot.earnings) { note(l, "fixed"); values.set(keyOf(l), (values.get(keyOf(l)) ?? 0) + l.amount); }
    for (const l of s.snapshot.deductions) { note(l, "deduction"); values.set(keyOf(l), (values.get(keyOf(l)) ?? 0) + l.amount); }
    const fixedTotal = s.snapshot.earnings.filter((l) => (cols.get(keyOf(l))?.group ?? "fixed") === "fixed").reduce((t, l) => t + l.amount, 0);
    return {
      sr: i + 1, empCode: s.snapshot.employee.emp_code, name: s.snapshot.employee.full_name, branch: branchOf(s.employee_id),
      days: s.snapshot.attendance.paid_days, basisDays: s.snapshot.attendance.basis_days, values, fixedTotal,
      gross: Number(s.gross), deductions: Number(s.total_deductions), net: Number(s.net_pay),
    };
  });
  if (!cols.has("basic")) cols.set("basic", { key: "basic", label: "Basic", group: "fixed", order: 0, sub: 0 });

  const rank = { fixed: 0, variable: 1, deduction: 2 };
  const columns = [...cols.values()]
    .filter((c) => c.key === "basic" || rows.some((r) => r.values.get(c.key)))
    .sort((a, b) => rank[a.group] - rank[b.group] || a.sub - b.sub || a.order - b.order || a.label.localeCompare(b.label))
    .map(({ key, label, group }) => ({ key, label, group }));

  return {
    title: firm.legal_name || firm.name,
    subtitle: [branchFilter ? `${branchFilter} branch` : firm.multi_branch ? "All branches" : null, [firm.address, firm.city].filter(Boolean).join(", ") || null].filter(Boolean).join(" · "),
    month, columns, rows, showBranch: firm.multi_branch && !branchFilter,
  };
}

/* ───────────────────────── Excel (.xlsx) ───────────────────────── */

const INR = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';
const WINE = "FF7B1E3A", WINE_LIGHT = "FFF6E3E8", GREY = "FFF3F2F0";

/** Builds the formatted workbook (separate from download so it can be tested outside the browser). */
export async function buildRegisterWorkbook(reg: Register) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Techyverve Payroll";
  const ws = wb.addWorksheet(`Salary ${monthLabel(reg.month)}`.slice(0, 31), {
    pageSetup: { paperSize: 5 as never, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: "&LPrinted &D&RPage &P of &N" },
  });

  const fixed = reg.columns.filter((c) => c.group === "fixed");
  const variable = reg.columns.filter((c) => c.group === "variable");
  const deductions = reg.columns.filter((c) => c.group === "deduction");

  // Column layout: identity | fixed… Total Pay | variable… Gross | deductions… Total Deductions | Net Pay | Signature
  type Col = { header: string; width: number; get: (r: RegisterRow) => number | string; money?: boolean; group: string; bold?: boolean };
  const layout: Col[] = [
    { header: "Sr.", width: 5, get: (r) => r.sr, group: "Employee" },
    { header: "Emp ID", width: 9, get: (r) => r.empCode, group: "Employee" },
    { header: "Name", width: 26, get: (r) => r.name, group: "Employee" },
    ...(reg.showBranch ? [{ header: "Branch", width: 12, get: (r: RegisterRow) => r.branch, group: "Employee" }] : []),
    { header: "Days", width: 7, get: (r) => r.days, group: "Employee" },
    ...fixed.map((c) => ({ header: c.label, width: 11, get: (r: RegisterRow) => r.values.get(c.key) ?? 0, money: true, group: "Fixed Pay" })),
    { header: "Total Pay", width: 12, get: (r) => r.fixedTotal, money: true, group: "Fixed Pay", bold: true },
    ...variable.map((c) => ({ header: c.label, width: 11, get: (r: RegisterRow) => r.values.get(c.key) ?? 0, money: true, group: "Variable Pay" })),
    { header: "Gross Earnings", width: 13, get: (r) => r.gross, money: true, group: variable.length ? "Variable Pay" : "Earnings", bold: true },
    ...deductions.map((c) => ({ header: c.label, width: 11, get: (r: RegisterRow) => r.values.get(c.key) ?? 0, money: true, group: "Deductions & Loans" })),
    { header: "Total Deductions", width: 13, get: (r) => r.deductions, money: true, group: "Deductions & Loans", bold: true },
    { header: "Net Pay (₹)", width: 13, get: (r) => r.net, money: true, group: "Net Payable", bold: true },
    { header: "Signature", width: 14, get: () => "", group: "Net Payable" },
  ];
  const last = layout.length;
  ws.columns = layout.map((c) => ({ width: c.width }));

  const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  // Title block
  const title = (row: number, text: string, size: number, bold = true) => {
    ws.mergeCells(row, 1, row, last);
    const c = ws.getCell(row, 1);
    c.value = text; c.font = { size, bold, color: { argb: bold ? "FF081026" : "FF6B7C99" } }; c.alignment = { horizontal: "center", vertical: "middle" };
  };
  title(1, reg.title, 15);
  title(2, reg.subtitle || " ", 10, false);
  title(3, `Salary Register — ${monthLabel(reg.month)}`, 12);
  ws.getRow(1).height = 22;

  // Group header (row 5) and column headers (row 6)
  let start = 1;
  for (let i = 1; i <= last; i++) {
    if (i === last || layout[i].group !== layout[i - 1].group) {
      if (i > start) ws.mergeCells(5, start, 5, i);
      const c = ws.getCell(5, start);
      c.value = layout[start - 1].group;
      start = i + 1;
    }
  }
  for (let i = 1; i <= last; i++) {
    const g = ws.getCell(5, i);
    g.font = { bold: true, color: { argb: "FFFFFFFF" } }; g.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WINE } };
    g.alignment = { horizontal: "center", vertical: "middle" }; g.border = border;
    const h = ws.getCell(6, i);
    h.value = layout[i - 1].header; h.font = { bold: true, size: 10 }; h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WINE_LIGHT } };
    h.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; h.border = border;
  }
  ws.getRow(6).height = 30;

  // Data rows
  const first = 7;
  reg.rows.forEach((r, idx) => {
    const row = ws.getRow(first + idx);
    layout.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = c.get(r);
      cell.border = border;
      if (c.money) cell.numFmt = INR;
      if (c.header === "Days") { cell.numFmt = "0.##"; cell.alignment = { horizontal: "center" }; }
      if (c.bold) cell.font = { bold: true };
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBFAF9" } };
    });
  });

  // Total row (formulas, so the sheet still adds up if someone edits a cell)
  const tr = first + reg.rows.length;
  const endRow = tr - 1;
  ws.mergeCells(tr, 1, tr, reg.showBranch ? 4 : 3);
  ws.getCell(tr, 1).value = "Total";
  layout.forEach((c, i) => {
    const cell = ws.getCell(tr, i + 1);
    if (c.money && reg.rows.length) {
      const col = ws.getColumn(i + 1).letter;
      cell.value = { formula: `SUM(${col}${first}:${col}${endRow})`, result: reg.rows.reduce((t, r) => t + Number(c.get(r)), 0) };
      cell.numFmt = INR;
    }
    cell.font = { bold: true }; cell.border = border;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
  });
  ws.getCell(tr, 1).alignment = { horizontal: "center" };

  ws.views = [{ state: "frozen", xSplit: reg.showBranch ? 4 : 3, ySplit: 6 }];
  ws.pageSetup.printTitlesRow = "5:6";

  return wb;
}

export async function downloadRegisterXlsx(reg: Register, fileName: string) {
  const buf = await (await buildRegisterWorkbook(reg)).xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
