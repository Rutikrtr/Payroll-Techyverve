import { useEffect, useMemo, useState } from "react";
import { Lightbulb, LightbulbOff, Radio, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { cx, PageHeader, Skeleton } from "../../components/ui";
import { initials, today } from "../../lib/format";

/**
 * Live office: an isometric floor per branch. A desk lamp turns on when the employee checks in today and off when
 * they check out. Data = three reads on open, then one realtime connection for attendance changes (no polling).
 */

type Emp = { id: string; full_name: string; emp_code: string; designation: string | null; branch_id: string | null };
type Att = { employee_id: string; status: string; check_in: string | null; check_out: string | null };
type State = "in" | "out" | "leave" | "absent" | "notin";
type Branch = { id: string; name: string };

const stateOf = (a: Att | undefined): State => {
  if (!a) return "notin";
  if (a.check_in && !a.check_out) return "in";
  if (a.check_out) return "out";
  if (a.status === "present" || a.status === "half_day") return "in";
  if (a.status === "absent") return "absent";
  return "leave"; // paid / unpaid leave, holiday, week off
};
const LABEL: Record<State, string> = { in: "In office", out: "Left for the day", leave: "On leave / off", absent: "Absent", notin: "Not in yet" };
const DOT: Record<State, string> = { in: "bg-emerald-500", out: "bg-sky-500", leave: "bg-violet-400", absent: "bg-rose-500", notin: "bg-ink-4" };
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export default function LiveOffice() {
  const { firm } = useAuth();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [emps, setEmps] = useState<Emp[] | null>(null);
  const [att, setAtt] = useState<Map<string, Att>>(new Map());
  const [day, setDay] = useState(today());
  const [branchId, setBranchId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | State>("all");
  const [focus, setFocus] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(new Date());

  // Clock (no network) and day rollover check.
  useEffect(() => {
    const t = setInterval(() => { setNow(new Date()); setDay((d) => (d === today() ? d : today())); }, 30_000);
    return () => clearInterval(t);
  }, []);

  // One-time load per day: branches, active employees, today's attendance.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: b }, { data: e }, { data: a }] = await Promise.all([
        supabase.from("branches").select("id, name").order("created_at"),
        supabase.from("employees").select("id, full_name, emp_code, designation, branch_id").eq("status", "active").order("emp_code"),
        supabase.from("attendance").select("employee_id, status, check_in, check_out").eq("date", day),
      ]);
      if (cancelled) return;
      setBranches(b ?? []); setEmps(e ?? []);
      setAtt(new Map((a ?? []).map((r) => [r.employee_id, r as Att])));
      setBranchId((cur) => cur ?? b?.[0]?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [day]);

  // Live updates: a single websocket channel, filtered to this firm; RLS applies on the server.
  useEffect(() => {
    if (!firm) return;
    // Unique name per mount: re-using a name returns the old, already-subscribed channel.
    const ch = supabase.channel(`live-office-${firm.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter: `firm_id=eq.${firm.id}` }, (p) => {
        if (p.eventType === "DELETE") {
          // A delete only carries the row id, so re-read today's list (rare: HR clearing a mark).
          supabase.from("attendance").select("employee_id, status, check_in, check_out").eq("date", today())
            .then(({ data }) => setAtt(new Map((data ?? []).map((r) => [r.employee_id, r as Att]))));
          return;
        }
        const row = p.new as Att & { date?: string };
        if (row.date !== today()) return;
        setAtt((m) => new Map(m).set(row.employee_id, row));
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
  }, [firm]);

  const multi = !!firm?.multi_branch && (branches?.length ?? 0) > 1;
  const staffOf = (bid: string | null) => (emps ?? []).filter((e) => !multi || e.branch_id === bid);
  const staff = staffOf(branchId);
  const counts = (list: Emp[]) => list.reduce((c, e) => { c[stateOf(att.get(e.id))]++; return c; }, { in: 0, out: 0, leave: 0, absent: 0, notin: 0 } as Record<State, number>);
  const c = counts(staff);
  const lightsOn = c.in > 0;
  const branchName = branches?.find((b) => b.id === branchId)?.name ?? "Office";

  const list = staff.filter((e) => (filter === "all" || stateOf(att.get(e.id)) === filter)
    && [e.full_name, e.emp_code, e.designation ?? ""].some((v) => v.toLowerCase().includes(q.toLowerCase())));

  if (!emps || !branches) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-[520px]" /></div>;

  return (
    <>
      <PageHeader title="Live office" subtitle="See who is in the office right now. A desk light turns on when someone checks in and off when they leave."
        actions={<span className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium ring-1", live ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-canvas text-ink-3 ring-line")}>
          <Radio className={cx("size-3.5", live && "animate-pulse")} />{live ? "Live" : "Connecting…"} · {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </span>} />

      <div className={cx("grid gap-4", multi ? "xl:grid-cols-[220px_minmax(0,1fr)_320px]" : "xl:grid-cols-[minmax(0,1fr)_320px]")}>
        {multi && (
          <aside className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible" aria-label="Branches">
            {branches.map((b) => {
              const bc = counts(staffOf(b.id)); const total = staffOf(b.id).length; const on = bc.in > 0;
              return (
                <button key={b.id} type="button" onClick={() => { setBranchId(b.id); setFocus(null); }} aria-pressed={branchId === b.id}
                  className={cx("card min-w-[180px] cursor-pointer p-3.5 text-left transition-all", branchId === b.id ? "ring-2 ring-wine-600" : "hover:ring-1 hover:ring-ink-4")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{b.name}</span>
                    {on ? <Lightbulb className="size-4 shrink-0 text-amber-500" aria-label="Lights on" /> : <LightbulbOff className="size-4 shrink-0 text-ink-4" aria-label="Lights off" />}
                  </div>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="num font-display text-[22px] font-medium leading-none">{bc.in}<span className="text-[13px] text-ink-3">/{total}</span></span>
                    <span className="text-[11px] text-ink-3">in office</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${total ? (bc.in / total) * 100 : 0}%` }} /></div>
                </button>
              );
            })}
          </aside>
        )}

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <div className="eyebrow">{multi ? "Branch" : "Office"}</div>
              <h2 className="truncate text-[17px] font-medium">{branchName}</h2>
            </div>
            <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium", lightsOn ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-canvas text-ink-3 ring-1 ring-line")}>
              {lightsOn ? <Lightbulb className="size-3.5" /> : <LightbulbOff className="size-3.5" />}{lightsOn ? "Lights on" : "Lights off"}
            </span>
          </div>
          <Floor staff={staff} att={att} lightsOn={lightsOn} focus={focus} onPick={setFocus} />
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-5">
            {(["in", "out", "notin", "leave", "absent"] as State[]).map((s) => (
              <button key={s} type="button" onClick={() => setFilter(filter === s ? "all" : s)} aria-pressed={filter === s}
                className={cx("flex cursor-pointer items-center gap-2 bg-white px-4 py-3 text-left transition-colors hover:bg-canvas", filter === s && "bg-wine-50")}>
                <span className={cx("size-2 rounded-full", DOT[s])} aria-hidden />
                <span className="min-w-0"><span className="num block font-display text-[18px] font-medium leading-none">{c[s]}</span><span className="text-[11px] text-ink-3">{LABEL[s]}</span></span>
              </button>
            ))}
          </div>
        </section>

        <aside className="card flex max-h-[680px] flex-col overflow-hidden">
          <div className="border-b border-line p-3">
            <div className="flex h-10 items-center gap-2 rounded-lg border border-line px-3 focus-within:border-wine-600 focus-within:ring-4 focus-within:ring-wine-100">
              <Search className="size-4 text-ink-4" aria-hidden />
              <input aria-label="Search people" className="h-full min-w-0 flex-1 bg-transparent outline-none" placeholder="Search name, code, role…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["all", "in", "out", "notin"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                  className={cx("cursor-pointer rounded-full px-2.5 py-1 text-[12px] ring-1 transition-colors", filter === f ? "bg-ink text-white ring-ink" : "text-ink-2 ring-line hover:ring-ink-4")}>
                  {f === "all" ? `All ${staff.length}` : `${LABEL[f]} ${c[f]}`}
                </button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {list.map((e) => {
              const a = att.get(e.id); const s = stateOf(a);
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => setFocus(focus === e.id ? null : e.id)}
                    className={cx("flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-canvas", focus === e.id && "bg-wine-50")}>
                    <span className="relative">
                      <span className="flex size-9 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: `hsl(${hue(e.full_name)} 45% ${s === "in" ? 45 : 70}%)` }}>{initials(e.full_name)}</span>
                      <span className={cx("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white", DOT[s])} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{e.full_name}</span>
                      <span className="block truncate text-[12px] text-ink-3">{e.designation || e.emp_code}</span>
                    </span>
                    <span className="shrink-0 text-right text-[11px] leading-tight text-ink-3">
                      <span className={cx("block font-medium", s === "in" ? "text-emerald-700" : "text-ink-2")}>{LABEL[s]}</span>
                      {a?.check_in && <span className="num">{hhmm(a.check_in)}{a.check_out ? ` – ${hhmm(a.check_out)}` : ""}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="p-6 text-center text-[13px] text-ink-3">Nobody here.</li>}
          </ul>
        </aside>
      </div>
    </>
  );
}

