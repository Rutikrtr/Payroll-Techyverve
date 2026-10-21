import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronRight as Arrow, Info } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useSettings } from "../../lib/hooks";
import type { Holiday } from "../../lib/types";
import { Badge, cx, Empty, IconButton, Skeleton } from "../../components/ui";
import { parseYmd, today } from "../../lib/format";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Today", "Tomorrow", "In 5 days" for upcoming holidays. */
function inDays(date: string) {
  const d = Math.round((parseYmd(date).getTime() - parseYmd(today()).getTime()) / 864e5);
  return d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`;
}

function DateTile({ date, muted }: { date: string; muted?: boolean }) {
  const d = parseYmd(date);
  return (
    <div className={cx("flex w-12 shrink-0 flex-col items-center rounded-lg py-1.5", muted ? "bg-canvas text-ink-4" : "bg-wine-50 text-wine-700")}>
      <span className="text-[10px] font-semibold uppercase">{d.toLocaleDateString("en-IN", { month: "short" })}</span>
      <span className="num font-display text-[20px] font-semibold leading-none">{d.getDate()}</span>
    </div>
  );
}

/** Weekly offs from the firm's rules, as a sentence ("Every Sunday is a weekly off"). */
function useWeeklyOffNote() {
  const { settings } = useSettings();
  if (!settings || settings.weekly_offs.length === 0) return null;
  const days = settings.weekly_offs.map((i) => WEEKDAYS[i]);
  return `Every ${days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days.at(-1)}` : days[0]} is a weekly off.`;
}

/** Today screen card: the next few company holidays. */
export function UpcomingHolidays() {
  const [list, setList] = useState<Holiday[] | null>(null);
  useEffect(() => {
    supabase.from("holidays").select("*").gte("date", today()).order("date").limit(3).then(({ data }) => setList(data ?? []));
  }, []);
  if (list === null) return <Skeleton className="h-32" />;
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-medium"><CalendarDays className="size-4 text-wine-700" />Upcoming holidays</h2>
        <Link to="/me?tab=holidays" replace className="inline-flex items-center text-[13px] font-medium text-wine-700">View all<Arrow className="size-4" /></Link>
      </div>
      {list.length === 0 ? <p className="text-[14px] text-ink-3">No upcoming holidays announced yet.</p> : (
        <ul className="space-y-2">
          {list.map((h) => (
            <li key={h.id} className="flex items-center gap-3">
              <DateTile date={h.date} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{h.name}</div>
                <div className="text-[12px] text-ink-3">{WEEKDAYS[parseYmd(h.date).getDay()]}</div>
              </div>
              <Badge tone={h.date === today() ? "ok" : "wine"}>{inDays(h.date)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Full holiday calendar for the year, grouped by month. */
export default function Holidays() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [list, setList] = useState<Holiday[] | null>(null);
  const weeklyOff = useWeeklyOffNote();
  const t = today();

  useEffect(() => {
    setList(null);
    supabase.from("holidays").select("*").gte("date", `${year}-01-01`).lte("date", `${year}-12-31`).order("date")
      .then(({ data }) => setList(data ?? []));
  }, [year]);

  const byMonth = useMemo(() => {
    const m = new Map<number, Holiday[]>();
    (list ?? []).forEach((h) => { const k = parseYmd(h.date).getMonth(); m.set(k, [...(m.get(k) ?? []), h]); });
    return [...m.entries()];
  }, [list]);
  const upcoming = (list ?? []).filter((h) => h.date >= t).length;

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between p-3">
        <IconButton label="Previous year" onClick={() => setYear(year - 1)}><ChevronLeft className="size-4" /></IconButton>
        <div className="text-center">
          <div className="num font-display text-[18px] font-medium">{year}</div>
          {list && <div className="text-[12px] text-ink-3">{list.length} holiday{list.length === 1 ? "" : "s"}{year === new Date().getFullYear() ? ` · ${upcoming} upcoming` : ""}</div>}
        </div>
        <IconButton label="Next year" onClick={() => setYear(year + 1)}><ChevronRight className="size-4" /></IconButton>
      </div>

      {weeklyOff && (
        <div className="flex items-start gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-[13px] text-indigo-900 ring-1 ring-indigo-100">
          <Info className="mt-0.5 size-4 shrink-0" />{weeklyOff} Holidays and weekly offs are paid.
        </div>
      )}

      {list === null ? <Skeleton className="h-64" /> : list.length === 0 ? (
        <div className="card"><Empty icon={<CalendarDays className="size-6" />} title={`No holidays for ${year} yet`} body="Your company hasn't announced holidays for this year yet. Check back later." /></div>
      ) : (
        byMonth.map(([month, items]) => (
          <section key={month} className="card overflow-hidden">
            <h2 className="eyebrow border-b border-line bg-[#fafaf9] px-4 py-2.5">{new Date(year, month, 1).toLocaleDateString("en-IN", { month: "long" })}</h2>
            <ul className="divide-y divide-line">
              {items.map((h) => {
                const past = h.date < t;
                return (
                  <li key={h.id} className={cx("flex items-center gap-3 px-4 py-3", past && "opacity-60")}>
                    <DateTile date={h.date} muted={past} />
                    <div className="min-w-0 flex-1">
                      <div className={cx("truncate font-medium", past && "text-ink-3")}>{h.name}</div>
                      <div className="text-[12px] text-ink-3">{WEEKDAYS[parseYmd(h.date).getDay()]}</div>
                    </div>
                    {past ? <Badge>Past</Badge> : <Badge tone={h.date === t ? "ok" : "wine"}>{inDays(h.date)}</Badge>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
