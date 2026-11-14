/**
 * After a new deploy, a tab that was opened earlier still points at the previous build's file names, which no
 * longer exist ("Failed to fetch dynamically imported module"). Reloading picks up the new build. We reload at
 * most once a minute so a genuinely offline user doesn't get stuck in a reload loop.
 */
const KEY = "tv-stale-reload";
const STALE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

export const isStaleChunkError = (e: unknown) => STALE.test(e instanceof Error ? e.message : String(e ?? ""));

/** Reloads the page to load the latest version. Returns false if it already did so in the last minute. */
export function reloadForNewVersion(): boolean {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY)) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < 60_000) return false;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  window.location.reload();
  return true;
}

/** Catches stale-file failures anywhere in the app (lazy pages, Excel export) and reloads once. */
export function installStaleChunkRecovery() {
  window.addEventListener("vite:preloadError", (e) => { if (reloadForNewVersion()) e.preventDefault(); });
  window.addEventListener("unhandledrejection", (e) => { if (isStaleChunkError(e.reason)) reloadForNewVersion(); });
}

/**
 * An open tab keeps running the build it was opened with, so new pages and fixes don't appear until a refresh.
 * Check the deployed index file name (a tiny static request, never the database) when the tab regains focus
 * (at most every 5 minutes) and every 15 minutes; if it changed, offer a one-click refresh.
 */
export function installUpdateCheck() {
  const mine = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.src.match(/index-[\w-]+\.js/)?.[0];
  if (!mine) return; // dev server: nothing to compare
  let last = 0, shown = false;
  const check = async () => {
    if (shown || document.visibilityState !== "visible" || Date.now() - last < 5 * 60_000) return;
    last = Date.now();
    try {
      const html = await (await fetch("/", { cache: "no-store" })).text();
      const live = html.match(/index-[\w-]+\.js/)?.[0];
      if (live && live !== mine) { shown = true; showBanner(); }
    } catch { /* offline: try again later */ }
  };
  setInterval(check, 15 * 60_000);
  document.addEventListener("visibilitychange", check);
  window.addEventListener("focus", check);
}

function showBanner() {
  const bar = document.createElement("div");
  bar.setAttribute("role", "status");
  bar.className = "no-print";
  bar.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:12px;" +
    "padding:10px 10px 10px 16px;border-radius:14px;background:#14060c;color:#fff;font:500 14px/1.3 system-ui,sans-serif;" +
    "box-shadow:0 12px 32px -8px rgba(20,6,12,.45);max-width:calc(100vw - 32px)";
  bar.innerHTML = '<span>A new version of the app is available.</span>';
  const btn = document.createElement("button");
  btn.textContent = "Refresh";
  btn.style.cssText = "cursor:pointer;border:0;border-radius:10px;padding:8px 14px;background:#a3305a;color:#fff;font:600 13px system-ui,sans-serif";
  btn.onclick = () => window.location.reload();
  bar.appendChild(btn);
  document.body.appendChild(bar);
}
