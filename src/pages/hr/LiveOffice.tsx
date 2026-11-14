import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

      {multi && (() => {
        const room = (b: Branch): Room => ({ id: b.id, name: b.name, staff: staffOf(b.id) });
        return (
          <section className="card mb-4 overflow-hidden p-2">
            <HoverLayer att={att}>{(onHover) => (
              <Campus firmName={firm?.name ?? ""} logo={firm?.logo_url ?? null} main={room(branches[0])} others={branches.slice(1).map(room)} att={att}
                selected={branchId} onHover={onHover}
                onSelect={(id) => { setBranchId(id); setFocus(null); document.getElementById("live-floor")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
            )}</HoverLayer>
          </section>
        );
      })()}

      <div id="live-floor" className="grid scroll-mt-6 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <div className="eyebrow">{!multi || branchId === branches[0]?.id ? "Main branch · HQ" : "Branch"}</div>
              <h2 className="truncate text-[17px] font-medium">{branchName}</h2>
            </div>
            <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium", lightsOn ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-canvas text-ink-3 ring-1 ring-line")}>
              {lightsOn ? <Lightbulb className="size-3.5" /> : <LightbulbOff className="size-3.5" />}{lightsOn ? "Lights on" : "Lights off"}
            </span>
          </div>
          <HoverLayer att={att}>{(onHover) => <Floor title={firm?.name ?? branchName} staff={staff} att={att} lightsOn={lightsOn} focus={focus} onPick={setFocus} onHover={onHover} />}</HoverLayer>
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

/* ───────────── Isometric office floor (light, modern) ───────────── */

const TW = 56, TH = 28, ZH = 30; // one floor unit across, one unit deep, one unit high (px)
const P = (x: number, y: number, z = 0) => [(x - y) * (TW / 2), (x + y) * (TH / 2) - z * ZH] as const;
const pts = (...p: (readonly [number, number])[]) => p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

/** A solid box: top, front-left and front-right faces. */
function Box({ x, y, z = 0, w, d, h, top, left, right, stroke, opacity }: {
  x: number; y: number; z?: number; w: number; d: number; h: number; top: string; left: string; right: string; stroke?: string; opacity?: number;
}) {
  return (
    <g opacity={opacity}>
      <polygon points={pts(P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h))} fill={left} stroke={stroke} strokeWidth={0.5} />
      <polygon points={pts(P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h))} fill={right} stroke={stroke} strokeWidth={0.5} />
      <polygon points={pts(P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h))} fill={top} stroke={stroke} strokeWidth={0.5} />
    </g>
  );
}

function Plant({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const [cx, cy] = P(x + 0.2 * s, y + 0.2 * s, 0.45 * s);
  return (
    <g>
      <Box x={x} y={y} w={0.4 * s} d={0.4 * s} h={0.35 * s} top="#e7e2da" left="#cfc8bd" right="#bfb7aa" />
      <circle cx={cx - 5 * s} cy={cy - 2 * s} r={8 * s} fill="#5fa36a" />
      <circle cx={cx + 5 * s} cy={cy - 5 * s} r={8 * s} fill="#4f9460" />
      <circle cx={cx} cy={cy - 12 * s} r={8 * s} fill="#6db477" />
    </g>
  );
}

type HoverFn = (e: Emp | null, ev?: React.MouseEvent) => void;

/** Full office floor (one branch) with its background and the "nobody in" note. */
function Floor(props: { title: string; staff: Emp[]; att: Map<string, Att>; lightsOn: boolean; focus: string | null; onPick: (id: string) => void; onHover?: HoverFn }) {
  return (
    <div className="relative" style={{ background: props.lightsOn ? "linear-gradient(180deg,#fbf8f3,#f3eee6)" : "linear-gradient(180deg,#f4f6f9,#e9edf2)" }}>
      <FloorScene {...props} />
      {!props.lightsOn && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full bg-white/90 px-3 py-1 text-[12px] text-ink-3 shadow-sm ring-1 ring-line">Nobody has checked in yet · desk lights are off</span>
        </div>
      )}
    </div>
  );
}

