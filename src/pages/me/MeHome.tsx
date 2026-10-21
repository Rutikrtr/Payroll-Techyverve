import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, ChevronLeft, ChevronRight, FileText, LogIn, LogOut, Printer, ScanLine } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import PortalLayout from "../../components/PortalLayout";
import InstallApp from "../../components/InstallApp";
import { isStandalone } from "../../lib/install";
import Payslip from "../../components/Payslip";
import { Badge, Button, cx, Empty, IconButton, Skeleton, Tabs } from "../../components/ui";
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
          {tab === "today" && <><Today me={me} />{!isStandalone() && <div className="mt-4"><InstallApp /></div>}</>}
          {tab === "attendance" && <MyAttendance me={me} />}
          {tab === "payslips" && <MyPayslips me={me} />}
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

function MyPayslips({ me }: { me: Employee }) {
  const { firm } = useAuth();
  const { settings } = useSettings();
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("payslips").select("*").order("month", { ascending: false }).then(({ data }) => {
      const list = data ?? [];
      setSlips(list);
      if (list[0]) { setSelected(list[0].month); setYear(parseYmd(list[0].month).getFullYear()); }
    });
  }, []);

  const byMonth = useMemo(() => new Map((slips ?? []).map((x) => [x.month, x])), [slips]);
  if (slips === null) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;

  const thisMonth = firstOfMonth();
  const joinMonth = me.date_of_joining ? `${me.date_of_joining.slice(0, 7)}-01` : null;
  const lastYear = new Date().getFullYear();
  const firstYear = Math.min(lastYear, joinMonth ? parseYmd(joinMonth).getFullYear() : lastYear, ...slips.map((x) => parseYmd(x.month).getFullYear()));

  const months = Array.from({ length: 12 }, (_, i) => ymd(new Date(year, i, 1)));
  const yearSlips = months.map((m) => byMonth.get(m)).filter((x): x is Slip => !!x);
  const maxNet = Math.max(1, ...yearSlips.map((x) => Number(x.net_pay)));
  const yearNet = yearSlips.reduce((t, x) => t + Number(x.net_pay), 0);
  const yearGross = yearSlips.reduce((t, x) => t + Number(x.gross), 0);
  const latest = slips[0];
  const open = selected ? byMonth.get(selected) : undefined;
  const pdf = (s: Slip) => window.open(`/me/slips/${s.run_id}`, "_blank");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-wine-700 p-5 text-white shadow-card">
          <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="text-[13px] text-white/70">Latest net pay</div>
          <div className="num mt-1 font-display text-[30px] font-medium tracking-[-0.03em]">{latest ? money(Number(latest.net_pay)) : "—"}</div>
          <div className="text-[12px] text-white/60">{latest ? monthLabel(latest.month) : "No payslip released yet"}</div>
        </div>
        <div className="card p-5">
          <div className="text-[13px] text-ink-3">Earned in {year}</div>
          <div className="num mt-1 font-display text-[26px] font-medium tracking-[-0.02em]">{money(yearNet)}</div>
          <div className="text-[12px] text-ink-3">Gross {money(yearGross)}</div>
        </div>
        <div className="card p-5">
          <div className="text-[13px] text-ink-3">Payslips in {year}</div>
          <div className="num mt-1 font-display text-[26px] font-medium tracking-[-0.02em]">{yearSlips.length}<span className="text-[16px] text-ink-4"> / 12</span></div>
          <div className="text-[12px] text-ink-3">Released when HR finalizes payroll</div>
        </div>
      </div>

      <section className="card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-medium">Month-wise payslips</h2>
          <div className="flex items-center rounded-lg ring-1 ring-line">
            <IconButton label="Previous year" disabled={year <= firstYear} onClick={() => setYear(year - 1)}><ChevronLeft className="size-4" /></IconButton>
            <span className="num w-14 text-center font-medium">{year}</span>
            <IconButton label="Next year" disabled={year >= lastYear} onClick={() => setYear(year + 1)}><ChevronRight className="size-4" /></IconButton>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {months.map((m) => {
            const s = byMonth.get(m);
            const name = parseYmd(m).toLocaleDateString("en-IN", { month: "short" });
            if (s) {
              const active = selected === m;
              return (
                <button key={m} onClick={() => setSelected(m)} aria-pressed={active} aria-label={`${monthLabel(m)} payslip, net ${money(Number(s.net_pay))}`}
                  className={cx("flex flex-col rounded-xl p-3 text-left transition-all cursor-pointer",
                    active ? "bg-wine-700 text-white shadow-card" : "bg-white ring-1 ring-line hover:-translate-y-0.5 hover:ring-wine-300")}>
                  <span className="flex items-center justify-between">
                    <span className={cx("text-[13px] font-medium", active ? "text-white" : "text-ink")}>{name}</span>
                    <FileText className={cx("size-3.5", active ? "text-white/70" : "text-wine-600")} aria-hidden />
                  </span>
                  <span className={cx("num mt-2 font-display text-[16px] font-medium leading-tight", active ? "text-white" : "text-ink")}>{money(Number(s.net_pay))}</span>
                  <span className={cx("mt-2 h-1.5 overflow-hidden rounded-full", active ? "bg-white/20" : "bg-wine-50")}>
                    <span className={cx("block h-full rounded-full", active ? "bg-white" : "bg-wine-500")} style={{ width: `${(Number(s.net_pay) / maxNet) * 100}%` }} />
                  </span>
                </button>
              );
            }
            const muted = m > thisMonth || (!!joinMonth && m < joinMonth);
            const note = joinMonth && m < joinMonth ? "Before joining" : m > thisMonth ? "Upcoming" : m === thisMonth ? "In progress" : "Not released";
            return (
              <div key={m} className={cx("flex flex-col rounded-xl p-3", muted ? "bg-canvas/70" : "border border-dashed border-line")}>
                <span className={cx("text-[13px] font-medium", muted ? "text-ink-4" : "text-ink-3")}>{name}</span>
                <span className="mt-2 text-[12px] text-ink-4">{note}</span>
              </div>
            );
          })}
        </div>
      </section>

      {open ? (
        <section className="card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="text-[18px] font-medium">{monthLabel(open.month)}</h2>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Badge tone="ok">Net {money(Number(open.net_pay))}</Badge>
                <Badge>Gross {money(Number(open.gross))}</Badge>
                <Badge tone="bad">Deductions {money(Number(open.total_deductions))}</Badge>
                <Badge tone="iris">{open.snapshot.attendance.paid_days}/{open.snapshot.attendance.basis_days} paid days</Badge>
              </div>
            </div>
            <Button icon={<Printer className="size-4" />} onClick={() => pdf(open)}>Download PDF</Button>
          </div>
          <div className="overflow-x-auto bg-canvas p-3 sm:p-6">
            <div className="mx-auto min-w-[640px] max-w-[800px]">{firm && settings && <Payslip firm={firm} opts={settings} month={open.month} slip={open.snapshot} />}</div>
          </div>
        </section>
      ) : (
        <div className="card">
          <Empty icon={<FileText className="size-6" />} title={slips.length ? "Pick a month" : "No payslips yet"}
            body={slips.length ? "Tap a released month above to see its payslip." : "Your payslip appears here as soon as HR finalizes the payroll for a month."} />
        </div>
      )}
    </div>
  );
}
