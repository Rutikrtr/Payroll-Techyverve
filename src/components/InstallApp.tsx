import type { ReactNode } from "react";
import { CheckCircle2, Chrome, Compass, Copy, Download, EllipsisVertical, Menu, MessageCircle, Share, SquarePlus } from "lucide-react";
import { appLink, openInChromeUrl, useInstall, type Browser } from "../lib/install";
import { Button, useToast } from "./ui";

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-wine-50 text-[12px] font-semibold text-wine-700">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
const I = ({ children }: { children: ReactNode }) => <span className="mx-0.5 inline-flex translate-y-[3px] items-center">{children}</span>;

/** Exact install steps for the browser the page is open in. */
export function InstallSteps({ browser }: { browser: Browser }) {
  const toast = useToast();
  const copy = () => { navigator.clipboard?.writeText(appLink()); toast("ok", "Link copied"); };
  const cls = "space-y-3 text-[14px] text-ink-2";

  switch (browser) {
    case "android-chrome":
      return (
        <ol className={cls}>
          <Step n={1}>Tap <I><EllipsisVertical className="size-4" aria-label="menu" /></I> (top-right corner)</Step>
          <Step n={2}>Tap <b>Add to Home screen</b> (or <b>Install app</b>)</Step>
          <Step n={3}>Choose <b>Install</b>. The app appears on your home screen.</Step>
        </ol>
      );
    case "android-samsung":
      return (
        <ol className={cls}>
          <Step n={1}>Tap <I><Menu className="size-4" aria-label="menu" /></I> (bottom-right)</Step>
          <Step n={2}>Tap <b>Add page to</b> then <b>Home screen</b></Step>
          <Step n={3}>Tap <b>Add</b>. The app appears on your home screen.</Step>
        </ol>
      );
    case "android-inapp":
    case "android-other":
      return (
        <div className="space-y-3">
          <p className="text-[14px] text-ink-2">{browser === "android-inapp" ? "This page is open inside another app (like WhatsApp), which can't install apps." : "This browser can't install apps."} Open it in <b>Chrome</b>:</p>
          <a href={openInChromeUrl()} className="block"><Button className="h-11 w-full" icon={<Chrome className="size-5" />}>Open in Chrome</Button></a>
          <Button variant="secondary" className="w-full" icon={<Copy className="size-4" />} onClick={copy}>Copy link instead</Button>
        </div>
      );
    case "ios-safari":
      return (
        <ol className={cls}>
          <Step n={1}>Tap <I><Share className="size-4" aria-label="Share" /></I> <b>Share</b> at the bottom of Safari</Step>
          <Step n={2}>Scroll down and tap <I><SquarePlus className="size-4" aria-hidden /></I> <b>Add to Home Screen</b></Step>
          <Step n={3}>Tap <b>Add</b>. Open the app from your home screen.</Step>
        </ol>
      );
    case "ios-other":
      return (
        <ol className={cls}>
          <Step n={1}>Tap <I><Share className="size-4" aria-label="Share" /></I> <b>Share</b> next to the address bar</Step>
          <Step n={2}>Tap <b>Add to Home Screen</b>, then <b>Add</b></Step>
          <Step n={3}>Don't see it? Open this page in <b>Safari</b> instead:
            <a href={`x-safari-${appLink()}`} className="mt-2 block"><Button size="sm" variant="secondary" icon={<Compass className="size-4" />}>Open in Safari</Button></a>
          </Step>
        </ol>
      );
    case "ios-inapp":
      return (
        <div className="space-y-3">
          <p className="text-[14px] text-ink-2">This page is open inside another app (like WhatsApp). Apps can only be installed from <b>Safari</b>.</p>
          <a href={`x-safari-${appLink()}`} className="block"><Button className="h-11 w-full" icon={<Compass className="size-5" />}>Open in Safari</Button></a>
          <Button variant="secondary" className="w-full" icon={<Copy className="size-4" />} onClick={copy}>Copy link, then paste in Safari</Button>
        </div>
      );
    default:
      return (
        <ol className={cls}>
          <Step n={1}>Open this page in <b>Chrome</b> or <b>Edge</b></Step>
          <Step n={2}>Click the install icon at the right end of the address bar</Step>
          <Step n={3}>Click <b>Install</b></Step>
        </ol>
      );
  }
}

/** Dashboard card: install on this device + share the employee app link. */
export default function InstallApp({ share }: { share?: boolean }) {
  const { installed, canPrompt, platform, install } = useInstall();
  const toast = useToast();
  const link = appLink();
  const msg = `Install the Techyverve attendance app on your phone. Open this link in Chrome (Android) or Safari (iPhone): ${link}`;

  return (
    <section className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-wine-100 blur-2xl" aria-hidden />
      <div className="relative flex items-start gap-4">
        <img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 rounded-xl shadow-card" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-medium">Techyverve app</h2>
          <p className="text-[13px] text-ink-3">Works on Android, iPhone and computers.{share ? " Share the link so employees install it on their phones." : ""}</p>
        </div>
      </div>
      <div className="relative mt-4 flex flex-wrap gap-2">
        {installed ? <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-50 px-3 text-[14px] font-medium text-emerald-800"><CheckCircle2 className="size-4" />Installed</span>
          : canPrompt ? <Button icon={<Download className="size-4" />} onClick={async () => { if (await install()) toast("ok", "App installed"); }}>Install on this {platform === "desktop" ? "computer" : "phone"}</Button>
          : <a href="/get-app" target="_blank" rel="noreferrer"><Button icon={<Download className="size-4" />}>Install on this device</Button></a>}
        {share && <>
          <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => { navigator.clipboard.writeText(link); toast("ok", "App link copied"); }}>Copy employee app link</Button>
          <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><Button variant="secondary" icon={<MessageCircle className="size-4" />}>WhatsApp</Button></a>
        </>}
      </div>
    </section>
  );
}
