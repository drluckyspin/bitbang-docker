/**
 * The stage: near-black charcoal with two slow pools of light, a vignette, and fine grain that keeps the
 * gradients from banding in the encode.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { brand, stage } from "../theme";

/**
 * `at` is the scene's first frame in the whole video, so the light keeps drifting smoothly across cuts.
 * `teal` washes the stage in the icon's petrol teal, which only the ending uses.
 */
export const Backdrop: React.FC<{ at: number; warm?: number; cool?: number; teal?: number }> = ({ at, warm = 1, cool = 1, teal = 0 }) => {
  const frame = useCurrentFrame() + at;
  const drift = Math.sin(frame / 90);
  return (
    <AbsoluteFill style={{ backgroundColor: stage.bg, overflow: "hidden" }}>
      {teal > 0 ? (
        <AbsoluteFill
          style={{
            opacity: teal,
            background: `radial-gradient(70% 80% at 50% ${44 + drift * 2}%, ${brand.stage}, ${brand.tealDeep} 58%, ${stage.bg} 100%)`,
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 70% at ${28 + drift * 4}% ${30 - drift * 3}%, rgba(244,176,74,${0.11 * warm}), rgba(244,176,74,0) 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(55% 65% at ${76 - drift * 3}% ${78 + drift * 2}%, rgba(108,184,255,${0.09 * cool}), rgba(108,184,255,0) 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.018) 0%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.25) 100%)",
        }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.7) 100%)" }} />
    </AbsoluteFill>
  );
};

export const Grain: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none", opacity: 0.07, mixBlendMode: "overlay" }}>
    <svg width="100%" height="100%">
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  </AbsoluteFill>
);

/** Darkens the top of the frame so a caption reads over busy screens. */
export const CaptionScrim: React.FC<{ opacity: number }> = ({ opacity }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      opacity,
      background: "linear-gradient(180deg, rgba(5,6,8,0.95) 0%, rgba(5,6,8,0.84) 14%, rgba(5,6,8,0.5) 22%, rgba(5,6,8,0) 34%)",
    }}
  />
);
