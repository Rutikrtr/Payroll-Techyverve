import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CheckCheck, ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import type { Attendance as Att, AttStatus, Holiday } from "../../lib/types";
import { Badge, Button, cx, Empty, IconButton, PageHeader, Skeleton, Tabs, useToast } from "../../components/ui";
import { useEmployees, useSettings, STATUS } from "../../lib/hooks";
import { dayKind } from "../../lib/payroll";
import { daysInMonth, firstOfMonth, initials, parseYmd, today, ymd } from "../../lib/format";

const MARKABLE: AttStatus[] = ["present", "absent", "half_day", "paid_leave", "unpaid_leave"];

function shiftDate(d: string, n: number) { const x = parseYmd(d); x.setDate(x.getDate() + n); return ymd(x); }

export default function Attendance() {
  const [view, setView] = useState<"daily" | "monthly">("daily");
  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark daily presence. Lateness is detected from check-in time using your shift rules." />
      <Tabs value={view} onChange={setView} items={[{ value: "daily", label: "Daily marking" }, { value: "monthly", label: "Monthly register" }]} />
      <div className="mt-5">{view === "daily" ? <Daily /> : <Monthly />}</div>
    </>
  );
}

function Daily() {
  const { firm } = useAuth();
  const { employees } = useEmployees(true);
  const { settings } = useSettings();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Map<string, Att>>(new Map());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);

  useEffect(() => {
    supabase.from("attendance").select("*").eq("date", date).then(({ data }) => setRows(new Map((data ?? []).map((a) => [a.employee_id, a]))));
    supabase.from("holidays").select("*").eq("date", date).then(({ data }) => setHolidays(data ?? []));
  }, [date]);

  const kind = settings ? dayKind(date, settings, new Set(holidays.map((h) => h.date))) : "working";

  function isLate(checkIn: string | null) {
    if (!checkIn || !settings) return false;
    const [h, m] = settings.shift_start.split(":").map(Number);
    const [ch, cm] = checkIn.split(":").map(Number);
    return ch * 60 + cm > h * 60 + m + settings.late_grace_minutes;
  }

  async function save(employee_id: string, patch: Partial<Att>) {
    const prev = rows.get(employee_id);
    const next: Att = {
      firm_id: firm!.id, employee_id, date, status: "present", check_in: null, check_out: null, is_late: false, ot_hours: 0, note: null,
      ...(prev ?? {}), ...patch,
    };
    if ("check_in" in patch) next.is_late = isLate(next.check_in);
    if (next.check_in === "") next.check_in = null;
    if (next.check_out === "") next.check_out = null;
    const { id, ...payload } = next;
    setRows(new Map(rows).set(employee_id, next));
    setSaving(employee_id);
    const { data, error } = await supabase.from("attendance").upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: "employee_id,date" }).select().single();
    setSaving(null);
    if (error) { toast("error", error.message); setRows(new Map(rows)); return; }
    setRows((r) => new Map(r).set(employee_id, data));
  }

  async function clear(employee_id: string) {
    const { error } = await supabase.from("attendance").delete().eq("employee_id", employee_id).eq("date", date);
    if (error) return toast("error", error.message);
    const m = new Map(rows); m.delete(employee_id); setRows(m);
  }

  async function markAll(status: AttStatus) {
    const unmarked = (employees ?? []).filter((e) => !rows.has(e.id));
    if (!unmarked.length) return toast("ok", "Everyone is already marked for this day");
    setBulk(true);
    const payload = unmarked.map((e) => ({
      firm_id: firm!.id, employee_id: e.id, date, status,
      check_in: status === "present" && settings ? settings.shift_start.slice(0, 5) : null,
      check_out: status === "present" && settings ? settings.shift_end.slice(0, 5) : null,
    }));
    const { data, error } = await supabase.from("attendance").upsert(payload, { onConflict: "employee_id,date" }).select();
    setBulk(false);
    if (error) return toast("error", error.message);
    const m = new Map(rows); (data ?? []).forEach((a) => m.set(a.employee_id, a)); setRows(m);
    toast("ok", `Marked ${unmarked.length} employee${unmarked.length > 1 ? "s" : ""} as ${STATUS[status].label.toLowerCase()}`);
  }

  const list = (employees ?? []).filter((e) => [e.full_name, e.emp_code, e.department].some((v) => v?.toLowerCase().includes(q.toLowerCase())));
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((a) => { c[a.status] = (c[a.status] ?? 0) + 1; });
    return c;
  }, [rows]);
  const unmarked = (employees ?? []).filter((e) => !rows.has(e.id)).length;
  const lateCount = [...rows.values()].filter((a) => a.is_late).length;
  const dt = parseYmd(date);

  if (employees === null || !settings) return <Skeleton className="h-96" />;
  if (employees.length === 0) return <div className="card"><Empty icon={<Users className="size-6" />} title="No active employees" body="Add employees before marking attendance." action={<Link to="/app/employees"><Button>Add employees</Button></Link>} /></div>;

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <IconButton label="Previous day" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft className="size-4" /></IconButton>
          <input type="date" aria-label="Attendance date" className="input w-auto" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <IconButton label="Next day" disabled={date >= today()} onClick={() => setDate(shiftDate(date, 1))}><ChevronRight className="size-4" /></IconButton>
          <div className="ml-2 hidden sm:block">
            <div className="font-medium">{dt.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
            <div className="text-[12px] text-ink-3">Shift {settings.shift_start.slice(0, 5)}–{settings.shift_end.slice(0, 5)} · {settings.late_grace_minutes} min grace</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="ok">{counts.present ?? 0} present</Badge>
          <Badge tone="bad">{(counts.absent ?? 0) + (counts.unpaid_leave ?? 0)} absent</Badge>
          <Badge tone="warn">{counts.half_day ?? 0} half day</Badge>
          <Badge tone="iris">{counts.paid_leave ?? 0} leave</Badge>
          {lateCount > 0 && <Badge tone="warn">{lateCount} late</Badge>}
          <Badge>{unmarked} unmarked</Badge>
        </div>
      </div>

      {kind !== "working" && (
        <div className="rounded-xl bg-indigo-50 px-4 py-3 text-[14px] text-indigo-900 ring-1 ring-indigo-100">
          {kind === "holiday" ? `Holiday: ${holidays[0]?.name}.` : "Weekly off."} Unmarked employees are paid for this day automatically, so mark only those who worked.
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2 px-1">
            <Search className="size-4 text-ink-4" aria-hidden />
            <input aria-label="Search employees" className="h-8 flex-1 bg-transparent outline-none placeholder:text-ink-4" placeholder="Search employee…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" loading={bulk} icon={<CheckCheck className="size-4" />} onClick={() => markAll("present")}>Mark unmarked present</Button>
            <Button size="sm" variant="secondary" onClick={() => markAll("absent")}>Mark unmarked absent</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead><tr>
              <th className="th">Employee</th><th className="th">Status</th><th className="th">Check-in</th><th className="th">Check-out</th>
              {settings.ot_enabled && <th className="th">OT hrs</th>}<th className="th">Note</th><th className="th w-16" />
            </tr></thead>
            <tbody>
              {list.map((e) => {
                const a = rows.get(e.id);
                return (
                  <tr key={`${e.id}-${date}`} className={cx(!a && "bg-amber-50/30")}>
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">{initials(e.full_name)}</div>
                        <div><div className="font-medium">{e.full_name}</div><div className="text-[12px] text-ink-3">{e.emp_code} · {e.department || "—"}</div></div>
                      </div>
                    </td>
                    <td className="td">
                      <div role="radiogroup" aria-label={`Status for ${e.full_name}`} className="inline-flex rounded-lg bg-canvas p-0.5 ring-1 ring-line">
                        {MARKABLE.map((s) => (
                          <button key={s} role="radio" aria-checked={a?.status === s} title={STATUS[s].label}
                            onClick={() => save(e.id, { status: s, ...(s === "present" && !a?.check_in ? { check_in: settings.shift_start.slice(0, 5) } : {}) })}
                            className={cx("h-8 min-w-[38px] rounded-md px-2 text-[12px] font-semibold transition-colors cursor-pointer",
                              a?.status === s ? "text-white shadow-sm" : "text-ink-3 hover:text-ink hover:bg-white")}
                            style={a?.status === s ? { background: STATUS[s].color } : undefined}>
                            {STATUS[s].short}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <input type="time" aria-label="Check-in" className="input h-9 w-[118px]" value={a?.check_in?.slice(0, 5) ?? ""}
                          disabled={!a || !["present", "half_day"].includes(a.status)} onChange={(ev) => save(e.id, { check_in: ev.target.value })} />
                        {a?.is_late && <Badge tone="warn">Late</Badge>}
                      </div>
                    </td>
                    <td className="td"><input type="time" aria-label="Check-out" className="input h-9 w-[118px]" value={a?.check_out?.slice(0, 5) ?? ""}
                      disabled={!a || !["present", "half_day"].includes(a.status)} onChange={(ev) => save(e.id, { check_out: ev.target.value })} /></td>
                    {settings.ot_enabled && <td className="td"><input type="number" min={0} step={0.5} aria-label="Overtime hours" className="input num h-9 w-20" defaultValue={a?.ot_hours ?? 0}
                      disabled={!a} onBlur={(ev) => Number(ev.target.value) !== Number(a?.ot_hours ?? 0) && save(e.id, { ot_hours: Number(ev.target.value) })} /></td>}
                    <td className="td"><input aria-label="Note" className="input h-9 min-w-[140px]" placeholder="—" defaultValue={a?.note ?? ""} disabled={!a}
                      onBlur={(ev) => ev.target.value !== (a?.note ?? "") && save(e.id, { note: ev.target.value || null })} /></td>
                    <td className="td text-right">
                      {saving === e.id ? <span className="text-[12px] text-ink-3">Saving…</span>
                        : a ? <button className="text-[12px] text-ink-3 hover:text-bad cursor-pointer" onClick={() => clear(e.id)}>Clear</button> : <span className="text-[12px] text-warn">Unmarked</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[12px] text-ink-3">Legend: {MARKABLE.map((s) => `${STATUS[s].short} = ${STATUS[s].label}`).join(" · ")}. Changes save automatically.</p>
    </div>
  );
}

const CYCLE: (AttStatus | null)[] = ["present", "absent", "half_day", "paid_leave", "unpaid_leave", null];

function Monthly() {
  const { firm } = useAuth();
  const { employees } = useEmployees(true);
  const { settings } = useSettings();
  const toast = useToast();
  const [month, setMonth] = useState(firstOfMonth());
  const [rows, setRows] = useState<Att[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const days = daysInMonth(month);
  const end = ymd(new Date(parseYmd(month).getFullYear(), parseYmd(month).getMonth(), days));
  useEffect(() => {
    supabase.from("attendance").select("*").gte("date", month).lte("date", end).then(({ data }) => setRows(data ?? []));
    supabase.from("holidays").select("*").gte("date", month).lte("date", end).then(({ data }) => setHolidays(data ?? []));
  }, [month, end]);

  const map = useMemo(() => new Map(rows.map((a) => [`${a.employee_id}|${a.date}`, a])), [rows]);
  const hset = new Set(holidays.map((h) => h.date));
  const dates = Array.from({ length: days }, (_, i) => ymd(new Date(parseYmd(month).getFullYear(), parseYmd(month).getMonth(), i + 1)));

  async function cycle(employee_id: string, date: string) {
    if (date > today()) return;
    const cur = map.get(`${employee_id}|${date}`);
    const next = CYCLE[(CYCLE.indexOf(cur?.status ?? null) + 1) % CYCLE.length];
    if (!next) {
      const { error } = await supabase.from("attendance").delete().eq("employee_id", employee_id).eq("date", date);
      if (error) return toast("error", error.message);
      setRows(rows.filter((r) => !(r.employee_id === employee_id && r.date === date)));
      return;
    }
    const { data, error } = await supabase.from("attendance").upsert({ firm_id: firm!.id, employee_id, date, status: next, updated_at: new Date().toISOString() }, { onConflict: "employee_id,date" }).select().single();
    if (error) return toast("error", error.message);
    setRows([...rows.filter((r) => !(r.employee_id === employee_id && r.date === date)), data]);
  }

  function shiftMonth(n: number) { const d = parseYmd(month); setMonth(ymd(new Date(d.getFullYear(), d.getMonth() + n, 1))); }

  if (!employees || !settings) return <Skeleton className="h-96" />;
  if (!employees.length) return <div className="card"><Empty icon={<CalendarCheck className="size-6" />} title="No employees" body="Add employees to see the register." /></div>;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
        <div className="flex items-center gap-1">
          <IconButton label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft className="size-4" /></IconButton>
          <div className="min-w-[150px] text-center font-medium">{parseYmd(month).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</div>
          <IconButton label="Next month" onClick={() => shiftMonth(1)} disabled={month >= firstOfMonth()}><ChevronRight className="size-4" /></IconButton>
        </div>
        <p className="text-[12px] text-ink-3">Click a cell to cycle P → A → HD → PL → UL → clear</p>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[12px]">
          <thead><tr>
            <th className="th sticky left-0 z-10 min-w-[200px]">Employee</th>
            {dates.map((d) => {
              const k = dayKind(d, settings, hset);
              return <th key={d} className={cx("th !px-0 w-8 text-center", k !== "working" && "!bg-canvas")}>
                <div className="font-semibold text-ink-2">{parseYmd(d).getDate()}</div>
                <div className="text-[10px]">{parseYmd(d).toLocaleDateString("en-IN", { weekday: "narrow" })}</div>
              </th>;
            })}
            {["P", "A", "HD", "L"].map((h) => <th key={h} className="th text-center">{h}</th>)}
          </tr></thead>
          <tbody>
            {employees.map((e) => {
              let p = 0, a = 0, hd = 0, l = 0;
              return (
                <tr key={e.id}>
                  <td className="td sticky left-0 z-10 bg-white !py-2"><div className="font-medium text-[13px]">{e.full_name}</div><div className="text-ink-3">{e.emp_code}</div></td>
                  {dates.map((d) => {
                    const r = map.get(`${e.id}|${d}`);
                    const k = dayKind(d, settings, hset);
                    if (r?.status === "present") p++; else if (r?.status === "absent" || r?.status === "unpaid_leave") a++; else if (r?.status === "half_day") hd++; else if (r?.status === "paid_leave") l++;
                    const s = r ? STATUS[r.status] : null;
                    return (
                      <td key={d} className={cx("border-b border-line/70 p-0.5 text-center", k !== "working" && "bg-canvas")}>
                        <button onClick={() => cycle(e.id, d)} disabled={d > today()}
                          aria-label={`${e.full_name} ${d}: ${s?.label ?? (k === "working" ? "unmarked" : k)}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold cursor-pointer disabled:cursor-default hover:ring-2 hover:ring-wine-200"
                          style={s ? { background: s.color + "1f", color: s.color } : undefined}>
                          {s?.short ?? (k === "holiday" ? "H" : k === "week_off" ? "·" : "")}
                        </button>
                      </td>
                    );
                  })}
                  {[p, a, hd, l].map((v, i) => <td key={i} className="td num text-center font-medium">{v}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
