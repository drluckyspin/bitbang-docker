/**
 * An iPhone 15 Pro style phone: titanium frame, Dynamic Island, status bar and home indicator. The screen is
 * laid out in iOS points (393 by 852), so screens can be designed against the real device.
 */
import React from "react";
import { fonts } from "../theme";
import { MotionBlur } from "../lib/motion";

export const SCREEN = { w: 393, h: 852, radius: 55 };
const RIM = 14;
export const PHONE = { w: SCREEN.w + RIM * 2, h: SCREEN.h + RIM * 2 };

export const Phone: React.FC<{
  children: React.ReactNode;
  statusBar?: "light" | "dark" | "none";
  time?: string;
  homeIndicator?: "light" | "dark" | "none";
  style?: React.CSSProperties;
}> = ({ children, statusBar = "dark", time = "9:41", homeIndicator = "dark", style }) => (
  <div style={{ position: "relative", width: PHONE.w, height: PHONE.h, ...style }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: SCREEN.radius + RIM,
        background: "linear-gradient(145deg, #8E9097 0%, #3E4046 22%, #1B1C1F 50%, #45474D 78%, #9A9CA3 100%)",
        boxShadow: "0 50px 90px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.6)",
      }}
    />
    <div style={{ position: "absolute", inset: 2.5, borderRadius: SCREEN.radius + RIM - 2.5, background: "#050506" }} />
    {[
      { top: 180, h: 34, left: -3 },
      { top: 236, h: 62, left: -3 },
      { top: 310, h: 62, left: -3 },
      { top: 262, h: 96, left: PHONE.w - 1 },
    ].map((b) => (
      <div
        key={`${b.top}-${b.left}`}
        style={{
          position: "absolute",
          left: b.left,
          top: b.top,
          width: 4,
          height: b.h,
          borderRadius: 2,
          background: "linear-gradient(90deg, #2B2C30, #8B8D93)",
        }}
      />
    ))}
    <div
      style={{
        position: "absolute",
        left: RIM,
        top: RIM,
        width: SCREEN.w,
        height: SCREEN.h,
        borderRadius: SCREEN.radius,
        overflow: "hidden",
        background: "#000",
        fontFamily: fonts.sans,
      }}
    >
      {children}
      {statusBar !== "none" ? <StatusBar tone={statusBar} time={time} /> : null}
      <div
        style={{
          position: "absolute",
          left: (SCREEN.w - 125) / 2,
          top: 11,
          width: 125,
          height: 37,
          borderRadius: 19,
          background: "#000",
          zIndex: 30,
        }}
      />
      {homeIndicator !== "none" ? (
        <div
          style={{
            position: "absolute",
            left: (SCREEN.w - 140) / 2,
            bottom: 8,
            width: 140,
            height: 5,
            borderRadius: 3,
            background: homeIndicator === "dark" ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)",
            zIndex: 30,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: SCREEN.radius,
          background: "linear-gradient(125deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 28%)",
          pointerEvents: "none",
          zIndex: 31,
        }}
      />
    </div>
  </div>
);

const StatusBar: React.FC<{ tone: "light" | "dark"; time: string }> = ({ tone, time }) => {
  const color = tone === "dark" ? "#000" : "#fff";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: 54,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 34px 0 46px",
        color,
        zIndex: 29,
        fontFamily: fonts.sans,
      }}
    >
      <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{time}</span>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <svg width={18} height={12} viewBox="0 0 18 12">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 4.8} y={8 - i * 2.6} width={3.2} height={4 + i * 2.6} rx={0.9} fill={color} />
          ))}
        </svg>
        <svg width={17} height={12} viewBox="0 0 17 12">
          <path d="M8.5 11.6 6 9a3.6 3.6 0 0 1 5 0Z" fill={color} />
          <path d="M3.4 6.4a7.2 7.2 0 0 1 10.2 0" stroke={color} strokeWidth={1.7} fill="none" strokeLinecap="round" />
          <path d="M1 3.8a10.6 10.6 0 0 1 15 0" stroke={color} strokeWidth={1.7} fill="none" strokeLinecap="round" />
        </svg>
        <svg width={27} height={13} viewBox="0 0 27 13">
          <rect x={0.6} y={0.6} width={22.8} height={11.8} rx={3.6} stroke={color} strokeOpacity={0.4} strokeWidth={1.1} fill="none" />
          <rect x={2.4} y={2.4} width={16.5} height={8.2} rx={2.1} fill={color} />
          <path d="M24.8 4.4a2.2 2.2 0 0 1 0 4.2Z" fill={color} fillOpacity={0.45} />
        </svg>
      </span>
    </div>
  );
};

export type PhonePose = { x: number; y: number; s: number; r: number };

/** Puts the phone's centre at (x, y) on screen, blurred along the way it is moving. */
export const PhoneAt: React.FC<{ pose: PhonePose; previous?: PhonePose; children: React.ReactNode }> = ({ pose, previous, children }) => {
  const dx = previous ? pose.x - previous.x : 0;
  const dy = previous ? pose.y - previous.y : 0;
  return (
    <MotionBlur dx={dx} dy={dy}>
      <div
        style={{
          position: "absolute",
          left: pose.x - PHONE.w / 2,
          top: pose.y - PHONE.h / 2,
          width: PHONE.w,
          height: PHONE.h,
          scale: String(pose.s),
          rotate: `${pose.r}deg`,
        }}
      >
        {children}
      </div>
    </MotionBlur>
  );
};

/** The browser's address bar the screenshots show at the top of the page: the BitBang link, never its query. */
export const BrowserBar: React.FC<{ host?: string }> = ({ host = "bitba.ng" }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: 104,
      background: "#1C1C1E",
      zIndex: 20,
    }}
  >
    <div
      style={{
        position: "absolute",
        left: 14,
        right: 14,
        top: 58,
        height: 38,
        borderRadius: 12,
        background: "#2C2C2E",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        color: "#F2F2F7",
        fontSize: 16,
        fontWeight: 500,
      }}
    >
      <svg width={11} height={14} viewBox="0 0 11 14">
        <rect x={0.5} y={5.8} width={10} height={7.7} rx={1.8} fill="#F2F2F7" />
        <path d="M2.6 6V4.1a2.9 2.9 0 0 1 5.8 0V6" stroke="#F2F2F7" strokeWidth={1.4} fill="none" />
      </svg>
      {host}
    </div>
  </div>
);
