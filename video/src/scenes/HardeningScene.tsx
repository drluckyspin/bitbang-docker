/**
 * Scene 3: hold on the locked workspace while its constraints arrive, one a beat, beside the container. Then
 * the container steps aside for the QR window, and the chips dim so the code is the next thing to look at.
 */
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { W, Workspace } from "../components/Workspace";
import { cameraAt, type Cam } from "../lib/anim";
import { Camera } from "../lib/motion";
import { DURATIONS, SCENES, sinceHandoff } from "../timeline";
import { LaptopAt } from "./HandoffScene";

const END = DURATIONS.hardening - 1;
const SLIDE = W.slide - DURATIONS.handoff;
const keys: ReadonlyArray<readonly [number, Cam]> = [
  [0, { x: 985, y: 640, s: 1.3 }],
  [SLIDE, { x: 995, y: 645, s: 1.34 }],
  [END, { x: 1080, y: 645, s: 1.18 }],
];

export const hardeningCamera = (frame: number) => cameraAt(frame, keys);

export const HardeningScene: React.FC = () => {
  const frame = useCurrentFrame();
  const cam = hardeningCamera(frame);
  return (
    <AbsoluteFill>
      <Backdrop at={SCENES.hardening.from} />
      <Camera cam={cam} previous={hardeningCamera(frame - 1)}>
        <LaptopAt>
          <Sequence from={-sinceHandoff("hardening")} layout="none">
            <Workspace />
          </Sequence>
        </LaptopAt>
      </Camera>
    </AbsoluteFill>
  );
};
