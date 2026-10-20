import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import type { CustomComponent, FirmSettings, Holiday, SlipTemplate } from "../../lib/types";
import { Button, cx, Empty, Field, IconButton, PageHeader, Skeleton, Switch, Tabs, useToast } from "../../components/ui";
import { useSettings } from "../../lib/hooks";
import Payslip, { SAMPLE_SLIP } from "../../components/Payslip";
import { dateLabel, firstOfMonth } from "../../lib/format";

type Tab = "attendance" | "deductions" | "components" | "payslip" | "holidays";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACCENTS = ["#7b1e3a", "#081026", "#4b5bfc", "#12805c", "#b45309", "#5e1630"];

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-[16px] font-medium">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "attendance";
  const { settings, setSettings } = useSettings();
  const [saved, setSaved] = useState<FirmSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => { if (settings && !saved) setSaved(settings); }, [settings, saved]);
  const dirty = settings && saved && JSON.stringify(settings) !== JSON.stringify(saved);

  const s = settings!;
  const up = (patch: Partial<FirmSettings>) => setSettings({ ...s, ...patch });
  const num = (k: keyof FirmSettings) => ({
    value: String(s[k] ?? ""), type: "number", className: "input num",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => up({ [k]: e.target.value === "" ? 0 : Number(e.target.value) } as Partial<FirmSettings>),
  });

  async function save() {
    setBusy(true);
    const { firm_id, ...rest } = s;
    const { error } = await supabase.from("firm_settings").update({ ...rest, updated_at: new Date().toISOString() }).eq("firm_id", firm_id);
    setBusy(false);
    if (error) return toast("error", error.message);
    setSaved(s); toast("ok", "Settings saved. New rules apply to the next payroll you generate.");
  }

  if (!settings) return <Skeleton className="h-96" />;

  return (
    <>
      <PageHeader title="Settings" subtitle="Attendance rules, deductions and payslip format for your firm."
        actions={tab !== "holidays" && <Button icon={<Save className="size-4" />} loading={busy} disabled={!dirty} onClick={save}>{dirty ? "Save changes" : "Saved"}</Button>} />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} items={[
        { value: "attendance", label: "Attendance rules" }, { value: "deductions", label: "Salary & deductions" },
        { value: "components", label: "Custom components" }, { value: "payslip", label: "Payslip format" }, { value: "holidays", label: "Holidays" },
      ]} />

      <div className="mt-5 space-y-4">
        {tab === "attendance" && (<>
          <Card title="Working week" description="Weekly offs are paid and never counted as absence.">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Weekly off days">
              {DAYS.map((d, i) => {
                const on = s.weekly_offs.includes(i);
                return <button key={d} type="button" aria-pressed={on} onClick={() => up({ weekly_offs: on ? s.weekly_offs.filter((x) => x !== i) : [...s.weekly_offs, i].sort() })}
                  className={cx("h-10 w-14 rounded-lg text-[13px] font-medium ring-1 transition-colors cursor-pointer", on ? "bg-wine-700 text-white ring-wine-700" : "bg-white text-ink-2 ring-line hover:ring-ink-4")}>{d}</button>;
              })}
            </div>
            <p className="mt-2 text-[12px] text-ink-3">Selected days are weekly offs.</p>
          </Card>
          <Card title="Shift & lateness">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Shift start"><input type="time" className="input" value={s.shift_start.slice(0, 5)} onChange={(e) => up({ shift_start: e.target.value })} /></Field>
              <Field label="Shift end"><input type="time" className="input" value={s.shift_end.slice(0, 5)} onChange={(e) => up({ shift_end: e.target.value })} /></Field>
              <Field label="Late grace (minutes)" hint="Check-in after start + grace is late"><input min={0} {...num("late_grace_minutes")} /></Field>
              <Field label="Late marks per half-day cut" hint="0 disables the late penalty"><input min={0} {...num("lates_per_half_day")} /></Field>
            </div>
          </Card>
          <Card title="Leave & unmarked days">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paid leaves allowed per month" hint="Paid leave beyond this becomes loss of pay"><input min={0} step={0.5} {...num("paid_leaves_per_month")} /></Field>
              <Field label="Treat unmarked working days as">
                <select className="input" value={s.unmarked_as} onChange={(e) => up({ unmarked_as: e.target.value as FirmSettings["unmarked_as"] })}>
                  <option value="absent">Absent (loss of pay)</option><option value="present">Present (paid)</option>
                </select>
              </Field>
            </div>
          </Card>
        </>)}

        {tab === "deductions" && (<>
          <Card title="Salary calculation" description="How loss-of-pay (LOP) is calculated from attendance.">
            <div className="grid gap-3 sm:grid-cols-3">
              {([["working", "Working days", "Salary ÷ working days in month (excludes weekly offs & holidays)"],
                ["calendar", "Calendar days", "Salary ÷ total days in month"], ["fixed30", "Fixed 30 days", "Salary ÷ 30 for every month"]] as const).map(([v, t, d]) => (
                <button key={v} type="button" onClick={() => up({ lop_basis: v })} aria-pressed={s.lop_basis === v}
                  className={cx("rounded-xl p-4 text-left ring-1 transition-all cursor-pointer", s.lop_basis === v ? "bg-wine-50 ring-2 ring-wine-600" : "bg-white ring-line hover:ring-ink-4")}>
                  <div className="font-medium">{t}</div><div className="mt-1 text-[12px] text-ink-3">{d}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 divide-y divide-line border-t border-line">
              <Switch label="Pay overtime" description="Hourly rate × multiplier for overtime hours marked in attendance" checked={s.ot_enabled} onChange={(v) => up({ ot_enabled: v })} />
            </div>
            {s.ot_enabled && <div className="grid gap-4 sm:grid-cols-2"><Field label="OT multiplier"><input step={0.1} min={1} {...num("ot_multiplier")} /></Field><Field label="Standard hours per day"><input step={0.5} min={1} {...num("standard_hours")} /></Field></div>}
          </Card>
          <Card title="Statutory deductions">
            <div className="divide-y divide-line">
              <div className="pb-4">
                <Switch label="Provident Fund (EPF)" description="Employee share on basic, capped at the wage ceiling" checked={s.pf_enabled} onChange={(v) => up({ pf_enabled: v })} />
                {s.pf_enabled && <div className="grid gap-4 sm:grid-cols-2"><Field label="PF rate (%)"><input step={0.01} {...num("pf_rate")} /></Field><Field label="PF wage ceiling (₹)"><input {...num("pf_wage_cap")} /></Field></div>}
              </div>
              <div className="py-4">
                <Switch label="ESI" description="Employee share on gross, when monthly gross is at or below the threshold" checked={s.esi_enabled} onChange={(v) => up({ esi_enabled: v })} />
                {s.esi_enabled && <div className="grid gap-4 sm:grid-cols-2"><Field label="ESI rate (%)"><input step={0.01} {...num("esi_rate")} /></Field><Field label="Gross threshold (₹)"><input {...num("esi_threshold")} /></Field></div>}
              </div>
              <div className="py-4">
                <Switch label="Professional Tax" description="Flat monthly amount when gross exceeds the threshold" checked={s.pt_enabled} onChange={(v) => up({ pt_enabled: v })} />
                {s.pt_enabled && <div className="grid gap-4 sm:grid-cols-2"><Field label="PT amount (₹)"><input {...num("pt_amount")} /></Field><Field label="Applies above gross (₹)"><input {...num("pt_threshold")} /></Field></div>}
              </div>
              <div className="pt-4">
                <Switch label="Income tax (TDS)" description="Flat percentage of gross withheld each month" checked={s.tds_enabled} onChange={(v) => up({ tds_enabled: v })} />
                {s.tds_enabled && <div className="grid gap-4 sm:grid-cols-2"><Field label="TDS rate (%)"><input step={0.1} {...num("tds_rate")} /></Field></div>}
              </div>
            </div>
          </Card>
        </>)}

        {tab === "components" && <Components items={s.custom_components} onChange={(c) => up({ custom_components: c })} />}

        {tab === "payslip" && <PayslipSettings s={s} up={up} />}

        {tab === "holidays" && <Holidays />}
      </div>
    </>
  );
}

function Components({ items, onChange }: { items: CustomComponent[]; onChange: (c: CustomComponent[]) => void }) {
  const edit = (i: number, patch: Partial<CustomComponent>) => onChange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <Card title="Custom earnings & deductions" description="Applied to every employee each month, e.g. meal coupons, loan EMI, performance bonus, canteen deduction.">
      {items.length === 0 ? <p className="rounded-lg bg-canvas px-4 py-6 text-center text-ink-3">No custom components yet.</p> : (
        <div className="space-y-3">
          {items.map((c, i) => (
            <div key={c.id} className="grid items-end gap-3 rounded-xl border border-line p-3 sm:grid-cols-[2fr_1fr_1.4fr_1fr_auto]">
              <Field label="Name"><input className="input" value={c.name} onChange={(e) => edit(i, { name: e.target.value })} /></Field>
              <Field label="Type"><select className="input" value={c.kind} onChange={(e) => edit(i, { kind: e.target.value as CustomComponent["kind"] })}><option value="earning">Earning</option><option value="deduction">Deduction</option></select></Field>
              <Field label="Calculated as"><select className="input" value={c.calc} onChange={(e) => edit(i, { calc: e.target.value as CustomComponent["calc"] })}><option value="fixed">Fixed amount (₹)</option><option value="pct_basic">% of earned basic</option><option value="pct_gross">% of gross</option></select></Field>
              <Field label={c.calc === "fixed" ? "Amount" : "Percent"}><input className="input num" type="number" min={0} step="any" value={c.value} onChange={(e) => edit(i, { value: Number(e.target.value) })} /></Field>
              <IconButton label={`Remove ${c.name}`} className="mb-0.5 hover:text-bad" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="size-4" /></IconButton>
            </div>
          ))}
        </div>
      )}
      <Button variant="secondary" className="mt-4" icon={<Plus className="size-4" />}
        onClick={() => onChange([...items, { id: crypto.randomUUID(), name: "New component", kind: "deduction", calc: "fixed", value: 0 }])}>Add component</Button>
    </Card>
  );
}

