import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Skeleton } from "./ui";

/** What an attendance QR encodes: a link to this app's scan page, so a phone camera works too. */
export const scanUrl = (branchId: string, token: string) =>
  `${window.location.origin}/scan?b=${branchId}&t=${token}`;

export default function QrCode({ value, size = 280, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: "M", color: { dark: "#14060c", light: "#ffffff" } })
      .then(setSrc);
  }, [value, size]);
  if (!src) return <Skeleton className="rounded-xl" />;
  return <img src={src} width={size} height={size} alt={label} className="rounded-xl bg-white" style={{ width: size, height: size }} />;
}
