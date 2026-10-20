import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, ChevronLeft, ChevronRight, Eye, FileText, LogIn, LogOut, Printer, ScanLine } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import PortalLayout from "../../components/PortalLayout";
import Payslip from "../../components/Payslip";
import { Badge, Button, cx, Empty, IconButton, Modal, Skeleton, Tabs } from "../../components/ui";
import { STATUS, useSettings } from "../../lib/hooks";
import { dayKind } from "../../lib/payroll";
import { daysInMonth, firstOfMonth, money, monthLabel, parseYmd, today, ymd } from "../../lib/format";
import type { Attendance, Employee, Holiday, Payslip as Slip } from "../../lib/types";

type Tab = "today" | "attendance" | "payslips";

const t12 = (t: string | null) => {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export default function MeHome() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("today");
  const [me, setMe] = useState<(Employee & { branches: { name: string } | null }) | null>(null);

  useEffect(() => {
    supabase.from("employees").select("*, branches(name)").eq("id", profile!.employee_id!).single().then(({ data }) => setMe(data));
  }, [profile]);

  return (
    <PortalLayout subtitle={me ? `${me.full_name} · ${me.branches?.name ?? ""} branch` : "Employee"}>
      {!me ? <Skeleton className="h-64" /> : (<>
        <div className="mb-5">
          <h1 className="text-[24px] font-medium tracking-[-0.02em]">Hi, {me.full_name.split(" ")[0]}</h1>
          <p className="text-ink-3">{me.emp_code}{me.designation ? ` · ${me.designation}` : ""} · {me.branches?.name} branch</p>
        </div>
        <Tabs value={tab} onChange={setTab} items={[{ value: "today", label: "Today" }, { value: "attendance", label: "My attendance" }, { value: "payslips", label: "Payslips" }]} />
        <div className="mt-5">
          {tab === "today" && <Today me={me} />}
          {tab === "attendance" && <MyAttendance me={me} />}
          {tab === "payslips" && <MyPayslips />}
        </div>
      </>)}
    </PortalLayout>
  );
}

function Today({ me }: { me: Employee }) {
  const [row, setRow] = useState<Attendance | null | undefined>(undefined);
  useEffect(() => {
    supabase.from("attendance").select("*").eq("employee_id", me.id).eq("date", today()).maybeSingle().then(({ data }) => setRow(data));
  }, [me.id]);
  if (row === undefined) return <Skeleton className="h-56" />;

  const step = !row?.check_in ? "in" : !row.check_out ? "out" : "done";
  const blocked = row && !row.check_in && !["present", "half_day"].includes(row.status);
  return (
    <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
      <section className="relative overflow-hidden rounded-2xl bg-[#14060c] p-6 text-white shadow-card">
        <div className="pointer-events-none absolute -right-16 -top-20 size-60 rounded-full bg-wine-600/50 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="text-[13px] text-white/60">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
          <div className="mt-2 font-display text-[28px] font-medium leading-tight">
            {blocked ? `Marked ${STATUS[row!.status].label.toLowerCase()}` : step === "in" ? "You haven't checked in" : step === "out" ? "You're checked in" : "Done for today"}
          </div>
          <p className="mt-1 text-white/60">
            {blocked ? "HR has marked today. Contact HR if this is wrong."
              : step === "in" ? "Scan the QR code at your branch to check in."
              : step === "out" ? "Scan the same QR when you leave to check out." : "See you tomorrow."}
          </p>
          {!blocked && step !== "done" && (
            <Link to="/scan" className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 font-medium text-wine-800 transition-colors hover:bg-wine-50">
              <ScanLine className="size-5" />{step === "in" ? "Scan to check in" : "Scan to check out"}
            </Link>
          )}
        </div>
      </section>
      <section className="card grid grid-cols-2 gap-3 p-5">
        <div className="rounded-xl bg-canvas p-4"><div className="flex items-center gap-1.5 text-[12px] text-ink-3"><LogIn className="size-3.5" />Check-in</div><div className="num mt-1 font-display text-[22px] font-medium">{t12(row?.check_in ?? null)}</div>{row?.is_late && <Badge tone="warn">Late</Badge>}</div>
        <div className="rounded-xl bg-canvas p-4"><div className="flex items-center gap-1.5 text-[12px] text-ink-3"><LogOut className="size-3.5" />Check-out</div><div className="num mt-1 font-display text-[22px] font-medium">{t12(row?.check_out ?? null)}</div>{row?.status === "half_day" && <Badge tone="warn">Half day</Badge>}</div>
        <p className="col-span-2 text-[12px] text-ink-3">Check-in after the grace time counts as late. Leaving before the minimum hours counts as a half day.</p>
      </section>
    </div>
  );
}