/** The isometric room as an <svg>; with `box` it renders as a nested room inside a larger SVG (campus view). */
function FloorScene({ title, staff, att, lightsOn, focus, onPick, onHover, box }: {
  title: string; staff: Emp[]; att: Map<string, Att>; lightsOn: boolean; focus: string | null; onPick: (id: string) => void;
  onHover?: HoverFn; box?: { x: number; y: number; width: number; height: number };
}) {
  const n = Math.max(staff.length, 1);
  const perRow = Math.max(3, Math.min(7, Math.ceil(Math.sqrt(n * 1.3))));
  const rows = Math.ceil(n / perRow);
  const deskPos = (i: number) => {
    const c = i % perRow, r = Math.floor(i / perRow);
    return { x: 1.1 + c * 1.6, y: 1.3 + r * 1.75 + Math.floor(r / 2) * 0.55 };
  };
  const workW = 1.1 + perRow * 1.6 + 0.3;
  const workD = deskPos((rows - 1) * perRow).y + 2.2;
  const RW = workW + 4.6, RD = Math.max(workD, 8.6), WALL = 2.6;

  const corners = [P(0, 0, WALL), P(RW, 0, WALL), P(0, RD, WALL), P(RW, RD, 0), P(0, RD, 0), P(RW, 0, 0)];
  const minX = Math.min(...corners.map((c) => c[0])) - 16, maxX = Math.max(...corners.map((c) => c[0])) + 16;
  const minY = Math.min(...corners.map((c) => c[1])) - 12, maxY = Math.max(...corners.map((c) => c[1])) + 18;

  const desks = useMemo(() => staff.map((e, i) => ({ e, ...deskPos(i) })), [staff, perRow]); // eslint-disable-line react-hooks/exhaustive-deps
  const skew = Math.atan(TH / TW) * (180 / Math.PI);
  const mx = workW + 0.4, my = 0.6; // meeting room origin
  const lx = workW + 0.6, ly = RD - 3.4; // lounge origin

  return (
      <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label={`Office floor with ${staff.length} desks`}
        {...(box ? { ...box, preserveAspectRatio: "xMidYMid meet" } : { className: "block h-auto w-full max-h-[600px]" })}>
        <defs>
          <radialGradient id="lo-lamp"><stop offset="0%" stopColor="#ffcf6b" stopOpacity=".75" /><stop offset="100%" stopColor="#ffcf6b" stopOpacity="0" /></radialGradient>
          <radialGradient id="lo-pend"><stop offset="0%" stopColor="#fff3c4" stopOpacity=".9" /><stop offset="100%" stopColor="#fff3c4" stopOpacity="0" /></radialGradient>
          <linearGradient id="lo-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#cfe6f7" /><stop offset="100%" stopColor="#eaf4fb" /></linearGradient>
        </defs>

        {/* walls */}
        <polygon points={pts(P(0, 0), P(RW, 0), P(RW, 0, WALL), P(0, 0, WALL))} fill="#f7f6f3" stroke="#e2ddd4" />
        <polygon points={pts(P(0, 0), P(0, RD), P(0, RD, WALL), P(0, 0, WALL))} fill="#eeebe5" stroke="#e2ddd4" />
        {/* windows along the back wall */}
        {Array.from({ length: Math.max(2, Math.floor(RW / 2.6)) }, (_, i) => {
          const x0 = 2.4 + i * 2.6; if (x0 + 1.8 > RW - 0.4) return null;
          return <polygon key={i} points={pts(P(x0, 0, 0.9), P(x0 + 1.8, 0, 0.9), P(x0 + 1.8, 0, 2.25), P(x0, 0, 2.25))} fill="url(#lo-sky)" stroke="#c5d7e6" />;
        })}
        {/* company sign on the back wall */}
        {(() => {
          const [sx, sy] = P(0.35, 0, 1.75);
          return (
            <g transform={`translate(${sx},${sy}) skewY(${skew})`}>
              <rect x={0} y={-16} width={Math.min(150, 26 + title.length * 6)} height={24} rx={4} fill="#7a1f3f" />
              <text x={10} y={0} fontSize={10.5} fontWeight={700} fill="#fff">{title.length > 22 ? `${title.slice(0, 21)}…` : title}</text>
            </g>
          );
        })()}
        {/* floor */}
        <polygon points={pts(P(0, 0), P(RW, 0), P(RW, RD), P(0, RD))} fill={lightsOn ? "#efe7da" : "#e8e4dc"} stroke="#d9d0c1" />
        {Array.from({ length: Math.floor(RW) }, (_, i) => <line key={`gx${i}`} x1={P(i + 1, 0)[0]} y1={P(i + 1, 0)[1]} x2={P(i + 1, RD)[0]} y2={P(i + 1, RD)[1]} stroke="#e2d8c8" strokeWidth={0.6} />)}
        {Array.from({ length: Math.floor(RD) }, (_, i) => <line key={`gy${i}`} x1={P(0, i + 1)[0]} y1={P(0, i + 1)[1]} x2={P(RW, i + 1)[0]} y2={P(RW, i + 1)[1]} stroke="#e2d8c8" strokeWidth={0.6} />)}
        {/* rug under the work area */}
        <polygon points={pts(P(0.7, 0.9), P(workW - 0.1, 0.9), P(workW - 0.1, workD - 0.4), P(0.7, workD - 0.4))} fill="#e3e8ee" opacity={0.55} />

        {/* meeting room (glass) */}
        <polygon points={pts(P(mx, my), P(mx + 3.6, my), P(mx + 3.6, my + 3.2), P(mx, my + 3.2))} fill="#e9eef3" />
        <Box x={mx + 0.9} y={my + 1} w={1.8} d={1.1} h={0.5} top="#ffffff" left="#dfe4ea" right="#d2d8df" stroke="#cfd6de" />
        {[[0.6, 0.6], [1.5, 0.45], [2.4, 0.6], [0.6, 2.2], [1.5, 2.35], [2.4, 2.2]].map(([a, b], i) => (
          <Box key={i} x={mx + a} y={my + b} w={0.4} d={0.35} h={0.32} top="#9aa5b4" left="#7f8a99" right="#727d8b" />
        ))}
        <polygon points={pts(P(mx, my + 3.2), P(mx + 3.6, my + 3.2), P(mx + 3.6, my + 3.2, 1.9), P(mx, my + 3.2, 1.9))} fill="#bcd9ee" opacity={0.28} stroke="#a9c8de" />
        <polygon points={pts(P(mx, my), P(mx, my + 3.2), P(mx, my + 3.2, 1.9), P(mx, my, 1.9))} fill="#bcd9ee" opacity={0.22} stroke="#a9c8de" />
        {(() => { const [tx, ty] = P(mx + 1.8, my + 3.2, 1.6); return <text x={tx} y={ty} textAnchor="middle" fontSize={8} fontWeight={600} fill="#55708a">Meeting room</text>; })()}

        {/* lounge */}
        <Box x={lx} y={ly} w={2.6} d={0.7} h={0.45} top="#9fb3c8" left="#869bb1" right="#7a8fa5" />
        <Box x={lx} y={ly} z={0.45} w={2.6} d={0.22} h={0.45} top="#a9bccf" left="#8ea3b8" right="#8297ac" />
        <Box x={lx + 0.8} y={ly + 1.2} w={1} d={0.6} h={0.3} top="#d9c2a0" left="#c3aa86" right="#b59c78" />
        <Plant x={RW - 0.8} y={RD - 0.9} s={1.1} />
        <Plant x={0.3} y={RD - 0.8} />
        <Plant x={workW - 0.5} y={0.35} s={0.9} />

        {/* pendant lights over the desk rows */}
        {Array.from({ length: rows }, (_, r) => Array.from({ length: Math.ceil(perRow / 2) }, (_, k) => {
          const { x, y } = deskPos(r * perRow + k * 2); const [px, py] = P(x + 1.4, y + 0.6, 2.25);
          return (
            <g key={`p${r}-${k}`}>
              {lightsOn && <ellipse cx={px} cy={py + 34} rx={34} ry={14} fill="url(#lo-pend)" />}
              <line x1={px} y1={py - 22} x2={px} y2={py} stroke="#b8b2a8" strokeWidth={0.8} />
              <path d={`M${px - 8},${py + 4} L${px - 4},${py - 2} L${px + 4},${py - 2} L${px + 8},${py + 4} Z`} fill={lightsOn ? "#ffe39a" : "#cfcac2"} stroke="#a8a196" strokeWidth={0.5} />
            </g>
          );
        }))}

        {desks.map(({ e, x, y }) => <Desk key={e.id} e={e} x={x} y={y} state={stateOf(att.get(e.id))} focused={focus === e.id} onPick={onPick} onHover={onHover} att={att.get(e.id)} />)}
      </svg>
  );
}

