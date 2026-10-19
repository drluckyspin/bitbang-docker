/**
 * A macOS notification banner, sliding in from the right edge of the display.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { fonts } from "../theme";
import { progress, springAt } from "../lib/anim";

export const MacNotification: React.FC<{
  at: number;
  until: number;
  title: string;
  body: string;
  appIcon: React.ReactNode;
  time?: string;
  style?: React.CSSProperties;
}> = ({ at, until, title, body, appIcon, time = "now", style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = springAt(frame, fps, at, { damping: 16, stiffness: 140 });
  const exit = progress(frame, until, 14);
  if (frame < at || exit >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        width: 430,
        padding: "14px 16px",
        borderRadius: 18,
        display: "flex",
        gap: 14,
        alignItems: "center",
        background: "rgba(48,48,52,0.88)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.12)",
        backdropFilter: "blur(20px)",
        fontFamily: fonts.sans,
        color: "#F2F2F4",
        translate: `${(1 - enter) * 480 + exit * 480}px 0`,
        opacity: Math.min(1, enter * 1.5) * (1 - exit),
        zIndex: 20,
        ...style,
      }}
    >
      <div style={{ width: 44, height: 44, flexShrink: 0 }}>{appIcon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700 }}>
          <span>{title}</span>
          <span style={{ fontWeight: 400, fontSize: 14, opacity: 0.6 }}>{time}</span>
        </div>
        <div style={{ fontSize: 15, marginTop: 3, opacity: 0.86 }}>{body}</div>
      </div>
    </div>
  );
};

export const CalendarIcon: React.FC<{ day?: string }> = ({ day = "19" }) => (
  <svg width={44} height={44} viewBox="0 0 44 44">
    <rect width={44} height={44} rx={10} fill="#FFFFFF" />
    <path d="M0 10a10 10 0 0 1 10-10h24a10 10 0 0 1 10 10v4H0Z" fill="#F2453D" />
    <text x={22} y={10.5} textAnchor="middle" fontSize={8} fontWeight={700} fill="#FFFFFF" fontFamily={fonts.sans}>
      OCT
    </text>
    <text x={22} y={36} textAnchor="middle" fontSize={21} fontWeight={600} fill="#1C1C1E" fontFamily={fonts.sans}>
      {day}
    </text>
  </svg>
);
