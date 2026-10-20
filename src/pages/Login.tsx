import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ArrowRight, CalendarCheck, Eye, EyeOff, FileText, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Button, Field } from "../components/ui";
import { Logo } from "../components/Layout";

export default function Login() {
  const { session, profile, loading } = useAuth();
  const [setup, setSetup] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { supabase.rpc("setup_required").then(({ data }) => setSetup(!!data)); }, []);

  if (!loading && session && profile) return <Navigate to={profile.role === "superadmin" ? "/admin" : "/app"} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    if (setup) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      if (error) setError(error.message);
      else if (!data.session) setNotice("Super admin created. Check your inbox to confirm the email, then sign in.");
      setSetup(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message);
    }
    setBusy(false);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-[#14060c] p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[560px] rounded-full bg-wine-700/40 blur-[120px]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[420px] rounded-full bg-iris/20 blur-[120px]" aria-hidden />
        <Logo light />
        <div className="relative mt-auto max-w-lg">
          <h1 className="font-display text-[48px] font-medium leading-[1.05] tracking-[-0.04em] text-white">
            Payroll that runs<br />itself, every month.
          </h1>
          <p className="mt-4 text-[16px] text-white/60">Daily attendance, rule-based deductions and branded payslips, in one workspace per firm.</p>
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[
              { icon: <CalendarCheck className="size-5" />, t: "Daily attendance", s: "Present, absent, late" },
              { icon: <ShieldCheck className="size-5" />, t: "PF · ESI · PT", s: "Rules you control" },
              { icon: <FileText className="size-5" />, t: "Payslips", s: "3 formats, PDF" },
            ].map((b) => (
              <div key={b.t} className="rounded-xl bg-white/[.05] p-4 ring-1 ring-white/10">
                <div className="text-wine-300">{b.icon}</div>
                <div className="mt-3 text-[14px] font-medium">{b.t}</div>
                <div className="text-[12px] text-white/50">{b.s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-10"><Logo /></div>
          <h2 className="text-[28px] font-medium tracking-[-0.02em]">{setup ? "Set up your platform" : "Welcome back"}</h2>
          <p className="mt-1.5 text-ink-3">
            {setup ? "Create the super admin account. You'll use it to onboard firms." : "Sign in with your firm's HR login or the super admin account."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate={false}>
            {setup && (
              <Field label="Full name">
                <input className="input" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="hr@yourfirm.com" />
            </Field>
            <Field label="Password" hint={setup ? "At least 8 characters." : undefined}>
              <div className="relative">
                <input className="input pr-11" type={show ? "text" : "password"} required minLength={setup ? 8 : undefined} value={password}
                  onChange={(e) => setPassword(e.target.value)} autoComplete={setup ? "new-password" : "current-password"} />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-md text-ink-3 hover:text-ink cursor-pointer">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {error && <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700 ring-1 ring-rose-200">{error}</div>}
            {notice && <div role="status" className="rounded-lg bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800 ring-1 ring-emerald-200">{notice}</div>}
            <Button type="submit" className="w-full h-11" loading={busy} disabled={setup === null}>
              {setup ? "Create super admin" : "Sign in"} {!busy && <ArrowRight className="size-4" />}
            </Button>
          </form>
          <p className="mt-8 text-center text-[12px] text-ink-4">© {new Date().getFullYear()} Techyverve · Secured by Supabase</p>
        </div>
      </section>
    </div>
  );
}
