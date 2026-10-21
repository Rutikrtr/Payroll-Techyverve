import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Download, KeyRound, MapPin, QrCode } from "lucide-react";
import { useInstall } from "../lib/install";
import { InstallSteps } from "../components/InstallApp";
import { Button } from "../components/ui";

/** Public page employees open from the shared link to install the app. */
export default function GetApp() {
  const { installed, canPrompt, platform, install } = useInstall();
  return (
    <div className="min-h-screen bg-[#14060c] text-white">
      <div className="pointer-events-none fixed -right-32 -top-32 size-96 rounded-full bg-wine-700/50 blur-[100px]" aria-hidden />
      <main className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <img src="/icons/icon-512.png" alt="" width={88} height={88} className="size-[88px] rounded-[22px] shadow-pop" />
        <h1 className="mt-6 font-display text-[34px] font-medium leading-tight tracking-[-0.03em] text-white">Techyverve<br />attendance app</h1>
        <p className="mt-2 text-white/60">Check in with your branch QR, see your attendance and download payslips.</p>

        <ul className="mt-8 space-y-3 text-[14px]">
          {[[<QrCode key="q" className="size-4" />, "Scan the branch QR to check in and out"], [<MapPin key="m" className="size-4" />, "Location verified on every scan"],
            [<KeyRound key="k" className="size-4" />, "Sign in once with a code from your admin"]].map(([icon, t], i) => (
            <li key={i} className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-white/10 text-wine-200">{icon}</span>{t}</li>
          ))}
        </ul>

        <div className="mt-auto space-y-3 pt-10">
          {installed ? (
            <Link to="/login?as=employee"><Button className="h-12 w-full !bg-white !text-wine-800" icon={<CheckCircle2 className="size-5" />}>Open app <ArrowRight className="size-4" /></Button></Link>
          ) : canPrompt ? (
            <Button className="h-12 w-full !bg-white !text-wine-800" icon={<Download className="size-5" />} onClick={install}>Install app</Button>
          ) : (
            <div className="rounded-2xl bg-white p-5 text-ink">
              <div className="mb-3 font-medium">Install in 3 steps</div>
              <InstallSteps ios={platform === "ios"} />
            </div>
          )}
          {!installed && <Link to="/login?as=employee" className="block text-center text-[13px] text-white/60 underline">Continue in the browser instead</Link>}
        </div>
      </main>
    </div>
  );
}