/* ───────────── Isometric floor ───────────── */

const TW = 76, TH = 38; // iso tile size

function Floor({ staff, att, lightsOn, focus, onPick }: { staff: Emp[]; att: Map<string, Att>; lightsOn: boolean; focus: string | null; onPick: (id: string) => void }) {
  const n = Math.max(staff.length, 1);
  const cols = Math.max(3, Math.min(8, Math.ceil(Math.sqrt(n * 1.4))));
  const rows = Math.max(2, Math.ceil(n / cols));
  const iso = (c: number, r: number) => ({ x: (c - r) * (TW / 2), y: (c + r) * (TH / 2) });
  // Floor spans desks plus a one-tile walkway margin.
  const m = 0.9;
  const corners = [iso(-m, -m), iso(cols - 1 + m, -m), iso(cols - 1 + m, rows - 1 + m), iso(-m, rows - 1 + m)];
  const minX = Math.min(...corners.map((p) => p.x)) - 20, maxX = Math.max(...corners.map((p) => p.x)) + 20;
  const minY = Math.min(...corners.map((p) => p.y)) - 90, maxY = Math.max(...corners.map((p) => p.y)) + 40;
  const wallH = 70;
  const [a, b, cc, d] = corners;
  const desks = useMemo(() => staff.map((e, i) => ({ e, ...iso(i % cols, Math.floor(i / cols)) })), [staff, cols]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cx("relative transition-colors duration-700", lightsOn ? "bg-[#fbf6ee]" : "bg-[#1b1720]")}>
      <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="block h-auto w-full max-h-[560px]" role="img" aria-label={`Office floor, ${staff.length} desks`}>
        <defs>
          <radialGradient id="lamp" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ffd77a" stopOpacity=".85" /><stop offset="100%" stopColor="#ffd77a" stopOpacity="0" /></radialGradient>
          <linearGradient id="floorOn" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f3ebdf" /><stop offset="100%" stopColor="#e7dccb" /></linearGradient>
          <linearGradient id="floorOff" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3a3440" /><stop offset="100%" stopColor="#2b2631" /></linearGradient>
        </defs>
        {/* back walls */}
        <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${b.x},${b.y - wallH} ${a.x},${a.y - wallH}`} fill={lightsOn ? "#efe6d8" : "#2a2530"} stroke={lightsOn ? "#d9ccb8" : "#3b3542"} />
        <polygon points={`${a.x},${a.y} ${d.x},${d.y} ${d.x},${d.y - wallH} ${a.x},${a.y - wallH}`} fill={lightsOn ? "#e6dccb" : "#24202a"} stroke={lightsOn ? "#d9ccb8" : "#3b3542"} />
        {/* windows on the right wall */}
        {[0.25, 0.55].map((t) => {
          const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, w = (b.x - a.x) * 0.18, h = (b.y - a.y) * 0.18;
          return <polygon key={t} points={`${x},${y - 18} ${x + w},${y + h - 18} ${x + w},${y + h - 52} ${x},${y - 52}`} fill={lightsOn ? "#cfe3f2" : "#3b4a63"} stroke={lightsOn ? "#b7cfe2" : "#4a5875"} />;
        })}
        {/* floor */}
        <polygon points={corners.map((p) => `${p.x},${p.y}`).join(" ")} fill={`url(#${lightsOn ? "floorOn" : "floorOff"})`} stroke={lightsOn ? "#d6c7b1" : "#433c4a"} />
        {/* ceiling lights strip (on when anyone is in) */}
        {Array.from({ length: cols }, (_, i) => {
          const p = iso(i, -m + 0.15);
          return <ellipse key={i} cx={p.x} cy={p.y - wallH + 8} rx={10} ry={4} fill={lightsOn ? "#ffe8a3" : "#4a4352"} opacity={lightsOn ? 1 : 0.8} />;
        })}
        {desks.map(({ e, x, y }) => <Desk key={e.id} e={e} x={x} y={y} state={stateOf(att.get(e.id))} focused={focus === e.id} dim={!lightsOn} onPick={onPick} att={att.get(e.id)} />)}
      </svg>
      {!lightsOn && <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[12px] text-white/60">Nobody is in the office right now</div>}
    </div>
  );
}

function Desk({ e, x, y, state, focused, dim, onPick, att }: { e: Emp; x: number; y: number; state: State; focused: boolean; dim: boolean; onPick: (id: string) => void; att?: Att }) {
  const on = state === "in";
  const w = 26, h = 13, t = 9; // desk top half-size and thickness
  const top = `${x},${y - h} ${x + w},${y} ${x},${y + h} ${x - w},${y}`;
  const left = `${x - w},${y} ${x},${y + h} ${x},${y + h + t} ${x - w},${y + t}`;
  const right = `${x + w},${y} ${x},${y + h} ${x},${y + h + t} ${x + w},${y + t}`;
  const skin = `hsl(${hue(e.full_name)} 45% 55%)`;
  const tip = `${e.full_name} · ${LABEL[state]}${att?.check_in ? ` · in ${hhmm(att.check_in)}` : ""}${att?.check_out ? ` · out ${hhmm(att.check_out)}` : ""}`;
  return (
    <g className="cursor-pointer" onClick={() => onPick(e.id)} role="button" aria-label={tip} tabIndex={0}
      onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onPick(e.id)}>
      <title>{tip}</title>
      {on && <ellipse cx={x} cy={y + 4} rx={44} ry={22} fill="url(#lamp)" className="transition-opacity duration-700" />}
      {focused && <ellipse cx={x} cy={y + 4} rx={36} ry={18} fill="none" stroke="#a3305a" strokeWidth={2.5} strokeDasharray="4 3" />}
      {/* chair + person behind the desk */}
      <ellipse cx={x - 2} cy={y - 10} rx={8} ry={4} fill={dim ? "#3d3644" : "#cbbfae"} />
      {on && <>
        <rect x={x - 8} y={y - 30} width={14} height={16} rx={6} fill={skin} />
        <circle cx={x - 1} cy={y - 35} r={6.5} fill="#f2cfae" stroke={skin} strokeWidth={1.5} />
      </>}
      {/* desk */}
      <polygon points={left} fill={dim ? "#2f2a35" : "#c9b79c"} />
      <polygon points={right} fill={dim ? "#28232d" : "#b9a587"} />
      <polygon points={top} fill={dim ? "#423b49" : "#ead9bf"} stroke={dim ? "#4d4554" : "#d2bf9f"} strokeWidth={0.8} />
      {/* monitor: glows when the person is in */}
      <polygon points={`${x + 3},${y - 4} ${x + 15},${y + 2} ${x + 15},${y - 10} ${x + 3},${y - 16}`} fill={on ? "#7dd3fc" : dim ? "#1f1c24" : "#5b6472"} stroke={on ? "#38bdf8" : "none"} />
      {/* desk lamp */}
      <line x1={x - 16} y1={y - 2} x2={x - 16} y2={y - 14} stroke={dim ? "#57505e" : "#8a7a64"} strokeWidth={1.5} />
      <circle cx={x - 16} cy={y - 15} r={3.5} fill={on ? "#ffd166" : dim ? "#3a3440" : "#a99a85"} />
      {/* status pin */}
      <circle cx={x + w - 6} cy={y - 2} r={3} fill={{ in: "#10b981", out: "#0ea5e9", leave: "#a78bfa", absent: "#f43f5e", notin: "#9ca3af" }[state]} />
    </g>
  );
}
