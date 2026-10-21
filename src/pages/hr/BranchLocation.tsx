import { useEffect, useState, type FormEvent } from "react";
import { Crosshair, ExternalLink, MapPinOff } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Branch } from "../../lib/types";
import { Button, Field, Modal, useToast } from "../../components/ui";

const RADII = [50, 100, 200, 300, 500, 1000];
export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

/** Accepts "18.5523, 73.8059" pasted from Google Maps, or a single number. */
function parseCoords(text: string): [number, number] | null {
  const m = text.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

export default function BranchLocation({ branch, onClose, onSaved }: { branch: Branch | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [coords, setCoords] = useState("");
  const [radius, setRadius] = useState(200);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!branch) return;
    setCoords(branch.lat != null ? `${branch.lat}, ${branch.lng}` : "");
    setRadius(branch.radius_m);
  }, [branch]);

  const parsed = parseCoords(coords);

  function useMine() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`); setLocating(false);
        if (p.coords.accuracy > 100) toast("error", `Location is only accurate to ±${Math.round(p.coords.accuracy)} m. For best results do this on a phone at the branch.`); },
      () => { setLocating(false); toast("error", "Couldn't get location. Allow location access, or paste coordinates from Google Maps."); },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!parsed) return toast("error", "Enter coordinates like 18.5523, 73.8059");
    setBusy(true);
    const { error } = await supabase.from("branches").update({ lat: parsed[0], lng: parsed[1], radius_m: radius }).eq("id", branch!.id);
    setBusy(false);
    if (error) return toast("error", error.message);
    toast("ok", `${branch!.name}: scans now must be within ${radius} m`); onSaved(); onClose();
  }

  async function clear() {
    setBusy(true);
    const { error } = await supabase.from("branches").update({ lat: null, lng: null }).eq("id", branch!.id);
    setBusy(false);
    if (error) return toast("error", error.message);
    toast("ok", "Location removed. Scans are recorded but not restricted."); onSaved(); onClose();
  }

  return (
    <Modal open={!!branch} onClose={onClose} title={`${branch?.name} · location`}
      description="Employees must be within this distance of the branch to check in or out. Every scan's GPS position is saved."
      footer={<>
        {branch?.lat != null && <Button variant="danger" icon={<MapPinOff className="size-4" />} loading={busy} onClick={clear} className="mr-auto">Remove</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="geo" loading={busy} disabled={!parsed}>Save location</Button>
      </>}>
      <form id="geo" onSubmit={save} className="space-y-4">
        <Button type="button" variant="secondary" className="w-full" icon={<Crosshair className="size-4" />} loading={locating} onClick={useMine}>
          Use my current location
        </Button>
        <p className="text-center text-[12px] text-ink-3">Best done on a phone while standing at the branch. Or paste coordinates below.</p>
        <Field label="Coordinates (latitude, longitude)" hint="In Google Maps, long-press the branch and copy the numbers shown."
          error={coords && !parsed ? "Use the format 18.5523, 73.8059" : undefined}>
          <input className="input num" value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="18.5523, 73.8059" inputMode="decimal" />
        </Field>
        {parsed && <a href={mapsUrl(parsed[0], parsed[1])} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-wine-700 hover:underline">Check on Google Maps <ExternalLink className="size-3.5" /></a>}
        <Field label="Allowed radius">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Allowed radius">
            {RADII.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={radius === r} onClick={() => setRadius(r)}
                className={`h-9 rounded-lg px-3 text-[13px] font-medium ring-1 cursor-pointer transition-colors ${radius === r ? "bg-wine-700 text-white ring-wine-700" : "bg-white text-ink-2 ring-line hover:ring-ink-4"}`}>
                {r >= 1000 ? `${r / 1000} km` : `${r} m`}
              </button>
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
}
