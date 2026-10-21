import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarCheck, CalendarDays, Clock, FileText, PartyPopper, UserMinus, UserX, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import type { Attendance, Employee, Holiday, PayrollRun } from "../../lib/types";
import { Badge, Button, Empty, PageHeader, Skeleton } from "../../components/ui";
import { dateLabel, initials, money, monthLabel, parseYmd, today, ymd } from "../../lib/format";
import { STATUS } from "../../lib/hooks";
import InstallApp from "../../components/InstallApp";

const PIE = ["#7b1e3a", "#4b5bfc", "#bf5d79", "#7ea1f3", "#d993a6", "#2a3550", "#a4acc4"];

function Stat({ label, value, sub, icon, tone, className = "" }: { label: string; value: number | string; sub: string; icon: ReactNode; tone: string; className?: string }) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="flex items-center gap-2 text-[13px] text-ink-3">
        <span className={`flex size-7 items-center justify-center rounded-md ${tone}`}>{icon}</span>{label}
      </div>
      <div className="num mt-3 font-display text-[30px] font-medium leading-none tracking-[-0.03em]">{value}</div>
      <div className="mt-2 text-[12px] text-ink-3">{sub}</div>
    </div>
  );
}

export default function Dashboard() {
  const { firm } = useAuth();
  const [emps, setEmps] = useState<Employee[] | null>(null);
  const [att, setAtt] = useState<Attendance[]>([]);
  const [hols, setHols] = useState<Holiday[]>([]);
  const [run, setRun] = useState<PayrollRun | null>(null);
  const t = today();

  useEffect(() => {
    const from = ymd(new Date(Date.now() - 13 * 864e5));
    Promise.all([
      supabase.from("employees").select("*").eq("status", "active"),
      supabase.from("attendance").select("*").gte("date", from).lte("date", t),
      supabase.from("holidays").select("*").gte("date", t).order("date").limit(4),
      supabase.from("payroll_runs").select("*").order("month", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([e, a, h, r]) => { setEmps(e.data ?? []); setAtt(a.data ?? []); setHols(h.data ?? []); setRun(r.data); });
  }, [t]);

  const d = useMemo(() => {
    const list = emps ?? [];
    const todays = att.filter((a) => a.date === t);
    const byEmp = new Map(todays.map((a) => [a.employee_id, a]));
    const count = (s: string[]) => todays.filter((a) => s.includes(a.status)).length;
    const present = count(["present", "half_day"]);
    const absentRows = todays.filter((a) => ["absent", "unpaid_leave"].includes(a.status));
    const leave = count(["paid_leave"]);
    const late = todays.filter((a) => a.is_late).length;
    const unmarked = list.filter((e) => !byEmp.has(e.id)).length;

    const trend = Array.from({ length: 14 }, (_, i) => {
      const day = ymd(new Date(Date.now() - (13 - i) * 864e5));
      return { day, rows: att.filter((a) => a.date === day) };
    }).filter((x) => x.rows.length).map(({ day, rows }) => {
      return {
        day: parseYmd(day).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        Present: rows.filter((a) => ["present", "half_day"].includes(a.status)).length,
        Absent: rows.filter((a) => ["absent", "unpaid_leave"].includes(a.status)).length,
        Leave: rows.filter((a) => a.status === "paid_leave").length,
      };
    });

    const deptMap = new Map<string, number>();
    list.forEach((e) => deptMap.set(e.department || "Unassigned", (deptMap.get(e.department || "Unassigned") ?? 0) + 1));
    const depts = [...deptMap].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const empById = new Map(list.map((e) => [e.id, e]));
    const absentees = absentRows.map((a) => ({ a, e: empById.get(a.employee_id) })).filter((x) => x.e);
    const lateList = todays.filter((a) => a.is_late).map((a) => ({ a, e: empById.get(a.employee_id) })).filter((x) => x.e);
    return { total: list.length, present, absent: absentRows.length, leave, late, unmarked, trend, depts, absentees, lateList };
  }, [emps, att, t]);

  const pct = d.total ? Math.round((d.present / d.total) * 100) : 0;
  const dateStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  if (emps === null) return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className={i === 0 ? "h-[124px] md:col-span-2" : "h-[124px]"} />)}</div>;

  if (emps.length === 0) return (
    <>
      <PageHeader title={`Welcome to ${firm?.name}`} subtitle={dateStr} />
      <div className="card"><Empty icon={<Users className="size-6" />} title="Add your team to get started"
        body="Once employees are added you can mark daily attendance, configure deductions and generate monthly payslips."
        action={<Link to="/app/employees"><Button>Add employees</Button></Link>} /></div>
    </>
  );

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${dateStr} · ${firm?.name}`}
        actions={<Link to="/app/attendance"><Button icon={<CalendarCheck className="size-4" />}>Mark today's attendance</Button></Link>} />

      {/* Bento row 1 */}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-5">
        <div className="col-span-2 relative overflow-hidden rounded-xl bg-[#14060c] p-6 text-white shadow-card">
          <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-wine-600/50 blur-3xl" aria-hidden />
          <div className="relative flex items-start justify-between gap-6">
            <div>
              <div className="text-[13px] text-white/60">Present today</div>
              <div className="num mt-2 font-display text-[52px] font-medium leading-none tracking-[-0.04em]">
                {d.present}<span className="text-[24px] text-white/40"> / {d.total}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                <span className="rounded-full bg-white/10 px-2.5 py-1">{pct}% attendance</span>
                {d.unmarked > 0 && <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-amber-200">{d.unmarked} not marked yet</span>}
              </div>
            </div>
            <svg viewBox="0 0 36 36" className="size-24 shrink-0 -rotate-90" role="img" aria-label={`${pct}% present`}>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#d993a6" strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * 97.4} 97.4`} />
            </svg>
          </div>
        </div>
        <Stat label="Absent" value={d.absent} sub="Including unpaid leave" icon={<UserX className="size-4" />} tone="bg-rose-50 text-bad" />
        <Stat label="On leave" value={d.leave} sub="Paid leave today" icon={<UserMinus className="size-4" />} tone="bg-indigo-50 text-iris" />
        <Stat label="Late arrivals" value={d.late} sub={`After grace period`} icon={<Clock className="size-4" />} tone="bg-amber-50 text-warn" className="col-span-2 xl:col-span-1" />
      </div>

      {/* Bento row 2 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-[16px] font-medium">Attendance trend</h2><p className="text-[13px] text-ink-3">Last 14 days · working days only</p></div>
            <div className="flex gap-3 text-[12px] text-ink-3">
              {[["Present", "#7b1e3a"], ["Absent", "#d993a6"], ["Leave", "#4b5bfc"]].map(([k, c]) => (
                <span key={k} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: c }} />{k}</span>
              ))}
            </div>
          </div>
          <div className="mt-4 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.trend} margin={{ left: -20, right: 6, top: 6 }}>
                <defs>
                  <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7b1e3a" stopOpacity={0.25} /><stop offset="100%" stopColor="#7b1e3a" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eeece9" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#6b7c99", fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#6b7c99", fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ef", fontSize: 13 }} />
                <Area type="monotone" dataKey="Present" stroke="#7b1e3a" strokeWidth={2} fill="url(#gP)" />
                <Area type="monotone" dataKey="Absent" stroke="#d993a6" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="Leave" stroke="#4b5bfc" strokeWidth={2} strokeDasharray="4 3" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-[16px] font-medium">Team by department</h2>
          <p className="text-[13px] text-ink-3">{d.total} active employees</p>
          <div className="relative mx-auto mt-2 h-[150px] w-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={d.depts} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
                {d.depts.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ef", fontSize: 13 }} /></PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><div className="num font-display text-[24px] font-medium">{d.depts.length}</div><div className="text-[11px] text-ink-3">depts</div></div>
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {d.depts.slice(0, 5).map((x, i) => (
              <li key={x.name} className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: PIE[i % PIE.length] }} />{x.name}</span><span className="num text-ink-3">{x.value}</span></li>
            ))}
          </ul>
        </section>
      </div>

      {/* Bento row 3 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card flex flex-col">
          <div className="flex items-center justify-between px-5 pt-5 pb-3"><h2 className="text-[16px] font-medium">Absent today</h2><Badge tone="bad">{d.absent}</Badge></div>
          <ul className="flex-1 divide-y divide-line">
            {d.absentees.slice(0, 6).map(({ a, e }) => (
              <li key={a.employee_id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="flex size-8 items-center justify-center rounded-full bg-rose-50 text-[12px] font-semibold text-bad">{initials(e!.full_name)}</div>
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{e!.full_name}</div><div className="truncate text-[12px] text-ink-3">{e!.designation || e!.emp_code}</div></div>
                <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
              </li>
            ))}
            {d.absentees.length === 0 && <li className="flex flex-col items-center px-5 py-8 text-center text-ink-3"><PartyPopper className="mb-2 size-5 text-ok" />No absences recorded today.</li>}
          </ul>
          {d.lateList.length > 0 && (
            <div className="border-t border-line px-5 py-3 text-[13px] text-ink-3">
              <span className="font-medium text-warn">Late:</span> {d.lateList.map((x) => x.e!.full_name.split(" ")[0]).join(", ")}
            </div>
          )}
        </section>

        <section className="card p-5 flex flex-col">
          <div className="flex items-center justify-between"><h2 className="text-[16px] font-medium">Payroll</h2>{run && <Badge tone={run.status === "finalized" ? "ok" : "warn"} dot>{run.status === "finalized" ? "Finalized" : "Draft"}</Badge>}</div>
          {run ? (
            <>
              <p className="text-[13px] text-ink-3">{monthLabel(run.month)} · {run.employee_count} employees</p>
              <div className="mt-5 text-[13px] text-ink-3">Net payout</div>
              <div className="num font-display text-[34px] font-medium tracking-[-0.03em]">{money(Number(run.total_net))}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                <div className="rounded-lg bg-canvas p-3"><div className="text-ink-3">Gross</div><div className="num mt-0.5 font-medium">{money(Number(run.total_gross))}</div></div>
                <div className="rounded-lg bg-canvas p-3"><div className="text-ink-3">Deductions</div><div className="num mt-0.5 font-medium">{money(Number(run.total_gross) - Number(run.total_net))}</div></div>
              </div>
            </>
          ) : <p className="mt-2 text-ink-3">No payroll has been run yet. Generate the month's payslips once attendance is complete.</p>}
          <Link to="/app/payroll" className="mt-auto pt-5"><Button variant="secondary" className="w-full" icon={<FileText className="size-4" />}>Open payroll <ArrowRight className="size-4" /></Button></Link>
        </section>

        <section className="card p-5">
          <h2 className="text-[16px] font-medium">Upcoming holidays</h2>
          <ul className="mt-3 space-y-2">
            {hols.map((h) => {
              const dt = parseYmd(h.date);
              return (
                <li key={h.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
                  <div className="flex w-11 flex-col items-center rounded-md bg-wine-50 py-1 text-wine-700">
                    <span className="text-[10px] font-semibold uppercase">{dt.toLocaleDateString("en-IN", { month: "short" })}</span>
                    <span className="num font-display text-[18px] font-semibold leading-none">{dt.getDate()}</span>
                  </div>
                  <div><div className="font-medium">{h.name}</div><div className="text-[12px] text-ink-3">{dt.toLocaleDateString("en-IN", { weekday: "long" })}</div></div>
                </li>
              );
            })}
            {hols.length === 0 && <li className="flex flex-col items-center py-6 text-center text-ink-3"><CalendarDays className="mb-2 size-5" />No holidays scheduled. <Link className="text-wine-700 hover:underline" to="/app/settings?tab=holidays">Add holidays</Link></li>}
          </ul>
          <p className="mt-3 text-[12px] text-ink-4">Today is {dateLabel(t)}</p>
        </section>
      </div>
      <div className="mt-4"><InstallApp share={!!firm?.multi_branch} /></div>
    </>
  );
}
