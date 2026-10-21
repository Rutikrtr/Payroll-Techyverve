import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Download, KeyRound, MapPin, QrCode } from "lucide-react";
import { useInstall } from "../lib/install";
import { InstallSteps } from "../components/InstallApp";
import { Button } from "../components/ui";

/** Signed Android app (Trusted Web Activity) built from this site; see README "Android app". */
export const APK = "/downloads/techyverve.apk";

/** Public page employees open from the shared link to install the app on their phone. */
export default function GetApp() {
  const { installed, justInstalled, canPrompt, browser, install } = useInstall();
  const android = browser.startsWith("android");
  const label = browser.startsWith("ios") ? "iPhone" : browser.startsWith("android") ? "Android" : "computer";

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
          ) : justInstalled ? (
            <div className="rounded-2xl bg-white p-5 text-center text-ink">
              <CheckCircle2 className="mx-auto size-10 text-ok" />
              <div className="mt-2 text-[17px] font-medium">Installed</div>
              <p className="mt-1 text-[14px] text-ink-3">Open <b>Techyverve</b> from your home screen and sign in with the code from your admin.</p>
            </div>
          ) : android && browser !== "android-inapp" ? (
            <div className="rounded-2xl bg-white p-5 text-ink">
              <a href={APK} download="Techyverve.apk" className="block">
                <Button className="h-12 w-full" icon={<Download className="size-5" />}>Download Android app</Button>
              </a>
              <div className="mt-1 text-center text-[12px] text-ink-3">Techyverve.apk · 1.3 MB · Android 5.0+</div>
              <ol className="mt-4 space-y-2 text-[14px] text-ink-2">
                {["Tap Download, then open Techyverve.apk", "If asked, allow \"Install unknown apps\" for your browser", "Tap Install, then Open"].map((t, i) => (
                  <li key={t} className="flex items-start gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">{i + 1}</span><span className="pt-0.5">{t}</span></li>
                ))}
              </ol>
              <details className="mt-4 border-t border-line pt-3 text-[13px]">
                <summary className="cursor-pointer text-ink-3">Or install from the browser instead</summary>
                <div className="mt-3">
                  {canPrompt && <Button className="mb-3 w-full" variant="secondary" icon={<Download className="size-4" />} onClick={install}>Install web app</Button>}
                  <InstallSteps browser={browser} />
                </div>
              </details>
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-5 text-ink">
              {canPrompt && (
                <Button className="mb-4 h-12 w-full" icon={<Download className="size-5" />} onClick={install}>Install app</Button>
              )}
              <div className="mb-3 text-[15px] font-medium">{canPrompt ? "Or install from the menu" : `Install on your ${label}`}</div>
              <InstallSteps browser={browser} />
            </div>
          )}
          {!installed && <Link to="/login?as=employee" className="block py-2 text-center text-[13px] text-white/60 underline">Continue in the browser instead</Link>}
        </div>
      </main>
    </div>
  );
}
