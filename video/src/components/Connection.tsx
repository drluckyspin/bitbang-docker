/**
 * The encrypted peer-to-peer link between the laptop and the phone: an arc that draws itself, glows, and
 * carries packets along it, with a badge at its crest.
 */
import React from "react";
import { getLength, getPointAtLength } from "@remotion/paths";
import { fonts, stage } from "../theme";

export const beamPath = (a: [number, number], b: [number, number], lift: number) => {
  const mx = (a[0] + b[0]) / 2;
  const top = Math.min(a[1], b[1]) - lift;
  return `M ${a[0]} ${a[1]} C ${a[0] + (mx - a[0]) * 0.35} ${top}, ${b[0] - (b[0] - mx) * 0.35} ${top}, ${b[0]} ${b[1]}`;
};

export const Beam: React.FC<{
  from: [number, number];
  to: [number, number];
  lift?: number;
  draw: number;
  frame: number;
  intensity?: number;
  packets?: number;
}> = ({ from, to, lift = 160, draw, frame, intensity = 1, packets = 7 }) => {
  const d = beamPath(from, to, lift);
  const len = getLength(d);
  const dash = { strokeDasharray: len, strokeDashoffset: len * (1 - draw) };
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
      <defs>
        <linearGradient id="beamGrad" gradientUnits="userSpaceOnUse" x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]}>
          <stop offset="0" stopColor={stage.amber} />
          <stop offset="1" stopColor={stage.mint} />
        </linearGradient>
        <filter id="beamGlow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation={9} />
        </filter>
      </defs>
      <path d={d} stroke="url(#beamGrad)" strokeWidth={14} fill="none" opacity={0.45 * intensity} filter="url(#beamGlow)" {...dash} />
      <path d={d} stroke="url(#beamGrad)" strokeWidth={2.6} fill="none" strokeLinecap="round" opacity={intensity} {...dash} />
      {draw >= 1
        ? Array.from({ length: packets }, (_, i) => {
            const t = (frame / 46 + i / packets) % 1;
            const p = getPointAtLength(d, t * len);
            const fade = Math.sin(t * Math.PI);
            return p ? <circle key={i} cx={p.x} cy={p.y} r={3.4} fill="#FFFFFF" opacity={0.9 * fade * intensity} /> : null;
          })
        : null}
      {[from, to].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={6} fill={i === 0 ? stage.amber : stage.mint} opacity={(i === 0 ? Math.min(1, draw * 4) : draw >= 1 ? 1 : 0) * intensity} />
      ))}
    </svg>
  );
};

export const beamCrest = (from: [number, number], to: [number, number], lift = 160) => {
  const d = beamPath(from, to, lift);
  return getPointAtLength(d, getLength(d) / 2) ?? { x: (from[0] + to[0]) / 2, y: Math.min(from[1], to[1]) - lift * 0.75 };
};

export const Badge: React.FC<{ x: number; y: number; progress: number; children: React.ReactNode }> = ({ x, y, progress, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      translate: `-50% calc(-50% + ${(1 - progress) * 12}px)`,
      opacity: progress,
      scale: String(0.92 + progress * 0.08),
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "11px 20px 11px 16px",
      borderRadius: 999,
      background: "rgba(16,18,22,0.82)",
      border: "1px solid rgba(125,226,195,0.4)",
      boxShadow: "0 10px 40px rgba(0,0,0,0.45), 0 0 30px rgba(125,226,195,0.12)",
      color: stage.ink,
      fontFamily: fonts.sans,
      fontSize: 21,
      fontWeight: 500,
      whiteSpace: "nowrap",
    }}
  >
    <svg width={18} height={22} viewBox="0 0 18 22">
      <rect x={1} y={9} width={16} height={12} rx={3} fill={stage.mint} />
      <path d="M4.5 9.5V6.5a4.5 4.5 0 0 1 9 0v3" stroke={stage.mint} strokeWidth={2.2} fill="none" />
    </svg>
    {children}
  </div>
);

export const Chip: React.FC<{ progress: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ progress, children, style }) => (
  <div
    style={{
      position: "absolute",
      display: "flex",
      alignItems: "center",
      gap: 11,
      padding: "9px 16px 9px 10px",
      borderRadius: 12,
      background: "rgba(14,16,20,0.78)",
      border: "1px solid rgba(255,255,255,0.12)",
      color: stage.ink,
      fontFamily: fonts.sans,
      fontSize: 17,
      fontWeight: 500,
      whiteSpace: "nowrap",
      opacity: progress,
      translate: `${(1 - progress) * 18}px 0`,
      ...style,
    }}
  >
    <svg width={22} height={22} viewBox="0 0 22 22">
      <circle cx={11} cy={11} r={10} fill="rgba(125,226,195,0.16)" stroke={stage.mint} strokeWidth={1.4} />
      <path d="M6.6 11.3 9.6 14.2 15.4 8" stroke={stage.mint} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    {children}
  </div>
);