function MyAttendance({ me }: { me: Employee }) {
  const { settings } = useSettings();
  const [month, setMonth] = useState(firstOfMonth());
  const [rows, setRows] = useState<Attendance[] | null>(null);
  const [hols, setHols] = useState<Holiday[]>([]);
  const end = ymd(new Date(parseYmd(month).getFullYear(), parseYmd(month).getMonth(), daysInMonth(month)));

  useEffect(() => {
    setRows(null);
    supabase.from("attendance").select("*").eq("employee_id", me.id).gte("date", month).lte("date", end).then(({ data }) => setRows(data ?? []));
    supabase.from("holidays").select("*").gte("date", month).lte("date", end).then(({ data }) => setHols(data ?? []));
  }, [me.id, month, end]);

  const days = useMemo(() => {
    if (!settings || !rows) return [];
    const map = new Map(rows.map((r) => [r.date, r]));
    const hset = new Set(hols.map((h) => h.date));
    const t = today();
    return Array.from({ length: daysInMonth(month) }, (_, i) => ymd(new Date(parseYmd(month).getFullYear(), parseYmd(month).getMonth(), i + 1)))
      .filter((d) => d <= t && (!me.date_of_joining || d >= me.date_of_joining))
      .map((d) => ({ d, row: map.get(d), kind: dayKind(d, settings, hset), holiday: hols.find((h) => h.date === d)?.name }));
  }, [settings, rows, hols, month, me.date_of_joining]);

  const c = (s: string[]) => days.filter((x) => x.row && s.includes(x.row.status)).length;
  const late = days.filter((x) => x.row?.is_late).length;
  function shift(n: number) { const d = parseYmd(month); setMonth(ymd(new Date(d.getFullYear(), d.getMonth() + n, 1))); }

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between p-3">
        <IconButton label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="size-4" /></IconButton>
        <div className="font-medium">{monthLabel(month)}</div>
        <IconButton label="Next month" disabled={month >= firstOfMonth()} onClick={() => shift(1)}><ChevronRight className="size-4" /></IconButton>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[["Present", c(["present"]), "text-ok"], ["Half day", c(["half_day"]), "text-warn"], ["Leave", c(["paid_leave", "unpaid_leave"]), "text-iris"],
          ["Absent", c(["absent"]), "text-bad"], ["Late", late, "text-warn"]].map(([k, v, cl]) => (
          <div key={k as string} className="card p-4"><div className="text-[12px] text-ink-3">{k}</div><div className={cx("num mt-1 font-display text-[24px] font-medium", cl as string)}>{v}</div></div>
        ))}
      </div>
      <section className="card overflow-hidden">
        {rows === null || !settings ? <Skeleton className="m-4 h-40" /> : days.length === 0 ? <Empty icon={<CalendarCheck className="size-6" />} title="Nothing yet" body="No working days in this month so far." /> : (
          <ul className="divide-y divide-line">
            {[...days].reverse().map(({ d, row, kind, holiday }) => {
              const label = row ? STATUS[row.status] : kind === "working" ? null : STATUS[kind];
              return (
                <li key={d} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-12 text-center"><div className="num font-display text-[18px] font-medium leading-none">{parseYmd(d).getDate()}</div><div className="text-[11px] text-ink-3">{parseYmd(d).toLocaleDateString("en-IN", { weekday: "short" })}</div></div>
                  <div className="num flex-1 text-[13px] text-ink-2">{row?.check_in ? `${t12(row.check_in)} → ${t12(row.check_out)}` : holiday ?? ""}</div>
                  {row?.is_late && <Badge tone="warn">Late</Badge>}
                  {label ? <Badge dot tone={label.tone}>{label.label}</Badge> : <Badge>Not marked</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function MyPayslips() {
  const { firm } = useAuth();
  const { settings } = useSettings();
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [open, setOpen] = useState<Slip | null>(null);
  useEffect(() => {
    supabase.from("payslips").select("*").order("month", { ascending: false }).then(({ data }) => setSlips(data ?? []));
  }, []);

  if (slips === null) return <Skeleton className="h-48" />;
  if (!slips.length) return <div className="card"><Empty icon={<FileText className="size-6" />} title="No payslips yet" body="Your payslip appears here once HR finalizes the month's payroll." /></div>;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slips.map((s) => (
          <section key={s.id} className="card flex flex-col p-5">
            <div className="text-[13px] text-ink-3">{monthLabel(s.month)}</div>
            <div className="num mt-1 font-display text-[28px] font-medium tracking-[-0.02em]">{money(Number(s.net_pay))}</div>
            <div className="num text-[12px] text-ink-3">Gross {money(Number(s.gross))} · Deductions {money(Number(s.total_deductions))} · {s.snapshot.attendance.paid_days}/{s.snapshot.attendance.basis_days} days</div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1" icon={<Eye className="size-4" />} onClick={() => setOpen(s)}>View</Button>
              <Button size="sm" className="flex-1" icon={<Printer className="size-4" />} onClick={() => window.open(`/me/slips/${s.run_id}`, "_blank")}>PDF</Button>
            </div>
          </section>
        ))}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} wide title={open ? `Payslip · ${monthLabel(open.month)}` : ""}
        footer={<><Button variant="secondary" onClick={() => setOpen(null)}>Close</Button><Button icon={<Printer className="size-4" />} onClick={() => window.open(`/me/slips/${open!.run_id}`, "_blank")}>Print / Save PDF</Button></>}>
        {open && firm && settings && <div className="overflow-x-auto"><div className="min-w-[640px]"><Payslip firm={firm} opts={settings} month={open.month} slip={open.snapshot} /></div></div>}
      </Modal>
    </>
  );
}
