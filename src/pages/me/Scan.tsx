import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import jsQR from "jsqr";
import { AlertCircle, ArrowLeft, Camera, CheckCircle2, Loader2, LogIn, LogOut, MapPin, RotateCcw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import PortalLayout from "../../components/PortalLayout";
import { Button } from "../../components/ui";

type Result = { action: "check_in" | "check_out"; time: string; late?: boolean; hours?: number; half_day?: boolean; branch: string; distance_m: number | null };

/** High-accuracy GPS fix, with messages employees can act on. */
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("This browser can't share location. Use Chrome or Safari on your phone."));
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(
      e.code === e.PERMISSION_DENIED
        ? "Location permission is blocked. Turn on location (GPS) and allow it for this site in your browser settings, then try again."
        : e.code === e.TIMEOUT ? "Couldn't get your location in time. Move near a window or outdoors and try again."
        : "Location is unavailable. Turn on your phone's location (GPS) and try again.")),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
  });
}

const t12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** Pulls branch id + token out of a scanned QR (a link to /scan?b=..&t=..). */
function parseQr(text: string): { b: string; t: string } | null {
  try {
    const u = new URL(text);
    const b = u.searchParams.get("b"), t = u.searchParams.get("t");
    return b && t ? { b, t } : null;
  } catch { return null; }
}

export default function Scan() {
  const [params] = useSearchParams();
  const [state, setState] = useState<"camera" | "locating" | "busy" | "done" | "error">(params.get("b") ? "locating" : "camera");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const sent = useRef(false);
  const lastCode = useRef<{ b: string; t: string } | null>(null);

  const submit = useCallback(async (b: string, t: string) => {
    if (sent.current) return; // one scan per visit (also guards React StrictMode double effects)
    sent.current = true;
    lastCode.current = { b, t };
    setState("locating");
    let pos: GeolocationPosition;
    try { pos = await getPosition(); }
    catch (e) { setError((e as Error).message); setState("error"); return; }
    setState("busy");
    const { data, error } = await supabase.rpc("scan_attendance", {
      p_branch: b, p_token: t, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_acc: Math.round(pos.coords.accuracy),
    });
    if (error) { setError(error.message); setState("error"); }
    else { setResult(data as Result); setState("done"); }
  }, []);

  // Opened from the phone camera: the URL already carries the code.
  useEffect(() => {
    const b = params.get("b"), t = params.get("t");
    if (b && t) submit(b, t);
  }, [params, submit]);

  function rescan() { sent.current = false; lastCode.current = null; setError(""); setResult(null); setState("camera"); }
  function retry() { const c = lastCode.current; sent.current = false; setError(""); if (c) submit(c.b, c.t); else rescan(); }

  return (
    <PortalLayout subtitle="Scan attendance">
      <div className="mx-auto max-w-md">
        <Link to="/me" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="size-4" />Back</Link>
        {state === "camera" && <Camera_ onCode={(c) => { const p = parseQr(c); if (p) submit(p.b, p.t); else { setError("That isn't an attendance QR code."); setState("error"); } }} />}
        {state === "locating" && <div className="card flex flex-col items-center p-10 text-center text-ink-3"><MapPin className="mb-3 size-8 animate-pulse text-wine-600" />Getting your location…<span className="mt-1 text-[12px]">Allow location access if your phone asks.</span></div>}
        {state === "busy" && <div className="card flex flex-col items-center p-10 text-ink-3"><Loader2 className="mb-3 size-8 animate-spin" />Recording your attendance…</div>}
        {state === "done" && result && (
          <div className="card animate-pop flex flex-col items-center p-8 text-center">
            <div className={`mb-4 flex size-16 items-center justify-center rounded-full ${result.action === "check_in" ? "bg-emerald-50 text-ok" : "bg-indigo-50 text-iris"}`}>
              {result.action === "check_in" ? <LogIn className="size-8" /> : <LogOut className="size-8" />}
            </div>
            <h1 className="text-[24px] font-medium">{result.action === "check_in" ? "Checked in" : "Checked out"}</h1>
            <div className="num mt-1 font-display text-[40px] font-medium tracking-[-0.03em]">{t12(result.time)}</div>
            <p className="text-ink-3">{result.branch} branch</p>
            <p className="mt-2 inline-flex items-center gap-1 text-[13px] text-ok"><MapPin className="size-3.5" />{result.distance_m != null ? `Location verified · ${result.distance_m} m from branch` : "Location recorded"}</p>
            {result.late && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800 ring-1 ring-amber-200">Marked late: you checked in after the grace period.</p>}
            {result.action === "check_out" && <p className="mt-3 text-[13px] text-ink-2">Worked {result.hours} h{result.half_day && <span className="text-warn"> · counted as half day</span>}</p>}
            <Link to="/me" className="mt-6 w-full"><Button className="w-full" icon={<CheckCircle2 className="size-4" />}>Done</Button></Link>
          </div>
        )}
        {state === "error" && (
          <div className="card animate-pop flex flex-col items-center p-8 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-rose-50 text-bad"><AlertCircle className="size-8" /></div>
            <h1 className="text-[20px] font-medium">Couldn't record attendance</h1>
            <p role="alert" className="mt-2 text-ink-2">{error}</p>
            <div className="mt-6 flex w-full gap-2">
              <Button variant="secondary" className="flex-1" icon={<Camera className="size-4" />} onClick={rescan}>Scan again</Button>
              {lastCode.current && <Button className="flex-1" icon={<RotateCcw className="size-4" />} onClick={retry}>Try again</Button>}
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

/** Rear-camera QR reader (jsQR works on iOS Safari too, unlike BarcodeDetector). */
function Camera_({ onCode }: { onCode: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  const cb = useRef(onCode);
  cb.current = onCode; // parent passes an inline callback; keep the camera running across re-renders

  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        video.current!.srcObject = stream;
        await video.current!.play();
        const tick = () => {
          const v = video.current;
          if (!v || stopped) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
            if (code?.data) { stopped = true; stream?.getTracks().forEach((t) => t.stop()); cb.current(code.data); return; }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setErr("Camera access was blocked. Allow camera permission for this site, or scan the QR with your phone's camera app.");
      }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-square bg-ink">
        <video ref={video} playsInline muted className="h-full w-full object-cover" aria-label="Camera preview" />
        <div className="pointer-events-none absolute inset-10 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(8,16,38,.45)]" aria-hidden />
        {err && <div className="absolute inset-0 flex items-center justify-center bg-ink/90 p-6 text-center text-white">{err}</div>}
      </div>
      <p className="p-4 text-center text-[14px] text-ink-2">Point your camera at the QR code shown at your branch.</p>
    </div>
  );
}
