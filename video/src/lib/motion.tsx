/**
 * Camera and directional motion blur. The blur is an SVG Gaussian stretched along the direction of travel,
 * sized from how far something moved since the previous frame, so it renders the same in the Studio and in
 * a render.
 */
import React, { useId } from "react";
import { AbsoluteFill } from "remotion";
import type { Cam } from "./anim";

const SHUTTER = 0.18;
const MAX_BLUR = 36;

export const MotionBlur: React.FC<{
  dx: number;
  dy: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ dx, dy, children, style }) => {
  const id = `mb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const sx = Math.min(MAX_BLUR, Math.abs(dx) * SHUTTER);
  const sy = Math.min(MAX_BLUR, Math.abs(dy) * SHUTTER);
  const active = sx > 0.35 || sy > 0.35;
  return (
    <div style={{ position: "absolute", inset: 0, ...style, filter: active ? `url(#${id})` : undefined }}>
      {active ? (
        <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
          <defs>
            <filter id={id} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={`${sx.toFixed(2)} ${sy.toFixed(2)}`} />
            </filter>
          </defs>
        </svg>
      ) : null}
      {children}
    </div>
  );
};

/** Places the world (a 1920 by 1080 plane by default) under a camera that looks at (x, y) with zoom s. */
export const Camera: React.FC<{
  cam: Cam;
  previous?: Cam;
  width?: number;
  height?: number;
  children: React.ReactNode;
}> = ({ cam, previous, width = 1920, height = 1080, children }) => {
  const world = (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
        transformOrigin: "0 0",
        transform: `translate(${width / 2}px, ${height / 2}px) scale(${cam.s}) translate(${-cam.x}px, ${-cam.y}px)`,
      }}
    >
      {children}
    </div>
  );
  if (!previous) return <AbsoluteFill>{world}</AbsoluteFill>;
  const dx = (previous.x - cam.x) * cam.s;
  const dy = (previous.y - cam.y) * cam.s;
  const zoom = Math.abs(cam.s - previous.s) * 320;
  return (
    <AbsoluteFill>
      <MotionBlur dx={Math.hypot(dx, zoom)} dy={Math.hypot(dy, zoom * 0.6)}>
        {world}
      </MotionBlur>
    </AbsoluteFill>
  );
};

/** Absolutely positions a child of known size so that its centre sits at (x, y). */
export const Place: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  scale?: number;
  rotate?: number;
  opacity?: number;
  z?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ x, y, w, h, scale = 1, rotate = 0, opacity = 1, z, children, style }) => (
  <div
    style={{
      position: "absolute",
      left: x - w / 2,
      top: y - h / 2,
      width: w,
      height: h,
      scale: String(scale),
      rotate: `${rotate}deg`,
      opacity,
      zIndex: z,
      ...style,
    }}
  >
    {children}
  </div>
);
