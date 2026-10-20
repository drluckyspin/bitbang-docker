/**
 * Where each scene sits in the teaser, and the captions over them. The sound cues count from these starts,
 * so a scene can change length here and everything after it follows. The soundtrack's beats fall on frames
 * 15 + 20n, which is where the /go-remote Enter (255), the message landing on the phone and the brand land;
 * scripts/make-audio.mjs has the same grid.
 */
import type React from "react";

export const DURATIONS = { flow: 340, handoff: 150, hardening: 140, pair: 150, session: 285, montage: 310, local: 190, brand: 135 } as const;

type SceneId = keyof typeof DURATIONS;

const ORDER: SceneId[] = ["flow", "handoff", "hardening", "pair", "session", "montage", "local", "brand"];

export const SCENES = ORDER.reduce(
  (acc, id, i) => {
    const prev = ORDER[i - 1];
    const from = prev ? acc[prev].from + DURATIONS[prev] : 0;
    acc[id] = { from, duration: DURATIONS[id] };
    return acc;
  },
  {} as Record<SceneId, { from: number; duration: number }>,
);

export const TOTAL = ORDER.reduce((sum, id) => sum + DURATIONS[id], 0);

/** The Workspace's clock starts with the handoff; a later scene shifts it back by this much. */
export const sinceHandoff = (id: SceneId) => SCENES[id].from - SCENES.handoff.from;

export type CaptionCue = {
  text: string;
  from: number;
  to: number;
  fontSize?: number;
  align?: "center" | "left";
  style?: React.CSSProperties;
};

/** Captions in frames of the whole video. Each lifts away 16 frames before it ends. */
export const CAPTIONS: ReadonlyArray<CaptionCue> = [
  { text: "You're in the flow.", from: 12, to: 110 },
  { text: "But life doesn't wait.", from: 120, to: 218 },
  { text: "Take your agent with you.", from: 238, to: 315 },
  { text: "Locked in a container.\nOn your laptop.", from: 340, to: 490, fontSize: 86 },
  { text: "One scan. Encrypted end to end.", from: 665, to: 770, fontSize: 82 },
  { text: "Same session.\nSame context.", from: 940, to: 1040, fontSize: 78, align: "left", style: { top: 420, left: 90, right: "auto" } },
  { text: "Your files never leave your machine.", from: 1395, to: 1555, fontSize: 78 },
];
