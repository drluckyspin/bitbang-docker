/**
 * The go-remote workspace: an isometric glass cube, the usual picture of a container. Its edges draw in, its
 * walls fill, the session settles inside, the lid closes and a padlock snaps shut. Every stage is a 0 to 1
 * prop, so a scene decides the timing.
 */
import React from "react";
import { fonts, stage } from "../theme";
import { mix } from "../lib/anim";

const S = 160;
const ISO = 0.866;

const P = (x: number, y: number, z: number): [number, number] => [(x - z) * ISO, (x + z) * 0.5 - y];
const pts = (list: Array<[number, number, number]>) => list.map((p) => P(...p).map((n) => n.toFixed(1)).join(",")).join(" ");
const seg = (a: [number, number, number], b: [number, number, number]) => {
  const [x1, y1] = P(...a);
  const [x2, y2] = P(...b);
  return { d: `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`, len: Math.hypot(x2 - x1, y2 - y1) };
};

const BACK = [
  seg([0, 0, 0], [S, 0, 0]),
  seg([0, 0, 0], [0, 0, S]),
  seg([0, 0, 0], [0, S, 0]),
];
const FRONT = [
  seg([S, 0, 0], [S, 0, S]),
  seg([0, 0, S], [S, 0, S]),
  seg([S, 0, S], [S, S, S]),
  seg([S, 0, 0], [S, S, 0]),
  seg([0, 0, S], [0, S, S]),
];
const TOP = [seg([0, S, 0], [S, S, 0]), seg([S, S, 0], [S, S, S]), seg([S, S, S], [0, S, S]), seg([0, S, S], [0, S, 0])];

const [minX] = P(0, 0, S);
const [maxX] = P(S, 0, 0);
const [, minY] = P(0, S, 0);
const [, maxY] = P(S, 0, S);
export const CONTAINER_BOX = { w: maxX - minX + 80, h: maxY - minY + 80, x: minX - 40, y: minY - 40 };

const fromCentre = ([x, y]: [number, number]) => ({ x: x - (minX + maxX) / 2, y: y - (minY + maxY) / 2 });
/**
 * Points on the container at scale 1, measured from its centre: the middle of its open top, where the padlock
 * hangs on the front edge, and its lowest corner.
 */
export const CONTAINER_AT = { top: fromCentre(P(S / 2, S, S / 2)), lock: fromCentre(P(S, S / 2, S)), base: fromCentre(P(S, 0, S)) };

