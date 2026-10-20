/**
 * The teaser's sound: the bed and foley from scripts/make-audio.mjs, and Remotion's effects in
 * public/audio/sfx, each on the frame the picture cues it. The story reads with all of it muted.
 */
import React from "react";
import { Audio } from "@remotion/media";
import { interpolate, staticFile } from "remotion";
import { W } from "./components/Workspace";
import { T } from "./data/session";
import { clamp } from "./lib/anim";
import { NOTIFY } from "./scenes/FlowScene";
import { P } from "./scenes/PairScene";
import { LANDS, S } from "./scenes/SessionScene";
import { M } from "./scenes/MontageScene";
import { B } from "./scenes/BrandScene";
import { DONE_INDEX } from "./data/chat";
import { SCENES } from "./timeline";

type Cue = { name: string; src: string; at: number; volume: number; length?: number; trim?: number };

/** Scales the whole mix; at 1.5 the teaser sits near -18 LUFS, quiet beside speech but not lost. */
const MASTER = 1.5;

const sfx = (name: string) => staticFile(`audio/sfx/${name}.wav`);
const foley = (name: string) => staticFile(`audio/${name}.wav`);

const { handoff, pair, session, montage, local, brand } = {
  handoff: SCENES.handoff.from,
  pair: SCENES.pair.from,
  session: SCENES.session.from,
  montage: SCENES.montage.from,
  local: SCENES.local.from,
  brand: SCENES.brand.from,
};

const slide = (at: number): Cue => ({ name: "Slide", src: sfx("whip"), at, volume: 0.1 });

/** Each part of the conversation crossing to the phone, and landing there; the last is Claude's question. */
const flights: Cue[] = LANDS.flatMap((land, k) => {
  const hero = k === DONE_INDEX;
  return [
    { name: hero ? "Reply flies" : "Part flies", src: foley(hero ? "swoosh-long" : "swoosh-short"), at: session + (S.fly[k] ?? 0) - 2, volume: hero ? 0.3 : 0.12 },
    { name: hero ? "Reply lands" : "Part lands", src: hero ? sfx("ding") : foley("pop"), at: session + land, volume: hero ? 0.22 : 0.2 },
  ];
});

export const CUES: Cue[] = [
  { name: "Typing the prompt", src: foley("keys-laptop"), at: T.typePrompt, length: T.submitPrompt - T.typePrompt, volume: 0.3 },
  { name: "Return", src: foley("key-return"), at: T.submitPrompt, volume: 0.4 },
  { name: "Pull back", src: foley("swoosh-long"), at: 36, volume: 0.2 },
  { name: "Calendar alert", src: sfx("ding"), at: NOTIFY.at, volume: 0.22 },
  { name: "Push in on the alert", src: foley("swoosh-short"), at: NOTIFY.at + 6, volume: 0.14 },
  { name: "Whip back to Claude", src: sfx("whip"), at: NOTIFY.whip - 2, volume: 0.26 },
  { name: "Push in on the input", src: foley("swoosh-short"), at: T.typeSlash - 22, volume: 0.14 },
  { name: "Typing /go-remote", src: foley("keys-laptop"), at: T.typeSlash, length: T.enter - T.typeSlash, trim: 45, volume: 0.3 },
  { name: "Return", src: foley("key-return"), at: T.enter, volume: 0.4 },
  { name: "Pulse", src: foley("pulse"), at: T.enter, volume: 0.16 },
  { name: "Terminal shrinks", src: foley("swoosh-short"), at: handoff + W.shrink, volume: 0.14 },
  { name: "Session flies", src: foley("swoosh-long"), at: handoff + W.fly - 8, volume: 0.3 },
  { name: "Lock", src: sfx("mouse-click"), at: handoff + W.click, volume: 0.65 },
  { name: "Lock", src: sfx("switch"), at: handoff + W.click, volume: 0.3 },
  ...[0, 1, 2, 3].map((i): Cue => ({ name: "Chip", src: foley("pop"), at: handoff + W.chips + i * W.chipEvery, volume: 0.12 })),
  { name: "QR window", src: sfx("switch"), at: handoff + W.qr, volume: 0.2 },
  { name: "Phone rises", src: foley("swoosh-long"), at: pair + 4, volume: 0.24 },
  { name: "Code found", src: sfx("switch"), at: pair + P.lock, volume: 0.28 },
  { name: "Tap", src: sfx("mouse-click"), at: pair + P.tap, volume: 0.42 },
  { name: "Link", src: foley("swoosh-short"), at: pair + P.beam, volume: 0.14 },
  { name: "Paired", src: sfx("ding"), at: pair + P.paired, volume: 0.24 },
  { name: "Panel lifts", src: foley("swoosh-short"), at: session, volume: 0.14 },
  ...flights,
  { name: "Phone comes forward", src: foley("swoosh-long"), at: session + S.zoom - 4, volume: 0.16 },
  { name: "Typing on the phone", src: foley("keys-phone"), at: session + S.type, length: S.send - S.type, volume: 0.5 },
  { name: "Send", src: sfx("mouse-click"), at: session + S.send, volume: 0.38 },
  { name: "Buzz", src: foley("buzz"), at: montage + 10, volume: 0.28 },
  { name: "Alert", src: sfx("ding"), at: montage + 10, volume: 0.18 },
  slide(montage + M.approve),
  { name: "Approval card", src: sfx("switch"), at: montage + M.approve + 6, volume: 0.2 },
  { name: "Tap Yes", src: sfx("mouse-click"), at: montage + M.tap, volume: 0.45 },
  slide(montage + M.shell),
  { name: "Typing npm test", src: foley("keys-phone"), at: montage + M.shellType, length: 8, trim: 50, volume: 0.45 },
  slide(montage + M.agents),
  slide(montage + M.codex),
  slide(montage + M.cursor),
  { name: "Pull back", src: foley("swoosh-long"), at: local, volume: 0.28 },
  { name: "Glint", src: sfx("ding"), at: brand + B.glint + 12, volume: 0.1 },
];

export const Sound: React.FC = () => (
  <>
    <Audio name="Soundtrack" src={staticFile("audio/soundtrack.wav")} volume={0.42 * MASTER} />
    {CUES.map((c) => {
      const level = Math.min(1, c.volume * MASTER);
      return (
        <Audio
          key={`${c.name}-${c.at}-${c.src}`}
          name={c.name}
          src={c.src}
          from={c.at}
          durationInFrames={c.length}
          trimBefore={c.trim}
          volume={c.length ? (f) => level * interpolate(f, [(c.length ?? 0) - 3, c.length ?? 0], [1, 0], clamp) : level}
        />
      );
    })}
  </>
);
