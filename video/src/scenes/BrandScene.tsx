/**
 * Scene 7: the brand, in the icon's cool teal, which only this scene uses. The icon lands in the centre and
 * a glint crosses it, lighting the flare where the beam meets the phone; it slides aside for the wordmark,
 * the tagline settles in word by word under a faint echo of the link, and the frame fades to black.
 */
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { brand, fonts } from "../theme";
import { ease, progress, springAt } from "../lib/anim";
import { SCENES } from "../timeline";

export const TAGLINE = "Go Remote lets you seamlessly move your coding agent session to your phone, without moving any files to the cloud.";
const TAGLINE_ROWS = ["Go Remote lets you seamlessly move your coding agent session", "to your phone, without moving any files to the cloud."];

export const B = { mark: 4, glint: 12, word: 22, arc: 10, tagline: 34, pill: 62, fade: 121 };

/** How far right of its place in the lockup the icon lands, which centres it until the wordmark arrives. */
const CENTRED = 377;

const AQUA = (a: number) => `rgba(${brand.aquaRgb},${Math.max(0, a).toFixed(3)})`;
/** Where the beam meets the phone in the icon, as fractions of its width and height. */
const FLARE = { x: 0.725, y: 0.506 };

/** The Go Remote icon, cropped to its rounded square, with light that moves across it. */
export const BrandIcon: React.FC<{ size: number; glint: number; flare: number }> = ({ size, glint, flare }) => (
  <div style={{ position: "relative", width: size, height: size, borderRadius: size * 0.19, overflow: "hidden", isolation: "isolate" }}>
    <Img src={staticFile("brand/go-remote-icon.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", scale: "1.012" }} />
    {glint > 0 && glint < 1 ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          mixBlendMode: "screen",
          background: `linear-gradient(105deg, rgba(0,0,0,0) ${-30 + glint * 140}%, ${AQUA(0.32)} ${-15 + glint * 140}%, rgba(0,0,0,0) ${glint * 140}%)`,
        }}
      />
    ) : null}
    {flare > 0 ? (
      <div
        style={{
          position: "absolute",
          left: `${FLARE.x * 100}%`,
          top: `${FLARE.y * 100}%`,
          width: size * 0.5,
          height: size * 0.5,
          translate: "-50% -50%",
          borderRadius: "50%",
          mixBlendMode: "screen",
          opacity: flare,
          background: `radial-gradient(closest-side, rgba(236,255,250,0.95), ${AQUA(0.55)} 32%, ${AQUA(0)} 100%)`,
        }}
      />
    ) : null}
    <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 0 1px rgba(255,255,255,0.05)" }} />
  </div>
);

export const BrandScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = springAt(frame, fps, B.mark, { damping: 13, stiffness: 120 });
  const word = springAt(frame, fps, B.word, { damping: 20, stiffness: 110 });
  const slide = springAt(frame, fps, B.word - 2, { damping: 19, stiffness: 100 });
  const glint = progress(frame, B.glint, 20, ease.inOut);
  const hit = frame < B.glint + 12 ? 0 : Math.exp(-(frame - B.glint - 12) / 8);
  const flare = Math.min(1, progress(frame, B.mark + 4, 12) * (0.35 + 0.1 * Math.sin(frame / 7)) + hit * 0.8);
  const arc = progress(frame, B.arc, 50, ease.inOut);
  const pill = springAt(frame, fps, B.pill, { damping: 18 });
  const fade = progress(frame, B.fade, 14, ease.in);
  const drift = progress(frame, 0, 135, ease.soft);
  const teal = progress(frame, 0, 24, ease.inOut);
  let index = 0;

  return (
    <AbsoluteFill>
      <Backdrop at={SCENES.brand.from} warm={0.25} cool={0.4} teal={teal} />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="brandArc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={brand.aqua} stopOpacity={0} />
            <stop offset="0.35" stopColor="#4FA7A6" />
            <stop offset="0.7" stopColor={brand.aqua} />
            <stop offset="1" stopColor={brand.aqua} stopOpacity={0} />
          </linearGradient>
          <filter id="brandArcGlow">
            <feGaussianBlur stdDeviation={12} />
          </filter>
        </defs>
        {[0, 1].map((glow) => (
          <path
            key={glow}
            d="M 140 700 C 620 360, 1300 360, 1780 700"
            stroke="url(#brandArc)"
            strokeWidth={glow ? 18 : 2.2}
            fill="none"
            opacity={(glow ? 0.2 : 0.45) * (1 - fade)}
            filter={glow ? "url(#brandArcGlow)" : undefined}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - arc}
          />
        ))}
      </svg>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.sans,
          color: brand.ice,
          scale: String(1.02 - drift * 0.02),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 38, marginTop: -40, translate: `${(1 - slide) * CENTRED}px 0` }}>
          <div
            style={{
              opacity: Math.min(1, mark * 1.4),
              scale: String(0.6 + 0.4 * mark),
              rotate: `${(1 - mark) * -12}deg`,
              filter: `drop-shadow(0 18px 46px rgba(0,0,0,0.55)) drop-shadow(0 0 ${(30 + 30 * hit).toFixed(1)}px ${AQUA(0.18 + 0.25 * hit)})`,
            }}
          >
            <BrandIcon size={156} glint={glint} flare={flare} />
          </div>
          <div
            style={{
              fontFamily: fonts.display,
              fontSize: 132,
              fontWeight: 900,
              letterSpacing: "-0.055em",
              lineHeight: 1,
              opacity: Math.min(1, word * 1.3),
              translate: `${(1 - word) * -70}px 0`,
              filter: word < 0.98 ? `blur(${(1 - word) * 12}px)` : undefined,
              paddingBottom: 8,
            }}
          >
            Go Remote
          </div>
        </div>
        <div
          aria-label={TAGLINE}
          style={{
            marginTop: 54,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            fontSize: 42,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
            color: "rgba(226,244,245,0.84)",
          }}
        >
          {TAGLINE_ROWS.map((row) => (
            <div key={row} style={{ display: "flex", gap: "0.26em" }}>
              {row.split(" ").map((w) => {
                const p = springAt(frame, fps, B.tagline + index++ * 1.4, { damping: 22, stiffness: 120 });
                return (
                  <span key={w + index} style={{ display: "inline-block", opacity: p, translate: `0 ${(1 - p) * 16}px`, filter: p < 0.97 ? `blur(${(1 - p) * 8}px)` : undefined }}>
                    {w}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 56, display: "flex", alignItems: "center", gap: 26, opacity: pill, translate: `0 ${(1 - pill) * 14}px` }}>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 30,
              padding: "10px 22px",
              borderRadius: 12,
              background: AQUA(0.08),
              border: `1px solid ${AQUA(0.45)}`,
              color: brand.aqua,
            }}
          >
            /go-remote
          </div>
          <div style={{ fontSize: 36, fontWeight: 600, color: "rgba(226,244,245,0.78)", letterSpacing: "-0.015em" }}>github.com/drluckyspin/go-remote</div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: fade }} />
    </AbsoluteFill>
  );
};
