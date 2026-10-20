/**
 * The README's "How it works" diagram, as a still: the phone, the WebRTC link, and the workspace container with
 * the five stages a request passes through. It carries its own dark card, so it reads the same on GitHub's light
 * and dark themes and in viewers that do not render Mermaid. make diagram renders it to ../docs/how-it-works.png.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { brand, fonts } from "./theme";

const look = {
  ink: "#EFFFFC",
  muted: "#9DB4B1",
  glass: "rgba(255,255,255,0.07)",
  glassLine: "rgba(155,230,220,0.28)",
  core: "rgba(13,235,184,0.16)",
  coreLine: "rgba(13,235,184,0.55)",
  mint: "#0DEBB8",
};

const CARD = { y: 184, w: 292, h: 160, gap: 46 };
const PHONE = { x: 52, w: 262 };
const LINK = 168;
const BOX = { x: PHONE.x + PHONE.w + LINK, y: 60, pad: 34, h: 352 };
const BOX_W = BOX.pad * 2 + 5 * CARD.w + 4 * CARD.gap;
const MID = CARD.y + CARD.h / 2;

export const HOW_IT_WORKS = { width: BOX.x + BOX_W + PHONE.x, height: BOX.y * 2 + BOX.h };

const stages = [
  { title: "bitbang serve", note: "the far end\nof the link" },
  { title: "go-remote-ingress", note: "adapts the app\nto BitBang" },
  { title: "herdr-web-ui", note: "the chat and\nterminal views" },
  { title: "Herdr", note: "one tab\nper agent" },
  { title: "Agents", note: "Claude Code\nCodex · Cursor", core: true },
];

const stageX = (index: number) => BOX.x + BOX.pad + index * (CARD.w + CARD.gap);

const Card: React.FC<{ x: number; w: number; title: string; note: string; core?: boolean }> = ({
  x,
  w,
  title,
  note,
  core,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: CARD.y,
      width: w,
      height: CARD.h,
      boxSizing: "border-box",
      borderRadius: 20,
      background: core ? `linear-gradient(160deg, ${look.core}, rgba(13,235,184,0.05))` : look.glass,
      border: `1.5px solid ${core ? look.coreLine : look.glassLine}`,
      boxShadow: core ? "0 0 40px rgba(13,235,184,0.2)" : "0 12px 32px rgba(0,0,0,0.28)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 12,
      textAlign: "center",
    }}
  >
    <div
      style={{ fontFamily: fonts.sans, fontWeight: 600, fontSize: 30, color: look.ink, whiteSpace: "nowrap" }}
    >
      {title}
    </div>
    <div
      style={{
        fontFamily: fonts.sans,
        fontSize: 22,
        lineHeight: 1.35,
        color: look.muted,
        whiteSpace: "pre-line",
      }}
    >
      {note}
    </div>
  </div>
);

const Arrow: React.FC<{ from: number; to: number; both?: boolean }> = ({ from, to, both }) => (
  <line
    x1={from}
    y1={MID}
    x2={to}
    y2={MID}
    stroke={brand.aqua}
    strokeWidth={2.5}
    strokeLinecap="round"
    markerEnd="url(#head)"
    markerStart={both ? "url(#tail)" : undefined}
  />
);

export const HowItWorks: React.FC = () => {
  const linkFrom = PHONE.x + PHONE.w + 14;
  const linkTo = stageX(0) - 14;
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          borderRadius: 32,
          overflow: "hidden",
          background: `radial-gradient(120% 140% at 30% 0%, #17322F 0%, ${brand.stage} 45%, ${brand.tealDeep} 100%)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: BOX.x,
            top: BOX.y,
            width: BOX_W,
            height: BOX.h,
            boxSizing: "border-box",
            borderRadius: 26,
            background: "linear-gradient(180deg, rgba(13,235,184,0.075), rgba(13,235,184,0.02))",
            border: `1.5px solid ${look.coreLine}`,
          }}
        >
          <div style={{ position: "absolute", left: BOX.pad, top: 34, display: "flex", alignItems: "baseline", gap: 20 }}>
            <span style={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 21, letterSpacing: 3, color: look.mint }}>
              WORKSPACE CONTAINER
            </span>
            <span style={{ fontFamily: fonts.sans, fontSize: 23, color: look.muted }}>
              one per repo · no published ports
            </span>
          </div>
        </div>

        <Card x={PHONE.x} w={PHONE.w} title="Phone" note={"a browser, paired\nby one scan"} core />
        {stages.map((stage, index) => <Card key={stage.title} x={stageX(index)} w={CARD.w} {...stage} />)}

        <svg width={HOW_IT_WORKS.width} height={HOW_IT_WORKS.height} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <marker id="head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={brand.aqua} />
            </marker>
            <marker id="tail" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 10 0 L 0 5 L 10 10 z" fill={brand.aqua} />
            </marker>
          </defs>
          <Arrow from={linkFrom} to={linkTo} both />
          {stages.slice(1).map((stage, index) => (
            <Arrow key={stage.title} from={stageX(index) + CARD.w + 9} to={stageX(index + 1) - 9} />
          ))}
        </svg>

        <div style={{ position: "absolute", left: linkFrom, width: linkTo - linkFrom, top: MID - 62, textAlign: "center" }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontWeight: 700,
              fontSize: 20,
              color: brand.tealDeep,
              background: brand.aqua,
              borderRadius: 999,
              padding: "6px 15px",
            }}
          >
            WebRTC
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            left: linkFrom,
            width: linkTo - linkFrom,
            top: MID + 24,
            textAlign: "center",
            fontFamily: fonts.sans,
            fontSize: 20,
            lineHeight: 1.35,
            color: look.muted,
            whiteSpace: "pre-line",
          }}
        >
          {"encrypted,\npeer to peer"}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
