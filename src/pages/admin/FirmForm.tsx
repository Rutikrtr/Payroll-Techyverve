import { useRef, type ChangeEvent, type ReactNode } from "react";
import { Field } from "../../components/ui";
import type { Firm } from "../../lib/types";

export type FirmDraft = Partial<Firm>;

export const emptyFirm: FirmDraft = {
  name: "", code: "", multi_branch: false, legal_name: "", industry: "", address: "", city: "", state: "", pincode: "", country: "India",
  gstin: "", pan: "", tan: "", pf_code: "", esi_code: "", contact_name: "", contact_email: "", contact_phone: "",
  hr_email: "", employee_limit: 50,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="eyebrow mb-3">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export default function FirmForm({ value, onChange, showHr }: { value: FirmDraft; onChange: (v: FirmDraft) => void; showHr?: { password: string; setPassword: (p: string) => void } }) {
  const codeTouched = useRef(false);
  const f = (k: keyof Firm) => ({
    value: (value[k] as string | number | null) ?? "",
    onChange: (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }),
  });
  const creating = !!showHr;
  return (
    <div className="space-y-7">
      <fieldset>
        <legend className="eyebrow mb-3">Workspace type</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {([[false, "Single branch", "One HR admin login manages everything. HR marks attendance."],
            [true, "Multi-branch", "Admin creates branches with QR check-in kiosks and gives employees their own logins."]] as const).map(([v, t, d]) => (
            <button key={t} type="button" aria-pressed={!!value.multi_branch === v} onClick={() => onChange({ ...value, multi_branch: v })}
              className={`rounded-xl p-4 text-left ring-1 transition-all cursor-pointer ${!!value.multi_branch === v ? "bg-wine-50 ring-2 ring-wine-600" : "bg-white ring-line hover:ring-ink-4"}`}>
              <div className="font-medium">{t}</div><div className="mt-1 text-[12px] text-ink-3">{d}</div>
            </button>
          ))}
        </div>
      </fieldset>
      <Section title="Company">
        <Field label="Firm name *"><input className="input" required {...f("name")} placeholder="Acme Solutions"
          onChange={(e) => onChange({ ...value, name: e.target.value, ...(creating && !codeTouched.current ? { code: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) } : {}) })} /></Field>
        <Field label="Firm code *" hint={creating ? "Prefix of every branch & employee login ID, e.g. acme-emp001. Can't be changed later." : "Used in login IDs. Can't be changed."}>
          <input className="input lowercase" required pattern="[a-z0-9]{2,12}" title="2–12 lowercase letters or digits" disabled={!creating}
            value={value.code ?? ""} onChange={(e) => { codeTouched.current = true; onChange({ ...value, code: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) }); }} />
        </Field>
        <Field label="Legal name"><input className="input" {...f("legal_name")} placeholder="Acme Solutions Pvt. Ltd." /></Field>
        <Field label="Industry"><input className="input" {...f("industry")} placeholder="IT Services" /></Field>
        <Field label="Employee limit" hint="Maximum active employees on this plan"><input className="input num" type="number" min={1} {...f("employee_limit")} /></Field>
      </Section>
      <Section title="Address">
        <Field label="Street address" className="sm:col-span-2"><input className="input" {...f("address")} /></Field>
        <Field label="City"><input className="input" {...f("city")} /></Field>
        <Field label="State"><input className="input" {...f("state")} /></Field>
        <Field label="PIN code"><input className="input num" inputMode="numeric" {...f("pincode")} /></Field>
        <Field label="Country"><input className="input" {...f("country")} /></Field>
      </Section>
      <Section title="Statutory registrations">
        <Field label="GSTIN"><input className="input uppercase" {...f("gstin")} /></Field>
        <Field label="PAN"><input className="input uppercase" {...f("pan")} /></Field>
        <Field label="TAN"><input className="input uppercase" {...f("tan")} /></Field>
        <Field label="PF establishment code"><input className="input uppercase" {...f("pf_code")} /></Field>
        <Field label="ESI code"><input className="input uppercase" {...f("esi_code")} /></Field>
      </Section>
      <Section title="Primary contact">
        <Field label="Contact name"><input className="input" {...f("contact_name")} /></Field>
        <Field label="Contact phone"><input className="input" type="tel" {...f("contact_phone")} /></Field>
        <Field label="Contact email" className="sm:col-span-2"><input className="input" type="email" {...f("contact_email")} /></Field>
      </Section>
      {showHr && (
        <Section title="HR login (one per firm)">
          <Field label="HR login email *"><input className="input" type="email" required {...f("hr_email")} autoComplete="off" /></Field>
          <Field label="Initial password *" hint="8+ characters. Share it securely with the firm's HR.">
            <input className="input" type="text" required minLength={8} value={showHr.password} onChange={(e) => showHr.setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
        </Section>
      )}
    </div>
  );
}
