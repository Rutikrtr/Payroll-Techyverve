/**
 * True on phones and tablets. Checks the UA (incl. Client Hints), iPadOS (which reports a Mac UA
 * but has touch points), and touch-only devices with no precise pointer.
 * Client-side only: it keeps branch kiosks on computers, it is not a security boundary.
 */
export function isMobileDevice(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile) return true;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|Opera Mini|IEMobile/i.test(ua)) return true;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true; // iPadOS desktop mode
  return matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
}