function Desk({ e, x, y, state, focused, onPick, onHover, att }: { e: Emp; x: number; y: number; state: State; focused: boolean; onPick: (id: string) => void; onHover?: HoverFn; att?: Att }) {
  const on = state === "in";
  const shirt = `hsl(${hue(e.full_name)} 48% ${on ? 52 : 70}%)`;
  const tip = `${e.full_name} · ${LABEL[state]}${att?.check_in ? ` · in ${hhmm(att.check_in)}` : ""}${att?.check_out ? ` · out ${hhmm(att.check_out)}` : ""}`;
  const [hx, hy] = P(x + 0.6, y + 0.32, 1.12);
  const [gx, gy] = P(x + 0.6, y + 0.85, 0.47);
  const [lx, ly] = P(x + 1.05, y + 0.75, 0.45);
  const [bx, by] = P(x + 1.2, y + 1.15, 0.9);
  const pin = { in: "#10b981", out: "#0ea5e9", leave: "#a78bfa", absent: "#f43f5e", notin: "#9ca3af" }[state];
  return (
    <g className="cursor-pointer" onClick={() => onPick(e.id)} role="button" aria-label={tip} tabIndex={0}
      onMouseEnter={(ev) => onHover?.(e, ev)} onMouseMove={(ev) => onHover?.(e, ev)} onMouseLeave={() => onHover?.(null)}
      onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onPick(e.id)}>
      {!onHover && <title>{tip}</title>}
      {focused && <polygon points={pts(P(x - 0.1, y - 0.1), P(x + 1.35, y - 0.1), P(x + 1.35, y + 1.35), P(x - 0.1, y + 1.35))} fill="#a3305a" opacity={0.14} stroke="#a3305a" strokeDasharray="4 3" />}
      {/* chair */}
      <Box x={x + 0.38} y={y + 0.12} w={0.44} d={0.4} h={0.28} top="#5b6676" left="#4a5462" right="#424b58" />
      <Box x={x + 0.38} y={y + 0.08} z={0.28} w={0.44} d={0.1} h={0.45} top="#667283" left="#535e6d" right="#4a5462" />
      {/* person */}
      {on && <>
        <Box x={x + 0.42} y={y + 0.22} z={0.28} w={0.36} d={0.26} h={0.62} top={shirt} left={shirt} right={shirt} opacity={0.95} />
        <circle cx={hx} cy={hy} r={7.2} fill="#f1c9a5" stroke="#d9a982" strokeWidth={0.8} />
        <path d={`M${hx - 7},${hy - 1} a7,7 0 0 1 14,0 q-7,-4 -14,0z`} fill="#3b2f2a" />
      </>}
      {/* desk */}
      {on && <ellipse cx={gx} cy={gy} rx={30} ry={13} fill="url(#lo-lamp)" />}
      <Box x={x} y={y + 0.55} w={1.25} d={0.62} h={0.45} top="#ffffff" left="#e3e6ea" right="#d5d9df" stroke="#d0d5db" />
      {/* monitor (screen faces the person; glow shows on the desk) */}
      <Box x={x + 0.32} y={y + 0.7} z={0.45} w={0.56} d={0.06} h={0.38} top="#2b313a" left={on ? "#3b82f6" : "#39414c"} right="#262c34" />
      {/* desk lamp */}
      <line x1={lx} y1={ly} x2={lx} y2={ly - 12} stroke="#9aa2ad" strokeWidth={1.4} />
      <circle cx={lx} cy={ly - 13} r={3.4} fill={on ? "#ffc845" : "#cfd4da"} stroke={on ? "#f5a300" : "#b9c0c8"} strokeWidth={0.6} />
      {/* status pin + initials badge */}
      <circle cx={bx} cy={by} r={3.3} fill={pin} stroke="#fff" strokeWidth={1.2} />
    </g>
  );
}

