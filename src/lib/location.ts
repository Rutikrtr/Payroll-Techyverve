/**
 * Reliable phone location for attendance scans.
 *
 * Android often needs 5–30 s for a GPS fix indoors and first reports a rough Wi-Fi/cell position, so a single
 * getCurrentPosition(highAccuracy, maximumAge 0, 20 s) frequently times out. Instead we watch the position,
 * report accuracy as it improves, and settle on:
 *   - the first fix at or under GOOD_M, or
 *   - after OK_AFTER_MS, the best fix at or under OK_M, or
 *   - after BEST_AFTER_MS, the best fix we have at all;
 * and if GPS yields nothing, a network (low-accuracy) fix as a fallback.
 */
export interface Fix { lat: number; lng: number; accuracy: number }

const GOOD_M = 30;
const OK_M = 100;
const OK_AFTER_MS = 6_000;
const BEST_AFTER_MS = 15_000;
const GIVE_UP_MS = 30_000;

export class LocationError extends Error {
  constructor(public kind: "denied" | "off" | "timeout" | "unsupported", message: string) { super(message); }
}

const isAndroid = () => /Android/i.test(navigator.userAgent);
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Step-by-step help for the employee's phone. */
export function locationHelp(kind: LocationError["kind"]): string {
  if (kind === "unsupported") return "This browser can't share location. Open the app in Chrome (Android) or Safari (iPhone).";
  if (kind === "denied") {
    if (isAndroid()) return "Location permission is blocked. Open phone Settings → Apps → Techyverve (or Chrome) → Permissions → Location → Allow, then try again.";
    if (isIOS()) return "Location permission is blocked. Open Settings → Privacy & Security → Location Services → Safari Websites → While Using, then try again.";
    return "Location permission is blocked. Allow location for this site in your browser settings, then try again.";
  }
  if (kind === "off") {
    if (isAndroid()) return "Your phone's location is off. Swipe down from the top, turn on Location, then try again. For better accuracy also turn on Settings → Location → Google Location Accuracy.";
    return "Your phone's location is off. Turn on Location Services, then try again.";
  }
  return "Couldn't get your location in time. Make sure Location is on, move near a window or outdoors, and try again.";
}

/** Current permission state if the browser can tell us ("granted" | "prompt" | "denied"), else null. */
export async function locationPermission(): Promise<PermissionState | null> {
  try { return (await navigator.permissions.query({ name: "geolocation" as PermissionName })).state; }
  catch { return null; }
}

export function getFix(onProgress?: (accuracy: number) => void): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new LocationError("unsupported", locationHelp("unsupported")));

    const startedAt = Date.now();
    let best: GeolocationPosition | null = null;
    let lastError: GeolocationPositionError | null = null;
    let done = false;
    let fallbackStarted = false;

    const finish = (pos: GeolocationPosition | null, err?: LocationError) => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watchId);
      clearInterval(tick);
      if (pos) resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
      else reject(err ?? new LocationError("timeout", locationHelp("timeout")));
    };

    const consider = (pos: GeolocationPosition) => {
      if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
      onProgress?.(Math.round(best.coords.accuracy));
      if (best.coords.accuracy <= GOOD_M) finish(best);
    };

    const fail = (e: GeolocationPositionError) => {
      lastError = e;
      if (e.code === e.PERMISSION_DENIED) return finish(null, new LocationError("denied", locationHelp("denied")));
      if (e.code === e.POSITION_UNAVAILABLE && !best) {
        // Location services off (or no GPS): try the network position once, then stop instead of waiting 30 s.
        if (!fallbackStarted) { fallbackStarted = true; startFallback(); }
        else finish(null, new LocationError("off", locationHelp("off")));
      }
    };
    const startFallback = () =>
      navigator.geolocation.getCurrentPosition(consider, fail, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 });

    const watchId = navigator.geolocation.watchPosition(consider, fail, { enableHighAccuracy: true, maximumAge: 0, timeout: GIVE_UP_MS });

    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (best && elapsed >= OK_AFTER_MS && best.coords.accuracy <= OK_M) return finish(best);
      if (best && elapsed >= BEST_AFTER_MS) return finish(best);
      // No GPS fix yet: ask for a quick network (Wi-Fi / cell) position as a fallback.
      if (!best && !fallbackStarted && elapsed >= 8_000) { fallbackStarted = true; startFallback(); }
      if (elapsed >= GIVE_UP_MS) {
        const off = (lastError as GeolocationPositionError | null)?.code === 2; // POSITION_UNAVAILABLE: location services off
        finish(best, best ? undefined : new LocationError(off ? "off" : "timeout", locationHelp(off ? "off" : "timeout")));
      }
    }, 500);
  });
}
