/**
 * The window go-remote opens on the laptop: Preview showing <project>.png, the QR code at scale 10 with a
 * four-module quiet zone, as cli/src/qr.ts writes it.
 */
import React from "react";
import { fonts } from "../theme";
import { QrCode } from "./QrCode";

export const QR_WINDOW = { w: 400, h: 452 };

export const QrWindow: React.FC<{ title: string; start: number; style?: React.CSSProperties }> = ({ title, start, style }) => (
  <div
    style={{
      position: "absolute",
      width: QR_WINDOW.w,
      height: QR_WINDOW.h,
      borderRadius: 12,
      overflow: "hidden",
      background: "#F5F5F7",
      boxShadow: "0 40px 90px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.14)",
      fontFamily: fonts.sans,
      ...style,
    }}
  >
    <div
      style={{
        height: 44,
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        gap: 8,
        background: "linear-gradient(180deg, #ECECEE, #E1E1E4)",
        borderBottom: "1px solid #CFCFD3",
        position: "relative",
      }}
    >
      {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
        <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
      ))}
      <span style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontSize: 13.5, fontWeight: 600, color: "#3A3A3C" }}>
        {title}
      </span>
    </div>
    <div style={{ display: "grid", placeItems: "center", height: QR_WINDOW.h - 44, background: "#FFFFFF" }}>
      <QrCode size={372} start={start} />
    </div>
  </div>
);
