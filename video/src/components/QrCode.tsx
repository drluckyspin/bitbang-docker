/**
 * A real, scannable QR code drawn as SVG modules, using lean-qr like the go-remote CLI does. It encodes the
 * project page, never a pairing link. The modules settle in from the finder patterns outwards.
 */
import React, { useMemo } from "react";
import { generate } from "lean-qr";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { seeded, springAt } from "../lib/anim";

export const PROJECT_URL = "https://github.com/drluckyspin/go-remote";

type Module = { x: number; y: number; delay: number };

export const QrCode: React.FC<{
  text?: string;
  size: number;
  start?: number;
  dark?: string;
  light?: string;
  padding?: number;
}> = ({ text = PROJECT_URL, size, start = 0, dark = "#111111", light = "#FFFFFF", padding = 4 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { count, modules } = useMemo(() => {
    const code = generate(text);
    const n = code.size;
    const list: Module[] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!code.get(x, y)) continue;
        const finder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
        const d = Math.hypot(x - n / 2, y - n / 2) / (n / 2);
        list.push({ x, y, delay: finder ? 0 : 4 + d * 14 + seeded(x * 131 + y * 17) * 8 });
      }
    }
    return { count: n, modules: list };
  }, [text]);

  const total = count + padding * 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges">
      <rect width={total} height={total} fill={light} />
      {modules.map((m) => {
        const p = springAt(frame, fps, start + m.delay, { damping: 18, stiffness: 180, mass: 0.6 });
        if (p <= 0.001) return null;
        const s = Math.min(1, p);
        const inset = (1 - s) / 2;
        return (
          <rect
            key={`${m.x}-${m.y}`}
            x={m.x + padding + inset}
            y={m.y + padding + inset}
            width={s + 0.02}
            height={s + 0.02}
            fill={dark}
            opacity={Math.min(1, p * 1.4)}
          />
        );
      })}
    </svg>
  );
};