export const Container: React.FC<{
  build: number;
  walls: number;
  inside: number;
  lid: number;
  secure: number;
  label: string;
  scale?: number;
}> = ({ build, walls, inside, lid, secure, label, scale = 1 }) => {
  const edge = `rgb(${mix(150, 125, secure)},${mix(205, 226, secure)},${mix(255, 205, secure)})`;
  const draw = (len: number, delay: number) => {
    const t = Math.max(0, Math.min(1, (build - delay) / 0.55));
    return { strokeDasharray: len, strokeDashoffset: len * (1 - t), opacity: t > 0 ? 1 : 0 };
  };
  const lidY = (1 - lid) * -70;
  const [cx, cy] = P(S / 2, S * 0.55, S / 2);
  const [fx, fy] = P(S / 2, 0, S / 2);

  return (
    <svg
      width={CONTAINER_BOX.w * scale}
      height={CONTAINER_BOX.h * scale}
      viewBox={`${CONTAINER_BOX.x} ${CONTAINER_BOX.y} ${CONTAINER_BOX.w} ${CONTAINER_BOX.h}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="wallL" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7FC4FF" stopOpacity={0.2} />
          <stop offset="1" stopColor="#3B6EA8" stopOpacity={0.08} />
        </linearGradient>
        <linearGradient id="wallR" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9FD6FF" stopOpacity={0.14} />
          <stop offset="1" stopColor="#2A4F7E" stopOpacity={0.05} />
        </linearGradient>
        <radialGradient id="core">
          <stop offset="0" stopColor="#FFD9A3" stopOpacity={1} />
          <stop offset="0.35" stopColor={stage.amber} stopOpacity={0.85} />
          <stop offset="1" stopColor={stage.amber} stopOpacity={0} />
        </radialGradient>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={6} />
        </filter>
      </defs>

      <ellipse cx={fx} cy={fy + 16} rx={185} ry={56} fill={`rgba(125,226,195,${0.12 * secure})`} filter="url(#soft)" />
      <polygon points={pts([[0, 0, 0], [S, 0, 0], [S, 0, S], [0, 0, S]])} fill={`rgba(120,190,255,${0.06 * walls})`} />
      {BACK.map((s, i) => (
        <path key={`b${i}`} d={s.d} stroke={edge} strokeOpacity={0.35} strokeWidth={1.5} fill="none" {...draw(s.len, 0)} />
      ))}

      <g opacity={inside}>
        <circle cx={cx} cy={cy} r={70} fill="url(#core)" opacity={0.55} filter="url(#soft)" />
        <g transform={`translate(${cx} ${cy})`}>
          <rect x={-58} y={-34} width={116} height={68} rx={12} fill="#1A140F" stroke={stage.amber} strokeOpacity={0.7} strokeWidth={1.5} />
          <g transform="translate(-34 0)">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <rect key={i} x={-1.6} y={-12} width={3.2} height={10} rx={1.6} fill="#D77757" transform={`rotate(${i * 60})`} />
            ))}
          </g>
          <rect x={-14} y={-12} width={56} height={6} rx={3} fill="#F5E6D3" opacity={0.85} />
          <rect x={-14} y={0} width={40} height={6} rx={3} fill="#F5E6D3" opacity={0.45} />
          <rect x={-14} y={12} width={48} height={6} rx={3} fill="#F5E6D3" opacity={0.3} />
        </g>
      </g>

      <polygon points={pts([[0, 0, S], [S, 0, S], [S, S, S], [0, S, S]])} fill="url(#wallL)" opacity={walls} />
      <polygon points={pts([[S, 0, 0], [S, 0, S], [S, S, S], [S, S, 0]])} fill="url(#wallR)" opacity={walls} />
      {FRONT.map((s, i) => (
        <path key={`f${i}`} d={s.d} stroke={edge} strokeWidth={2.2} strokeLinecap="round" fill="none" {...draw(s.len, 0.15 + i * 0.05)} />
      ))}

      <g transform={`translate(0 ${lidY})`} opacity={lid}>
        <polygon points={pts([[0, S, 0], [S, S, 0], [S, S, S], [0, S, S]])} fill="rgba(170,215,255,0.16)" />
        {TOP.map((s, i) => (
          <path key={`t${i}`} d={s.d} stroke={edge} strokeWidth={2.2} strokeLinecap="round" fill="none" />
        ))}
      </g>
      {lid < 0.01
        ? TOP.map((s, i) => <path key={`o${i}`} d={s.d} stroke={edge} strokeOpacity={0.5} strokeWidth={1.6} fill="none" {...draw(s.len, 0.3)} />)
        : null}

      <g transform={`matrix(${ISO} 0.5 0 1 ${P(0, S, S)[0]} ${P(0, S, S)[1]})`} opacity={walls}>
        <text x={S / 2} y={S - 16} textAnchor="middle" fontFamily={fonts.mono} fontSize={13} fontWeight={500} fill={edge} fillOpacity={0.95}>
          {label}
        </text>
      </g>
    </svg>
  );
};

/** A padlock whose shackle drops shut as `closed` goes from 0 to 1 (it may overshoot, for a spring). */
export const Padlock: React.FC<{ size: number; closed: number; glow: number }> = ({ size, closed, glow }) => {
  const lift = (1 - closed) * 22;
  return (
    <svg width={size} height={size * 1.2} viewBox="-50 -70 100 120" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="lockBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D9DEE6" />
        </linearGradient>
        <linearGradient id="shackle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#C9CFD8" />
          <stop offset="0.5" stopColor="#F4F6F9" />
          <stop offset="1" stopColor="#AEB6C2" />
        </linearGradient>
        <filter id="lockGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation={14} />
        </filter>
      </defs>
      <circle cx={0} cy={6} r={58} fill={`rgba(125,226,195,${0.3 * glow})`} filter="url(#lockGlow)" />
      <path
        d="M-22 -4 V-30 a22 22 0 0 1 44 0 V-4"
        transform={`translate(0 ${-lift})`}
        stroke="url(#shackle)"
        strokeWidth={11}
        fill="none"
        strokeLinecap="round"
      />
      <rect x={-36} y={-12} width={72} height={58} rx={13} fill="url(#lockBody)" />
      <circle cx={0} cy={12} r={7} fill="#0E1116" />
      <rect x={-3} y={14} width={6} height={16} rx={3} fill="#0E1116" />
    </svg>
  );
};
