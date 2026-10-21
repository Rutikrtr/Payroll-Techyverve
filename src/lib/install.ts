import { useEffect, useState } from "react";

/** Chrome/Edge/Samsung fire this when the app is installable; we keep it to show our own button. */
interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; justInstalled = true; notify(); });
}

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * Which browser the page is open in, because each one installs differently:
 * - in-app: WhatsApp/Instagram/Facebook/etc. built-in browsers can't install at all.
 * - chrome / samsung / other on Android; safari / ios-other (Chrome, Firefox, Edge on iPhone) on iOS.
 */
export type Browser = "android-chrome" | "android-samsung" | "android-inapp" | "android-other" | "ios-safari" | "ios-other" | "ios-inapp" | "desktop";

export function detectBrowser(): Browser {
  const ua = navigator.userAgent;
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|Twitter|LinkedInApp|GSA\/|; wv\)/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) {
    if (inApp) return "ios-inapp";
    return /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/i.test(ua) ? "ios-other" : "ios-safari";
  }
  if (/Android/i.test(ua)) {
    if (inApp) return "android-inapp";
    if (/SamsungBrowser/i.test(ua)) return "android-samsung";
    if (/Chrome\/\d+/i.test(ua) && !/EdgA|OPR|Firefox|MiuiBrowser|UCBrowser|HeyTap|VivoBrowser/i.test(ua)) return "android-chrome";
    return "android-other";
  }
  return "desktop";
}

export const platform = (): "ios" | "android" | "desktop" => {
  const b = detectBrowser();
  return b.startsWith("ios") ? "ios" : b.startsWith("android") ? "android" : "desktop";
};

/** Public link employees open on their phone to install the app. */
export const appLink = () => `${window.location.origin}/get-app`;

/** Android intent that opens this same page in Chrome (escapes WhatsApp/Instagram in-app browsers). */
export const openInChromeUrl = (path = "/get-app") =>
  `intent://${window.location.host}${path}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(window.location.origin + path)};end`;

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => { const l = () => tick((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return {
    installed: isStandalone(),
    justInstalled,
    canPrompt: !!deferred,
    platform: platform(),
    browser: detectBrowser(),
    async install() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null; notify();
      return outcome === "accepted";
    },
  };
}
