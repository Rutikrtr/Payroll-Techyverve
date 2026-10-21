import { useEffect, useState } from "react";

/** Chrome/Edge/Android fire this once when the app is installable; we keep it to show our own button. */
interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const platform = (): "ios" | "android" | "desktop" => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return /Android/i.test(ua) ? "android" : "desktop";
};

/** Public link employees open on their phone to install the app. */
export const appLink = () => `${window.location.origin}/get-app`;

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => { const l = () => tick((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    platform: platform(),
    async install() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null; notify();
      return outcome === "accepted";
    },
  };
}
