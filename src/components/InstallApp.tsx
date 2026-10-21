import { CheckCircle2, Copy, Download, MessageCircle, Share, SquarePlus } from "lucide-react";
import { appLink, useInstall } from "../lib/install";
import { Button, useToast } from "./ui";

/** Steps shown when the browser can't install with one tap (iPhone Safari, or prompt not offered yet). */
export function InstallSteps({ ios }: { ios: boolean }) {
  return ios ? (
    <ol className="space-y-2 text-[13px] text-ink-2">
      <li className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">1</span><span>Open this page in <b>Safari</b></span></li>
      <li className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">2</span><span>Tap <Share className="inline size-4" aria-label="Share" /> <b>Share</b></span></li>
      <li className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">3</span><span>Choose <SquarePlus className="inline size-4" aria-hidden /> <b>Add to Home Screen</b></span></li>
    </ol>
  ) : (
    <ol className="space-y-2 text-[13px] text-ink-2">
      <li className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">1</span><span>Open this page in <b>Chrome</b></span></li>
      <li className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">2</span><span>Tap the <b>⋮</b> menu</span></li>
      <li className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">3</span><span>Choose <b>Install app</b> or <b>Add to Home screen</b></span></li>
    </ol>
  );
}

/** Dashboard card: install on this device + share the employee app link. */
export default function InstallApp({ share }: { share?: boolean }) {
  const { installed, canPrompt, platform, install } = useInstall();
  const toast = useToast();
  const link = appLink();
  const msg = `Install the Techyverve attendance app on your phone: ${link}`;

  return (
    <section className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-wine-100 blur-2xl" aria-hidden />
      <div className="relative flex items-start gap-4">
        <img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 rounded-xl shadow-card" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-medium">Techyverve app</h2>
          <p className="text-[13px] text-ink-3">Install on this {platform === "desktop" ? "computer" : "phone"} for one-tap access.{share ? " Share the link so employees can install it." : ""}</p>
        </div>
      </div>
      <div className="relative mt-4 flex flex-wrap gap-2">
        {installed ? <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-50 px-3 text-[14px] font-medium text-emerald-800"><CheckCircle2 className="size-4" />Installed</span>
          : canPrompt ? <Button icon={<Download className="size-4" />} onClick={async () => { if (await install()) toast("ok", "App installed"); }}>Install app</Button>
          : <a href="/get-app" target="_blank" rel="noreferrer"><Button icon={<Download className="size-4" />}>How to install</Button></a>}
        {share && <>
          <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => { navigator.clipboard.writeText(link); toast("ok", "App link copied"); }}>Copy employee app link</Button>
          <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><Button variant="secondary" icon={<MessageCircle className="size-4" />}>WhatsApp</Button></a>
        </>}
      </div>
    </section>
  );
}
