import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Clock, Mail, MapPin, Maximize2, Phone, RefreshCw, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import PortalLayout from "../../components/PortalLayout";
import QrCode, { scanUrl } from "../../components/QrCode";
import { Badge, Button, cx, IconButton, Skeleton, Tabs, type Tone } from "../../components/ui";
import { initials, parseYmd, ymd } from "../../lib/format";
import { STATUS } from "../../lib/hooks";
import type { AttStatus } from "../../lib/types";

interface Overview {
  firm: { name: string; legal_name: string | null; address: string | null; city: string | null; state: string | null; pincode: string | null; phone: string | null; email: string | null };
  branch: { id: string; name: string; address: string | null };
  date: string; today: string; token: string | null;
  rows: { emp_code: string; full_name: string; designation: string | null; status: AttStatus | null; check_in: string | null; check_out: string | null; is_late: boolean }[];
}
type Filter = "all" | "in" | "open" | "missing";

const t12 = (t: string | null) => {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

function rowState(r: Overview["rows"][number]): { label: string; tone: Tone } {
  if (r.check_out) return { label: "Checked out", tone: "neutral" };
  if (r.check_in) return { label: "Checked in", tone: "ok" };
  if (r.status) return { label: STATUS[r.status].label, tone: STATUS[r.status].tone };
  return { label: "Not checked in", tone: "warn" };
}

export default function BranchHome() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [full, setFull] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("branch_overview", { p_date: date });
    if (error) return setError(error.message);
    setError(""); setData(data as Overview);
  }, [date]);

  // Live: refresh every 30s so check-ins appear and the QR rolls over at midnight.
  useEffect(() => { load(); const i = setInterval(load, 30_000); return () => clearInterval(i); }, [load]);

  const isToday = !!data && data.date === data.today;
  const counts = useMemo(() => {
    const r = data?.rows ?? [];
    return { all: r.length, in: r.filter((x) => x.check_in).length, open: r.filter((x) => x.check_in && !x.check_out).length, missing: r.filter((x) => !x.check_in && !x.status).length };
  }, [data]);
  const rows = (data?.rows ?? []).filter((r) =>
    filter === "all" ? true : filter === "in" ? !!r.check_in : filter === "open" ? r.check_in && !r.check_out : !r.check_in && !r.status);

  function shift(n: number) {
    if (!data) return;
    const d = parseYmd(data.date); d.setDate(d.getDate() + n);
    const next = ymd(d);
    setDate(next >= data.today ? null : next);
  }

  if (error) return <PortalLayout subtitle="Branch"><div className="card p-8 text-center text-bad">{error}</div></PortalLayout>;
  if (!data) return <PortalLayout subtitle="Branch"><div className="grid gap-4 lg:grid-cols-[380px_1fr]"><Skeleton className="h-[480px]" /><Skeleton className="h-[480px]" /></div></PortalLayout>;

  const f = data.firm;
  const dateLabel = parseYmd(data.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const qrValue = data.token ? scanUrl(data.branch.id, data.token) : "";

  return (
    <PortalLayout subtitle={`${data.branch.name} branch`}>
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <section className="relative overflow-hidden rounded-2xl bg-[#14060c] p-6 text-white shadow-card">
            <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-wine-600/50 blur-3xl" aria-hidden />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div><div className="text-[12px] uppercase tracking-[0.08em] text-white/50">Attendance QR</div><div className="font-display text-[18px] font-medium">{data.branch.name}</div></div>
                {isToday && <IconButton label="Show QR full screen" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setFull(true)}><Maximize2 className="size-4" /></IconButton>}
              </div>
              <div className="mt-5 flex justify-center">
                {isToday && data.token ? <div className="rounded-2xl bg-white p-3"><QrCode value={qrValue} size={240} label={`Attendance QR for ${data.branch.name}, ${dateLabel}`} /></div>
                  : <div className="flex h-[264px] w-[264px] flex-col items-center justify-center rounded-2xl bg-white/5 text-center text-[13px] text-white/60 ring-1 ring-white/10">QR is shown only for today.<Button size="sm" variant="secondary" className="mt-3" onClick={() => setDate(null)}>Back to today</Button></div>}
              </div>
              <p className="mt-4 text-center text-[13px] text-white/70">Scan once to <b className="text-white">check in</b>, again to <b className="text-white">check out</b>.</p>
              <p className="mt-1 text-center text-[12px] text-white/45">Changes automatically every day at midnight</p>
            </div>
          </section>

          <section className="card p-5">
            <div className="flex items-center gap-2 text-ink-3"><Building2 className="size-4" /><span className="eyebrow">Company</span></div>
            <div className="mt-2 font-display text-[17px] font-medium">{f.legal_name || f.name}</div>
            <ul className="mt-3 space-y-2 text-[13px] text-ink-2">
              {(f.address || f.city) && <li className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-ink-4" />{[f.address, f.city, f.state, f.pincode].filter(Boolean).join(", ")}</li>}
              {data.branch.address && <li className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-wine-600" />Branch: {data.branch.address}</li>}
              {f.phone && <li className="flex gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-ink-4" />{f.phone}</li>}
              {f.email && <li className="flex gap-2"><Mail className="mt-0.5 size-4 shrink-0 text-ink-4" />{f.email}</li>}
            </ul>
          </section>
        </div>

        <section className="card flex min-w-0 flex-col">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1">
              <IconButton label="Previous day" onClick={() => shift(-1)}><ChevronLeft className="size-4" /></IconButton>
              <div className="min-w-0 px-1"><div className="font-medium">{isToday ? "Today" : dateLabel}</div>{isToday && <div className="text-[12px] text-ink-3">{dateLabel}</div>}</div>
              <IconButton label="Next day" disabled={isToday} onClick={() => shift(1)}><ChevronRight className="size-4" /></IconButton>
            </div>
            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={load}>Refresh</Button>
          </div>
          <div className="px-4 pt-2">
            <Tabs value={filter} onChange={setFilter} items={[
              { value: "all", label: `All (${counts.all})` }, { value: "in", label: `Checked in (${counts.in})` },
              { value: "open", label: `Not checked out (${counts.open})` }, { value: "missing", label: `Not checked in (${counts.missing})` },
            ]} />
          </div>
          <ul className="flex-1 divide-y divide-line">
            {rows.map((r) => {
              const st = rowState(r);
              return (
                <li key={r.emp_code} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">{initials(r.full_name)}</div>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.full_name}</div><div className="truncate text-[12px] text-ink-3">{r.emp_code}{r.designation ? ` · ${r.designation}` : ""}</div></div>
                  <div className="hidden text-right text-[13px] sm:block">
                    <div className="num"><span className="text-ink-3">In </span>{t12(r.check_in)}{r.is_late && <span className="ml-1 text-warn">· late</span>}</div>
                    <div className="num"><span className="text-ink-3">Out </span>{t12(r.check_out)}</div>
                  </div>
                  <Badge dot tone={st.tone}>{st.label}</Badge>
                </li>
              );
            })}
            {rows.length === 0 && <li className="flex flex-col items-center px-4 py-12 text-center text-ink-3"><Clock className="mb-2 size-5" />Nobody in this list{isToday ? " yet" : ""}.</li>}
          </ul>
        </section>
      </div>

      {full && data.token && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#14060c] p-6 text-white" role="dialog" aria-label="Full screen QR">
          <IconButton label="Close full screen" className="absolute right-4 top-4 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setFull(false)}><X className="size-5" /></IconButton>
          <div className={cx("font-display text-[28px] font-medium")}>{data.branch.name}</div>
          <div className="mb-6 text-white/60">{dateLabel}</div>
          <div className="rounded-3xl bg-white p-4"><QrCode value={qrValue} size={Math.min(520, window.innerWidth - 80, window.innerHeight - 260)} label={`Attendance QR for ${data.branch.name}`} /></div>
          <p className="mt-6 text-[15px] text-white/70">Scan to check in · scan again to check out</p>
        </div>
      )}
    </PortalLayout>
  );
}
