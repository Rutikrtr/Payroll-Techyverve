export type Role = "superadmin" | "hr" | "branch" | "employee";

export interface Profile {
  id: string; role: Role; firm_id: string | null; full_name: string | null;
  branch_id: string | null; employee_id: string | null; login_id: string | null;
}

export interface Firm {
  id: string; code: string; multi_branch: boolean; name: string; legal_name: string | null; industry: string | null;
  address: string | null; city: string | null; state: string | null; pincode: string | null; country: string | null;
  gstin: string | null; pan: string | null; tan: string | null; pf_code: string | null; esi_code: string | null;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  hr_email: string; logo_url: string | null; employee_limit: number; status: "active" | "suspended"; created_at: string;
}

export interface CustomComponent {
  id: string; name: string; kind: "earning" | "deduction"; calc: "fixed" | "pct_basic" | "pct_gross"; value: number;
}

export type SlipTemplate = "classic" | "modern" | "compact";

export interface FirmSettings {
  firm_id: string;
  weekly_offs: number[]; shift_start: string; shift_end: string; late_grace_minutes: number;
  lates_per_half_day: number; half_day_min_hours: number; unmarked_as: "absent" | "present"; paid_leaves_per_month: number;
  lop_basis: "calendar" | "working" | "fixed30"; ot_enabled: boolean; ot_multiplier: number; standard_hours: number;
  pf_enabled: boolean; pf_rate: number; pf_wage_cap: number;
  esi_enabled: boolean; esi_rate: number; esi_threshold: number;
  pt_enabled: boolean; pt_amount: number; pt_threshold: number;
  tds_enabled: boolean; tds_rate: number;
  custom_components: CustomComponent[];
  slip_template: SlipTemplate; slip_accent: string; slip_show_bank: boolean; slip_show_attendance: boolean;
  slip_show_logo: boolean; slip_amount_in_words: boolean; slip_footer: string;
}

export interface Employee {
  id: string; firm_id: string; emp_code: string; full_name: string; email: string | null; phone: string | null;
  designation: string | null; department: string | null; date_of_joining: string | null; date_of_exit: string | null;
  pan: string | null; uan: string | null; esi_number: string | null;
  bank_name: string | null; bank_account: string | null; ifsc: string | null;
  basic: number; hra: number; conveyance: number; special_allowance: number; other_allowance: number;
  pf_applicable: boolean; esi_applicable: boolean; status: "active" | "inactive"; branch_id: string | null;
}

export interface Branch {
  id: string; firm_id: string; name: string; address: string | null; created_at: string;
  lat: number | null; lng: number | null; radius_m: number;
}

export type AttStatus = "present" | "absent" | "half_day" | "paid_leave" | "unpaid_leave" | "holiday" | "week_off";

export interface Attendance {
  id?: string; firm_id: string; employee_id: string; date: string; status: AttStatus;
  check_in: string | null; check_out: string | null; is_late: boolean; ot_hours: number; note: string | null;
  in_lat?: number | null; in_lng?: number | null; in_acc?: number | null;
  out_lat?: number | null; out_lng?: number | null; out_acc?: number | null;
}

export interface Holiday { id: string; firm_id: string; date: string; name: string }

export interface PayrollRun {
  id: string; firm_id: string; month: string; status: "draft" | "finalized";
  total_gross: number; total_net: number; employee_count: number; finalized_at: string | null; created_at: string;
}

export interface Line { label: string; amount: number }

export interface SlipSnapshot {
  employee: Pick<Employee, "emp_code" | "full_name" | "designation" | "department" | "date_of_joining" | "pan" | "uan" | "esi_number" | "bank_name" | "bank_account" | "ifsc">;
  attendance: { basis_days: number; paid_days: number; lop_days: number; present: number; half_days: number; paid_leave: number; absent: number; late_marks: number; ot_hours: number };
  earnings: Line[]; deductions: Line[];
  gross: number; total_deductions: number; net_pay: number;
}

export interface Payslip {
  id: string; run_id: string; firm_id: string; employee_id: string; month: string;
  snapshot: SlipSnapshot; gross: number; total_deductions: number; net_pay: number;
}
