/**
 * The 45-second teaser: seven scenes in a row, the captions over them, film grain, and the sound. Scene
 * framing lives in layout.ts and timing in timeline.ts, so a 9:16 cut can swap those and keep the scenes.
 */
import React from "react";
import { AbsoluteFill, Series, useVideoConfig } from "remotion";
import { Grain } from "./components/Backdrop";
import { Caption } from "./components/Caption";
import { FlowScene } from "./scenes/FlowScene";
import { HandoffScene } from "./scenes/HandoffScene";
import { PairScene } from "./scenes/PairScene";
import { SessionScene } from "./scenes/SessionScene";
import { MontageScene } from "./scenes/MontageScene";
import { LocalScene } from "./scenes/LocalScene";
import { BrandScene } from "./scenes/BrandScene";
import { Sound } from "./Sound";
import { CAPTIONS, SCENES } from "./timeline";
import { stage } from "./theme";

const SEQUENCE: ReadonlyArray<{ id: keyof typeof SCENES; name: string; Scene: React.FC }> = [
  { id: "flow", name: "In the flow", Scene: FlowScene },
  { id: "handoff", name: "Into the container", Scene: HandoffScene },
  { id: "pair", name: "Scan and pair", Scene: PairScene },
  { id: "session", name: "Same session", Scene: SessionScene },
  { id: "montage", name: "From your phone", Scene: MontageScene },
  { id: "local", name: "Stays local", Scene: LocalScene },
  { id: "brand", name: "Brand", Scene: BrandScene },
];

export const GoRemoteTeaser: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: stage.bg }}>
      <Series>
        {SEQUENCE.map(({ id, name, Scene }) => (
          <Series.Sequence key={id} name={name} durationInFrames={SCENES[id].duration} premountFor={fps}>
            <Scene />
          </Series.Sequence>
        ))}
      </Series>
      {CAPTIONS.map((c) => (
        <Caption
          key={c.text}
          name={c.text}
          from={c.from}
          durationInFrames={c.to - c.from}
          text={c.text}
          exitAt={c.to - c.from - 16}
          fontSize={c.fontSize ?? 104}
          color={stage.ink}
          align={c.align}
          style={c.style}
        />
      ))}
      <Grain />
      <Sound />
    </AbsoluteFill>
  );
};
