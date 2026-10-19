/**
 * A MacBook Pro style laptop: lid, notch, display, hinge and base. The display is a plain box, so a scene
 * can put any screen inside it.
 */
import React from "react";
import { fonts } from "../theme";

export const LAPTOP = {
  w: 1320,
  h: 800,
  lidW: 1200,
  lidH: 764,
  bezel: 16,
  displayW: 1168,
  displayH: 728,
  /** Offset of the display's top-left corner from the laptop's top-left corner. */
  displayX: 76,
  displayY: 16,
};

export const Laptop: React.FC<{ children?: React.ReactNode; glow?: number; style?: React.CSSProperties }> = ({
  children,
  glow = 0,
  style,
}) => {
  const lidLeft = (LAPTOP.w - LAPTOP.lidW) / 2;
  return (
    <div style={{ position: "relative", width: LAPTOP.w, height: LAPTOP.h, ...style }}>
      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          bottom: -26,
          height: 60,
          borderRadius: "50%",
          background: "radial-gradient(closest-side, rgba(0,0,0,0.75), rgba(0,0,0,0))",
          filter: "blur(6px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: lidLeft - 60,
          top: -40,
          width: LAPTOP.lidW + 120,
          height: LAPTOP.lidH + 60,
          borderRadius: 80,
          background: `radial-gradient(closest-side, rgba(244,176,74,${0.16 * glow}), rgba(244,176,74,0))`,
          filter: "blur(30px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: lidLeft,
          top: 0,
          width: LAPTOP.lidW,
          height: LAPTOP.lidH,
          borderRadius: "30px 30px 12px 12px",
          background: "linear-gradient(180deg, #4A4D53 0%, #2A2C30 40%, #1D1E21 100%)",
          padding: 2,
          boxShadow: "0 40px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: "28px 28px 10px 10px",
            background: "#030304",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: LAPTOP.bezel - 2,
              top: LAPTOP.bezel - 2,
              width: LAPTOP.displayW,
              height: LAPTOP.displayH,
              borderRadius: "12px 12px 4px 4px",
              overflow: "hidden",
              background: "#0B0C0F",
              fontFamily: fonts.sans,
            }}
          >
            {children}
          </div>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: 190,
              height: 30,
              marginLeft: -95,
              background: "#030304",
              borderRadius: "0 0 14px 14px",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 89,
                top: 10,
                width: 11,
                height: 11,
                borderRadius: 6,
                background: "radial-gradient(circle at 40% 40%, #2B3546, #0A0C10 70%)",
              }}
            />
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(118deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0) 32%)",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: lidLeft + 30,
          top: LAPTOP.lidH,
          width: LAPTOP.lidW - 60,
          height: 8,
          background: "linear-gradient(180deg, #0E0F11, #2A2C30)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: LAPTOP.lidH + 6,
          width: LAPTOP.w,
          height: 26,
          borderRadius: "4px 4px 26px 26px",
          background: "linear-gradient(180deg, #5A5D63 0%, #3B3D42 35%, #232427 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 220,
            height: 9,
            marginLeft: -110,
            borderRadius: "0 0 10px 10px",
            background: "linear-gradient(180deg, #1F2023, #34363A)",
          }}
        />
      </div>
    </div>
  );
};

/** The macOS menu bar along the top of the display. */
export const MenuBar: React.FC<{ app: string; time: string }> = ({ app, time }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      right: 0,
      height: 28,
      display: "flex",
      alignItems: "center",
      gap: 22,
      padding: "0 18px",
      fontSize: 14,
      color: "rgba(255,255,255,0.88)",
      background: "rgba(20,21,24,0.72)",
      fontFamily: fonts.sans,
      zIndex: 5,
    }}
  >
    <span style={{ fontWeight: 700 }}>{app}</span>
    {["File", "Edit", "View", "Window", "Help"].map((item) => (
      <span key={item} style={{ opacity: 0.82 }}>
        {item}
      </span>
    ))}
    <span style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center", opacity: 0.9 }}>
      <WifiIcon />
      <BatteryIcon />
      <span>{time}</span>
    </span>
  </div>
);

const WifiIcon: React.FC = () => (
  <svg width={17} height={13} viewBox="0 0 17 13">
    <path d="M8.5 12.2 6 9.5a3.6 3.6 0 0 1 5 0Z" fill="currentColor" />
    <path d="M3.6 7.1a7 7 0 0 1 9.8 0" stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinecap="round" />
    <path d="M1.2 4.5a10.4 10.4 0 0 1 14.6 0" stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinecap="round" />
  </svg>
);

const BatteryIcon: React.FC = () => (
  <svg width={26} height={13} viewBox="0 0 26 13">
    <rect x={0.75} y={0.75} width={21.5} height={11.5} rx={3.2} stroke="currentColor" strokeWidth={1.2} fill="none" />
    <rect x={2.6} y={2.6} width={14} height={7.8} rx={1.8} fill="currentColor" />
    <rect x={23.4} y={4.3} width={1.8} height={4.4} rx={0.9} fill="currentColor" />
  </svg>
);

/** A macOS window with traffic lights and a centred title. */
export const MacWindow: React.FC<{
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  dark?: boolean;
  bodyStyle?: React.CSSProperties;
}> = ({ title, children, style, dark = true, bodyStyle }) => (
  <div
    style={{
      position: "absolute",
      borderRadius: 12,
      overflow: "hidden",
      background: dark ? "#0D0E11" : "#F4F4F5",
      boxShadow: "0 30px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.10)",
      display: "flex",
      flexDirection: "column",
      ...style,
    }}
  >
    <div
      style={{
        height: 34,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        background: dark ? "#1B1C20" : "#E9E9EB",
        borderBottom: dark ? "1px solid #000" : "1px solid #D3D3D6",
        position: "relative",
      }}
    >
      {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
        <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, marginRight: 8 }} />
      ))}
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 14,
          fontWeight: 600,
          color: dark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.6)",
          fontFamily: fonts.sans,
          pointerEvents: "none",
        }}
      >
        {title}
      </span>
    </div>
    <div style={{ position: "relative", flex: 1, overflow: "hidden", ...bodyStyle }}>{children}</div>
  </div>
);
