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
