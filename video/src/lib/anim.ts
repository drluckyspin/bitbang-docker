/**
 * Small timing helpers shared by every scene: eased progress, keyframed values, springs and typing.
 */
import { Easing, interpolate, spring, type SpringConfig } from "remotion";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.55, 0, 0.75, 0.2),
  soft: Easing.bezier(0.33, 1, 0.68, 1),
  camera: Easing.bezier(0.45, 0, 0.2, 1),
};

export const progress = (frame: number, start: number, duration: number, easing: (t: number) => number = ease.out) =>
  interpolate(frame, [start, start + duration], [0, 1], { ...clamp, easing });

export const springAt = (frame: number, fps: number, start: number, config: Partial<SpringConfig> = {}) =>
  spring({ frame: frame - start, fps, config: { damping: 200, ...config } });

export const mix = (from: number, to: number, t: number) => from + (to - from) * t;

/** A value keyframed as [frame, value] pairs, with one easing for every segment. */
export const track = (
  frame: number,
  keys: ReadonlyArray<readonly [number, number]>,
  easing: (t: number) => number = ease.inOut,
) =>
  interpolate(
    frame,
    keys.map((k) => k[0]),
    keys.map((k) => k[1]),
    { ...clamp, easing },
  );

/** Keyframes of an object of numbers, such as a pose, eased field by field. */
export const keyframed = <T extends Record<string, number>>(
  frame: number,
  keys: ReadonlyArray<readonly [number, T]>,
  easing: (t: number) => number = ease.camera,
): T => {
  const first = keys[0];
  if (!first) throw new Error("keyframed needs at least one key");
  const out: Record<string, number> = {};
  for (const field of Object.keys(first[1])) {
    out[field] = track(frame, keys.map(([f, v]) => [f, v[field] ?? 0] as const), easing);
  }
  return out as T;
};

export type Cam = { x: number; y: number; s: number };

export const cameraAt = (
  frame: number,
  keys: ReadonlyArray<readonly [number, Cam]>,
  easing: (t: number) => number = ease.camera,
): Cam => ({
  x: track(frame, keys.map(([f, c]) => [f, c.x] as const), easing),
  y: track(frame, keys.map(([f, c]) => [f, c.y] as const), easing),
  s: track(frame, keys.map(([f, c]) => [f, c.s] as const), easing),
});

/** The camera that shows world point (wx, wy) at screen point (sx, sy) with zoom s. */
export const frameOn = (wx: number, wy: number, sx: number, sy: number, s: number, w = 1920, h = 1080): Cam => ({
  x: wx - (sx - w / 2) / s,
  y: wy - (sy - h / 2) / s,
  s,
});

/** Characters typed by `frame`, with a slight human unevenness that is the same on every render. */
export const typedCount = (frame: number, start: number, total: number, charsPerFrame: number) => {
  if (frame < start) return 0;
  const t = frame - start;
  const wobble = Math.sin(t * 1.7) * 0.6 + Math.sin(t * 0.63) * 0.4;
  return Math.max(0, Math.min(total, Math.floor(t * charsPerFrame + wobble)));
};

/** Characters of `text` revealed by `frame` when it streams in word by word over `duration` frames. */
export const streamedCount = (text: string, frame: number, start: number, duration: number) => {
  if (frame < start) return 0;
  if (frame >= start + duration) return text.length;
  const ends: number[] = [];
  const re = /\S+\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ends.push(m.index + m[0].length);
  const shown = Math.floor(((frame - start) / duration) * ends.length);
  return shown <= 0 ? 0 : (ends[Math.min(shown, ends.length) - 1] ?? text.length);
};

/** Splits text into lines of at most `width` characters, breaking at spaces. */
export const wrap = (text: string, width: number): string[] => {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      if (line.length === 0) line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
      while (line.length > width) {
        out.push(line.slice(0, width));
        line = line.slice(width);
      }
    }
    out.push(line);
  }
  return out;
};

export const seeded = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