function PayslipSettings({ s, up }: { s: FirmSettings; up: (p: Partial<FirmSettings>) => void }) {
  const { firm } = useAuth();
  const templates: { v: SlipTemplate; t: string; d: string }[] = [
    { v: "classic", t: "Classic", d: "Formal bordered table" }, { v: "modern", t: "Modern", d: "Gradient header, cards" }, { v: "compact", t: "Compact", d: "Minimal, half page" },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <Card title="Template">
          <div className="grid gap-2">
            {templates.map((t) => (
              <button key={t.v} type="button" aria-pressed={s.slip_template === t.v} onClick={() => up({ slip_template: t.v })}
                className={cx("flex items-center justify-between rounded-xl p-3.5 text-left ring-1 cursor-pointer transition-all", s.slip_template === t.v ? "bg-wine-50 ring-2 ring-wine-600" : "ring-line hover:ring-ink-4")}>
                <div><div className="font-medium">{t.t}</div><div className="text-[12px] text-ink-3">{t.d}</div></div>
                <span className={cx("size-4 rounded-full ring-2", s.slip_template === t.v ? "bg-wine-700 ring-wine-200" : "ring-line")} />
              </button>
            ))}
          </div>
        </Card>
        <Card title="Brand colour">
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((c) => <button key={c} type="button" aria-label={`Accent ${c}`} aria-pressed={s.slip_accent === c} onClick={() => up({ slip_accent: c })}
              className={cx("size-9 rounded-full cursor-pointer ring-offset-2 transition", s.slip_accent === c && "ring-2 ring-ink")} style={{ background: c }} />)}
            <label className="ml-1 inline-flex items-center gap-2 text-[13px] text-ink-3">Custom<input type="color" aria-label="Custom accent colour" value={s.slip_accent} onChange={(e) => up({ slip_accent: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-line" /></label>
          </div>
        </Card>
        <Card title="Show on payslip">
          <div className="divide-y divide-line -mt-3">
            <Switch label="Company logo" checked={s.slip_show_logo} onChange={(v) => up({ slip_show_logo: v })} />
            <Switch label="Bank details" checked={s.slip_show_bank} onChange={(v) => up({ slip_show_bank: v })} />
            <Switch label="Attendance summary" checked={s.slip_show_attendance} onChange={(v) => up({ slip_show_attendance: v })} />
            <Switch label="Net pay in words" checked={s.slip_amount_in_words} onChange={(v) => up({ slip_amount_in_words: v })} />
          </div>
          <Field label="Footer note" className="mt-3"><textarea className="input min-h-[72px] py-2" value={s.slip_footer} onChange={(e) => up({ slip_footer: e.target.value })} /></Field>
        </Card>
      </div>
      <div className="card p-5 xl:sticky xl:top-6 self-start">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-[16px] font-medium">Live preview</h2><span className="text-[12px] text-ink-3">Sample data</span></div>
        <div className="overflow-x-auto rounded-xl bg-canvas p-4 sm:p-6"><div className="min-w-[640px]">{firm && <Payslip firm={firm} opts={s} month={firstOfMonth()} slip={SAMPLE_SLIP} />}</div></div>
      </div>
    </div>
  );
}

function Holidays() {
  const { firm } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<Holiday[] | null>(null);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const year = new Date().getFullYear();

  const load = () => supabase.from("holidays").select("*").gte("date", `${year}-01-01`).order("date").then(({ data }) => setList(data ?? []));
  useEffect(() => { load(); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("holidays").insert({ firm_id: firm!.id, date, name });
    if (error) return toast("error", error.code === "23505" ? "A holiday already exists on that date." : error.message);
    setDate(""); setName(""); load(); toast("ok", "Holiday added");
  }
  async function remove(id: string) {
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) return toast("error", error.message);
    load();
  }

  return (
    <Card title={`Holiday calendar (${year} onward)`} description="Holidays are paid days and are excluded from working-day LOP calculations.">
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <Field label="Date"><input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Holiday name"><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali" /></Field>
        <Button type="submit" icon={<Plus className="size-4" />}>Add</Button>
      </form>
      <div className="mt-5">
        {list === null ? <Skeleton className="h-24" /> : list.length === 0 ? <Empty icon={<CalendarDays className="size-6" />} title="No holidays yet" body="Add your firm's public holidays for the year." /> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-2.5">
                <div><span className="font-medium">{h.name}</span><span className="ml-3 text-ink-3">{dateLabel(h.date)}</span></div>
                <IconButton label={`Delete ${h.name}`} className="hover:text-bad" onClick={() => remove(h.id)}><Trash2 className="size-4" /></IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
