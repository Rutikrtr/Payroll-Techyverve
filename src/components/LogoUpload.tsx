import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Button, useToast } from "./ui";

const MAX_SIDE = 320; // px: plenty for a payslip header and the sidebar, and keeps the image small
const MAX_LEN = 200_000; // matches the database check

/** Shrink any picked image to a small WebP/PNG data URL (transparent background is kept). */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    for (const [type, q] of [["image/webp", 0.92], ["image/webp", 0.8], ["image/png", 1]] as const) {
      const data = c.toDataURL(type, q);
      if (data.startsWith(`data:${type}`) && data.length <= MAX_LEN) return data;
    }
    throw new Error("This image is too detailed. Try a simpler logo file.");
  } finally { URL.revokeObjectURL(url); }
}

export default function LogoUpload({ onChange }: { onChange?: (logo: string | null) => void }) {
  const { firm, refreshFirm } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function save(logo: string | null) {
    setBusy(true);
    const { error } = await supabase.rpc("set_firm_logo", { p_logo: logo });
    setBusy(false);
    if (error) return toast("error", error.message);
    await refreshFirm(); onChange?.(logo);
    toast("ok", logo ? "Logo updated" : "Logo removed");
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(file.type)) return toast("error", "Choose a PNG, JPG or WebP image");
    if (file.size > 10 * 1024 * 1024) return toast("error", "Image is larger than 10 MB");
    try { await save(await shrink(file)); } catch (e) { toast("error", (e as Error).message); }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
        {firm?.logo_url ? <img src={firm.logo_url} alt={`${firm.name} logo`} className="max-h-full max-w-full object-contain p-1.5" />
          : <ImagePlus className="size-6 text-ink-4" aria-hidden />}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<ImagePlus className="size-4" />} loading={busy} onClick={() => input.current?.click()}>{firm?.logo_url ? "Change logo" : "Upload logo"}</Button>
          {firm?.logo_url && <Button size="sm" variant="secondary" icon={<Trash2 className="size-4" />} disabled={busy} onClick={() => save(null)}>Remove</Button>}
        </div>
        <p className="text-[12px] text-ink-3">PNG, JPG or WebP. Shown on payslips and in the app. A square logo on a transparent background looks best.</p>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