/* ───────────── Hover card (name, code, role, status, times) ───────────── */

/** Wraps an office drawing and shows a small employee card next to the pointer while a desk is hovered. */
function HoverLayer({ att, children }: { att: Map<string, Att>; children: (onHover: HoverFn) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ e: Emp; x: number; y: number } | null>(null);
  const onHover: HoverFn = (e, ev) => {
    if (!e || !ev || !ref.current) return setHover(null);
    const r = ref.current.getBoundingClientRect();
    setHover({ e, x: ev.clientX - r.left, y: ev.clientY - r.top });
  };
  const a = hover ? att.get(hover.e.id) : undefined;
  const s = stateOf(a);
  const w = ref.current?.clientWidth ?? 0;
  return (
    <div ref={ref} className="relative">
      {children(onHover)}
      {hover && (
        <div className="pointer-events-none absolute z-20 w-60 rounded-xl bg-white p-3 shadow-pop ring-1 ring-line"
          style={{ left: Math.max(8, Math.min(hover.x + 14, w - 248)), top: Math.max(8, hover.y - 104) }}>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: `hsl(${hue(hover.e.full_name)} 45% 45%)` }}>{initials(hover.e.full_name)}</span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium leading-tight">{hover.e.full_name}</span>
              <span className="font-mono text-[12px] text-ink-3">{hover.e.emp_code}</span>
            </span>
          </div>
          {hover.e.designation && <div className="mt-2 text-[12px] text-ink-2">{hover.e.designation}</div>}
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[12px]">
            <span className="flex items-center gap-1.5 font-medium"><span className={cx("size-2 rounded-full", DOT[s])} />{LABEL[s]}</span>
            <span className="num text-ink-3">{a?.check_in ? `In ${hhmm(a.check_in)}` : ""}{a?.check_out ? ` · Out ${hhmm(a.check_out)}` : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Campus: main branch room in the centre, branch rooms linked to it ───────────── */

type Room = { id: string; name: string; staff: Emp[] };

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 768);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return narrow;
}

function Campus({ firmName, logo, main, others, att, selected, onSelect, onHover }: {
  firmName: string; logo: string | null; main: Room; others: Room[]; att: Map<string, Att>; selected: string | null;
  onSelect: (id: string) => void; onHover: HoverFn;
}) {
  const narrow = useNarrow();
  const motion = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const inCount = (r: Room) => r.staff.filter((e) => stateOf(att.get(e.id)) === "in").length;

  // Frames [x, y, w, h]: main room in the centre, branch rooms down both sides (stacked on phones).
  const HEAD = 46;
  let W: number, H: number, mainF: number[], frames: number[][];
  if (narrow) {
    W = 380; const mh = 300, bh = 230;
    mainF = [10, 10, W - 20, mh];
    frames = others.map((_, i) => [34, 10 + mh + 34 + i * (bh + 26), W - 44, bh]);
    H = (frames.length ? frames[frames.length - 1][1] + bh : mainF[1] + mh) + 12;
  } else {
    const perSide = Math.max(1, Math.ceil(others.length / 2));
    const sideW = 330, gap = 22;
    const sideH = Math.min(270, Math.max(190, (720 - (perSide - 1) * gap) / perSide));
    H = Math.max(500, perSide * sideH + (perSide - 1) * gap + 40);
    W = others.length ? 1400 : 760;
    const mw = others.length ? 560 : 740, mh = Math.min(H - 40, 470);
    mainF = [(W - mw) / 2, (H - mh) / 2, mw, mh];
    frames = others.map((_, i) => {
      const side = i % 2, row = Math.floor(i / 2);
      const count = side === 0 ? Math.ceil(others.length / 2) : Math.floor(others.length / 2);
      const top = (H - (count * sideH + (count - 1) * gap)) / 2;
      return [side === 0 ? 20 : W - 20 - sideW, top + row * (sideH + gap), sideW, sideH];
    });
  }

  const roomFrame = (r: Room, f: number[], isMain = false) => {
    const [x, y, w, h] = f; const n = inCount(r); const on = n > 0; const sel = selected === r.id;
    const title = (() => { const t = `${firmName} · ${r.name}`; const max = Math.floor((w - 150) / 7); return t.length > max ? `${t.slice(0, max - 1)}…` : t; })();
    return (
      <g key={r.id}>
        {on && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={20} fill={isMain ? "#a3305a" : "#10b981"} opacity={0.14} className={motion ? "cp-glow" : undefined} />}
        <rect x={x} y={y} width={w} height={h} rx={16} fill={on ? "#fbf8f3" : "#f5f6f8"} stroke={sel ? "#a3305a" : "#e6e1da"} strokeWidth={sel ? 2.2 : 1}
          style={{ filter: "drop-shadow(0 8px 18px rgba(20,6,12,.08))" }} />
        <g className="cursor-pointer" onClick={() => onSelect(r.id)}>
          <rect x={x} y={y} width={w} height={HEAD} rx={16} fill="#ffffff" />
          <rect x={x} y={y + HEAD - 1} width={w} height={1} fill="#eee8e1" />
          {isMain && <rect x={x + 16} y={y} width={w - 32} height={4} rx={2} fill="#7a1f3f" />}
          {isMain && logo && <image href={logo} x={x + 12} y={y + 9} width={28} height={28} preserveAspectRatio="xMidYMid meet" />}
          <text x={x + (isMain && logo ? 48 : 14)} y={y + (isMain ? 19 : 28)} fontSize={isMain ? 9.5 : 13} fontWeight={700} fill={isMain ? "#a3305a" : "#1a1216"} letterSpacing={isMain ? 0.8 : 0}>
            {isMain ? "MAIN BRANCH · HQ" : (r.name.length > 26 ? `${r.name.slice(0, 25)}…` : r.name)}
          </text>
          {isMain && <text x={x + (logo ? 48 : 14)} y={y + 36} fontSize={13} fontWeight={700} fill="#1a1216">{title}</text>}
          <circle cx={x + w - 78} cy={y + HEAD / 2} r={7} fill={on ? "#ffcf4d" : "#e5e7eb"} stroke={on ? "#f5a300" : "#cbd0d6"} />
          {on && motion && <circle cx={x + w - 78} cy={y + HEAD / 2} r={7} fill="none" stroke="#ffcf4d" className="cp-ping" />}
          <text x={x + w - 14} y={y + HEAD / 2 + 4} textAnchor="end" fontSize={12} fill="#6b6470"><tspan fontWeight={700} fill={on ? "#047857" : "#1a1216"}>{n}</tspan>/{r.staff.length} in</text>
        </g>
        <FloorScene title={isMain ? firmName : r.name} staff={r.staff} att={att} lightsOn={on} focus={null} onPick={() => onSelect(r.id)} onHover={onHover}
          box={{ x: x + 6, y: y + HEAD + 4, width: w - 12, height: h - HEAD - 10 }} />
      </g>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl" style={{ background: "radial-gradient(900px 380px at 50% 50%, #fbf3f6, #f6f4f1 72%)" }}>
      <style>{`
        @keyframes cp-dash { to { stroke-dashoffset: -28; } }
        @keyframes cp-glow { 0%,100% { opacity: .08 } 50% { opacity: .24 } }
        @keyframes cp-ping { 0% { r: 7; opacity: .9 } 100% { r: 16; opacity: 0 } }
        .cp-flow { stroke-dasharray: 6 8; animation: cp-dash 1.2s linear infinite; }
        .cp-flow.idle { animation-duration: 3.5s; }
        .cp-glow { animation: cp-glow 2.4s ease-in-out infinite; }
        .cp-ping { animation: cp-ping 1.8s ease-out infinite; }
      `}</style>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="All branches">
        <defs><pattern id="cp-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#e3dcd3" /></pattern></defs>
        <rect width={W} height={H} fill="url(#cp-dots)" />
        {others.map((r, i) => {
          const [fx, fy, fw, fh] = frames[i]; const on = inCount(r) > 0; const ay = fy + fh / 2;
          let d: string;
          if (narrow) {
            d = `M22,${mainF[1] + mainF[3] - 20} L22,${ay - 12} Q22,${ay} 34,${ay}`;
          } else {
            const left = fx < mainF[0];
            const ax = left ? fx + fw : fx;
            const mx0 = left ? mainF[0] : mainF[0] + mainF[2], my0 = mainF[1] + mainF[3] / 2;
            const midX = (mx0 + ax) / 2;
            d = `M${mx0},${my0} C${midX},${my0} ${midX},${ay} ${ax},${ay}`;
          }
          const id = `cp-path-${i}`;
          return (
            <g key={r.id}>
              <path id={id} d={d} fill="none" stroke="#e4ddd4" strokeWidth={4} strokeLinecap="round" />
              <path d={d} fill="none" stroke={on ? "#10b981" : "#c7b9c0"} strokeWidth={2.2} strokeLinecap="round" className={motion ? cx("cp-flow", !on && "idle") : undefined} />
              {motion && (
                <circle r={5} fill={on ? "#10b981" : "#b9a8b0"} stroke="#fff" strokeWidth={1.5}>
                  <animateMotion dur={on ? "2.2s" : "4.5s"} repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear"><mpath href={`#${id}`} /></animateMotion>
                </circle>
              )}
            </g>
          );
        })}
        {others.map((r, i) => roomFrame(r, frames[i]))}
        {roomFrame(main, mainF, true)}
      </svg>
    </div>
  );
}
