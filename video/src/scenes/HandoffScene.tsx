/**
 * Scene 2: the turn ends and the session moves. Claude Code's window steps back, the session flies into the
 * go-remote container on the laptop, the container locks, and the QR code opens in a window.
 */
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, CaptionScrim } from "../components/Backdrop";
import { Laptop, LAPTOP } from "../components/Laptop";
import { Workspace } from "../components/Workspace";
import { Camera } from "../lib/motion";
import { cameraAt, clamp, type Cam } from "../lib/anim";
import { SCENES } from "../timeline";
import { HANDOFF_FROM, LAPTOP_AT } from "./FlowScene";

const keys: ReadonlyArray<readonly [number, Cam]> = [
  [0, HANDOFF_FROM],
  [34, { x: 960, y: 640, s: 1.3 }],
  [112, { x: 985, y: 640, s: 1.33 }],
  [149, { x: 985, y: 640, s: 1.3 }],
];

export const handoffCamera = (frame: number) => cameraAt(frame, keys);

export const LaptopAt: React.FC<{ children: React.ReactNode; glow?: number }> = ({ children, glow = 0.7 }) => (
  <div style={{ position: "absolute", left: LAPTOP_AT.x - LAPTOP.w / 2, top: LAPTOP_AT.y - LAPTOP.h / 2 }}>
    <Laptop glow={glow}>{children}</Laptop>
  </div>
);

export const HandoffScene: React.FC = () => {
  const frame = useCurrentFrame();
  const cam = handoffCamera(frame);
  const scrim = interpolate(cam.s, [1.1, 1.4], [0, 0.85], clamp);
  return (
    <AbsoluteFill>
      <Backdrop at={SCENES.handoff.from} />
      <Camera cam={cam} previous={handoffCamera(frame - 1)}>
        <LaptopAt>
          <Workspace />
        </LaptopAt>
      </Camera>
      <CaptionScrim opacity={scrim} />
    </AbsoluteFill>
  );
};
