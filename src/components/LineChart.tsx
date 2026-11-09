"use client";
import { useRef, useState } from "react";

export type Pt = { label: string; y: number; shape?: Shape; tip: string };
export type Shape = "circle" | "square" | "diamond" | "triangle";

export function Marker({ shape, x, y, r, fill, ring }: { shape: Shape; x: number; y: number; r: number; fill: string; ring: string }) {
  const common = { fill, stroke: ring, strokeWidth: 2 };
  if (shape === "square") return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1.5} {...common} />;
  if (shape === "diamond") return <path d={`M${x} ${y - r * 1.3}L${x + r * 1.3} ${y}L${x} ${y + r * 1.3}L${x - r * 1.3} ${y}Z`} {...common} />;
  if (shape === "triangle") return <path d={`M${x} ${y - r * 1.3}L${x + r * 1.25} ${y + r}L${x - r * 1.25} ${y + r}Z`} {...common} />;
  return <circle cx={x} cy={y} r={r} {...common} />;
}

type Props = {
  points: Pt[];
  min: number;
  max: number;
  ticks: number[];
  color: string;
  height?: number;
  compact?: boolean; // small multiple: no x labels, marker on last point only
  ariaLabel: string;
};

export default function LineChart({ points, min, max, ticks, color, height = 240, compact = false, ariaLabel }: Props) {
  const W = compact ? 320 : 640;
  const H = height;
  const pad = { l: compact ? 26 : 36, r: 14, t: 12, b: compact ? 10 : 28 };
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = points.length;
  const x = (i: number) => (n <= 1 ? (pad.l + W - pad.r) / 2 : pad.l + (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => pad.t + ((max - v) * (H - pad.t - pad.b)) / (max - min);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join("");

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(n ? best : null);
  }

  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const hp = hover != null ? points[hover] : null;

  return (
    <div className="chart">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: "pan-y" }}
      >
        <g className="grid">
          {ticks.map((t) => <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />)}
        </g>
        <g className="axis">
          {ticks.map((t) => (
            <text key={t} x={pad.l - 8} y={y(t) + 4} textAnchor="end">{t}</text>
          ))}
          {!compact &&
            points.map((p, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{p.label}</text>
              ) : null
            )}
        </g>
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) =>
          !compact || i === n - 1 || i === hover ? (
            <Marker key={i} shape={p.shape ?? "circle"} x={x(i)} y={y(p.y)} r={hover === i ? 6 : compact ? 4 : 4.5} fill={color} ring="var(--paper)" />
          ) : null
        )}
      </svg>
      {hp && hover != null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(hp.y) / H) * 100}%` }}>{hp.tip}</div>
      )}
    </div>
  );
}
