import { useEffect, useState } from "react";

/**
 * Branch network: the main branch (first created) in the centre with the firm's name and logo, every other branch
 * linked to it by a line with a moving pulse. A branch "lights up" when someone there is checked in.
 * Pure SVG + CSS animation: no extra data or network calls.
 */
export type NetNode = { id: string; name: string; inOffice: number; total: number };

const wrap = (s: string, max: number) => {
  const words = s.split(/\s+/); const lines: string[] = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + " " + w).trim().length > max && cur) lines.push(w); else lines[lines.length - 1] = (cur + " " + w).trim();
  }
  if (lines.length > 3) return [lines[0], lines[1], `${lines.slice(2).join(" ").slice(0, max - 1)}…`];
  return lines;
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 640);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return narrow;
}
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function BranchNetwork({ firmName, logo, main, others, selected, onSelect }: {
  firmName: string; logo: string | null; main: NetNode; others: NetNode[]; selected: string | null; onSelect: (id: string) => void;
}) {
  const narrow = useNarrow();
  const motion = !reducedMotion();

  // Layout: wide = HQ centred with branches on an ellipse; narrow = HQ on top, branches in a column below.
  const W = narrow ? 360 : 1000;
  const HQ = narrow ? { w: 312, h: 124 } : { w: 300, h: 128 };
  const NODE = narrow ? { w: 296, h: 62 } : { w: 196, h: 66 };
  const H = others.length === 0 ? (narrow ? 150 : 190) : narrow ? 150 + others.length * 84 : Math.max(380, others.length > 6 ? 470 : 400);
  const hq = narrow ? { x: W / 2 + 8, y: 76 } : { x: W / 2, y: H / 2 };
  const pos = others.map((_, i) => {
    if (narrow) return { x: W - 12 - NODE.w / 2, y: 178 + i * 82 };
    const n = others.length;
    const a = -Math.PI / 2 + (Math.PI * 2 * (i + 0.5)) / Math.max(n, 1);
    return { x: hq.x + Math.cos(a) * 375, y: hq.y + Math.sin(a) * (H / 2 - 52) };
  });

  const Node = ({ n, x, y, isMain }: { n: NetNode; x: number; y: number; isMain?: boolean }) => {
    const on = n.inOffice > 0;
    const sel = selected === n.id;
    const box = isMain ? HQ : NODE;
    const left = x - box.w / 2, top = y - box.h / 2;
    const pct = n.total ? n.inOffice / n.total : 0;
    return (
      <g className="cursor-pointer" role="button" tabIndex={0} aria-label={`${n.name}: ${n.inOffice} of ${n.total} in office`}
        onClick={() => onSelect(n.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(n.id)}>
        {on && <rect x={left - 6} y={top - 6} width={box.w + 12} height={box.h + 12} rx={20} fill={isMain ? "#a3305a" : "#10b981"} opacity={0.16} className={motion ? "bn-glow" : undefined} />}
        <rect x={left} y={top} width={box.w} height={box.h} rx={16} fill="#ffffff" stroke={sel ? "#a3305a" : "#e6e1da"} strokeWidth={sel ? 2.2 : 1}
          style={{ filter: "drop-shadow(0 6px 14px rgba(20,6,12,.08))" }} />
        {isMain ? (
          <>
            <rect x={left} y={top} width={box.w} height={6} rx={3} fill="#7a1f3f" />
            {logo
              ? <image href={logo} x={left + 14} y={top + 20} width={46} height={46} preserveAspectRatio="xMidYMid meet" />
              : <rect x={left + 14} y={top + 20} width={46} height={46} rx={10} fill="#7a1f3f" />}
            <text x={left + 72} y={top + 30} fontSize={10} fontWeight={700} fill="#a3305a" letterSpacing={1}>MAIN BRANCH · HQ</text>
            {wrap(firmName, 27).map((l, i) => <text key={i} x={left + 72} y={top + 47 + i * 16} fontSize={13.5} fontWeight={700} fill="#1a1216">{l}</text>)}
            <text x={left + 14} y={top + box.h - 12} fontSize={11} fill="#6b6470">{clip(n.name, 26)}</text>
          </>
        ) : (
          <>
            <text x={left + 14} y={top + 24} fontSize={13} fontWeight={700} fill="#1a1216">{clip(n.name, narrow ? 26 : 20)}</text>
          </>
        )}
        {/* light bulb */}
        <circle cx={left + box.w - 20} cy={top + 22} r={8} fill={on ? "#ffcf4d" : "#e5e7eb"} stroke={on ? "#f5a300" : "#cbd0d6"} />
        {on && motion && <circle cx={left + box.w - 20} cy={top + 22} r={8} fill="none" stroke="#ffcf4d" className="bn-ping" />}
        {/* occupancy */}
        <text x={left + box.w - 14} y={top + box.h - 12} textAnchor="end" fontSize={12} fill="#6b6470">
          <tspan fontWeight={700} fill={on ? "#047857" : "#1a1216"}>{n.inOffice}</tspan>/{n.total} in
        </text>
        {!isMain && <>
          <rect x={left + 14} y={top + box.h - 22} width={box.w - 92} height={5} rx={2.5} fill="#f0ece6" />
          <rect x={left + 14} y={top + box.h - 22} width={Math.max(0, (box.w - 92) * pct)} height={5} rx={2.5} fill="#10b981" />
        </>}
      </g>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ background: "radial-gradient(800px 300px at 50% 50%, #fbf3f6, #f7f5f2 70%)" }}>
      <style>{`
        @keyframes bn-dash { to { stroke-dashoffset: -28; } }
        @keyframes bn-glow { 0%,100% { opacity: .1 } 50% { opacity: .28 } }
        @keyframes bn-ping { 0% { r: 8; opacity: .9 } 100% { r: 18; opacity: 0 } }
        .bn-flow { stroke-dasharray: 6 8; animation: bn-dash 1.2s linear infinite; }
        .bn-flow.idle { animation-duration: 3.5s; }
        .bn-glow { animation: bn-glow 2.4s ease-in-out infinite; }
        .bn-ping { animation: bn-ping 1.8s ease-out infinite; }
      `}</style>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Branch network">
        {/* dotted map grid */}
        <defs><pattern id="bn-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#e3dcd3" /></pattern></defs>
        <rect width={W} height={H} fill="url(#bn-dots)" />
        {others.map((n, i) => {
          const p = pos[i]; const on = n.inOffice > 0;
          const mx = (hq.x + p.x) / 2, my = (hq.y + p.y) / 2;
          const d = narrow
            ? `M24,${hq.y} L24,${p.y - 14} Q24,${p.y} 38,${p.y} L${p.x - NODE.w / 2},${p.y}`
            : `M${hq.x},${hq.y} Q${mx + (p.y - hq.y) * 0.18},${my - (p.x - hq.x) * 0.12} ${p.x},${p.y}`;
          const id = `bn-path-${i}`;
          return (
            <g key={n.id}>
              <path id={id} d={d} fill="none" stroke="#e6dfd6" strokeWidth={3} strokeLinecap="round" />
              <path d={d} fill="none" stroke={on ? "#10b981" : "#c7b9c0"} strokeWidth={2} strokeLinecap="round" className={motion ? cx2("bn-flow", !on && "idle") : undefined} />
              {motion && (
                <circle r={4.5} fill={on ? "#10b981" : "#b9a8b0"}>
                  <animateMotion dur={on ? "2.2s" : "4.5s"} repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear"><mpath href={`#${id}`} /></animateMotion>
                </circle>
              )}
            </g>
          );
        })}
        {others.map((n, i) => <Node key={n.id} n={n} x={pos[i].x} y={pos[i].y} />)}
        <Node n={main} x={hq.x} y={hq.y} isMain />
      </svg>
      <div className="pointer-events-none absolute bottom-2 right-3 flex items-center gap-3 rounded-full bg-white/80 px-3 py-1 text-[11px] text-ink-3 ring-1 ring-line backdrop-blur">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" />Staff in</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#c7b9c0]" />Quiet</span>
        <span className="hidden sm:inline">Click a branch to open its floor</span>
      </div>
    </div>
  );
}

const cx2 = (...c: (string | false)[]) => c.filter(Boolean).join(" ");
