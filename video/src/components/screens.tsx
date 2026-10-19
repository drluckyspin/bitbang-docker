/**
 * The phone's screens, each 393 by 852 points: the camera finding the QR code, BitBang connecting, the herdr
 * chat and terminal, and the lock screen with an ntfy alert.
 */
import React from "react";
import { fonts, herdrDark, herdrLight } from "../theme";
import { BrowserBar, SCREEN } from "./Phone";
import { ChatMessages, Composer, HerdrHeader, HerdrTabs, KeyRow, HEADER_TOP, type ChatItem, type Tab } from "./herdr";
import { QrWindow, QR_WINDOW } from "./QrWindow";
import { TermLine, type Line } from "./term";

const fill: React.CSSProperties = { position: "absolute", inset: 0 };

export const HerdrChatScreen: React.FC<{
  frame: number;
  items: ChatItem[];
  title: string;
  composer: string;
  caret: boolean;
  scroll?: number;
  highlight?: { index: number; amount: number };
  glows?: number[];
  tabs?: Tab[];
  active?: number;
  mark?: React.ReactNode;
  agent?: string;
  model?: string;
  sendPressed?: number;
  /** herdr's approval card, docked above the composer; `promptGrow` (0 to 1) opens and closes it. */
  prompt?: React.ReactNode;
  promptGrow?: number;
  /** Drawn over the screen: a touch, for instance. */
  children?: React.ReactNode;
}> = ({ frame, items, title, composer, caret, scroll = 0, highlight, glows, tabs, active = 1, mark, agent, model, sendPressed, prompt, promptGrow = 1, children }) => (
  <div style={{ ...fill, background: herdrLight.bg }}>
    <BrowserBar />
    <HerdrHeader theme="light" title={title} view="chat" mark={mark} />
    <HerdrTabs theme="light" tabs={tabs ?? [{ label: "Repo Shell" }, { label: "Claude", live: true }]} active={active} />
    <div style={{ position: "absolute", left: 0, right: 0, top: HEADER_TOP + 91, bottom: 150, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ translate: `0 ${scroll}px` }}>
          <ChatMessages items={items} frame={frame} highlight={highlight} glows={glows} />
        </div>
      </div>
      {prompt && promptGrow > 0 ? (
        <div style={{ flex: "none", position: "relative", zIndex: 2, display: "grid", gridTemplateRows: `${Math.min(1, promptGrow)}fr`, opacity: Math.min(1, promptGrow * 1.6) }}>
          <div style={{ minHeight: 0, overflow: "hidden", padding: "0 12px" }}>
            <div style={{ padding: "6px 0 10px" }}>{prompt}</div>
          </div>
        </div>
      ) : null}
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 170, background: `linear-gradient(180deg, rgba(238,234,226,0), ${herdrLight.bg} 30%)` }} />
    <Composer text={composer} caret={caret} agent={agent} model={model} sendPressed={sendPressed} />
    {children}
  </div>
);

export const TERM_FONT = 11;
export const TERM_ROW = 17;

export const HerdrTerminalScreen: React.FC<{
  lines: Line[];
  title: string;
  tabs: Tab[];
  active: number;
  pressed?: string;
  pressAmount?: number;
  /** Shown below the lines, inside the terminal: a TUI dialog, for instance. */
  body?: React.ReactNode;
  /** Pins the output to the top, as a fresh terminal does, instead of to the bottom. */
  top?: boolean;
  mark?: React.ReactNode;
  fontSize?: number;
  rowHeight?: number;
}> = ({ lines, title, tabs, active, pressed, pressAmount, body, top = false, mark, fontSize = TERM_FONT, rowHeight = TERM_ROW }) => (
  <div style={{ ...fill, background: herdrDark.bg }}>
    <BrowserBar />
    <HerdrHeader theme="dark" title={title} view="terminal" mark={mark} />
    <HerdrTabs theme="dark" tabs={tabs} active={active} />
    <div
      style={{
        position: "absolute",
        left: 8,
        right: 6,
        top: HEADER_TOP + 98,
        bottom: 92,
        overflow: "hidden",
        fontFamily: fonts.mono,
        fontSize,
        color: herdrDark.text,
        display: "flex",
        flexDirection: "column",
        justifyContent: top ? "flex-start" : "flex-end",
      }}
    >
      {lines.map((l, i) => (
        <TermLine key={i} l={l} height={rowHeight} />
      ))}
      {body}
    </div>
    <KeyRow pressed={pressed} amount={pressAmount} />
  </div>
);

/** The iOS camera, pointed at the laptop: the QR window in the viewfinder, then the code detected. */
export const CameraScreen: React.FC<{ frame: number; lock: number; pill: number; tap: number; title: string }> = ({ frame, lock, pill, tap, title }) => {
  const shake = (1 - lock) * 1;
  const jx = Math.sin(frame * 0.9) * 5 * shake + Math.sin(frame * 0.37) * 3 * shake;
  const jy = Math.cos(frame * 0.7) * 4 * shake;
  const tilt = -4 + lock * 2;
  const qrScale = 0.56 + lock * 0.04;
  const finderTop = 116;
  const finderH = 524;
  const qrCx = SCREEN.w / 2;
  const qrCy = finderTop + finderH / 2 - 10;
  const bracket = 186 * (1.25 - 0.25 * lock);
  return (
    <div style={{ ...fill, background: "#000" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: finderTop, height: finderH, overflow: "hidden", background: "#0B0C10" }}>
        <div
          style={{
            position: "absolute",
            inset: -40,
            background: "radial-gradient(70% 60% at 50% 45%, #2A2E40 0%, #14161D 60%, #08090C 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: qrCx - (QR_WINDOW.w * qrScale) / 2 + jx,
            top: qrCy - (QR_WINDOW.h * qrScale) / 2 + jy - finderTop + 8,
            width: QR_WINDOW.w,
            height: QR_WINDOW.h,
            transformOrigin: "0 0",
            scale: String(qrScale),
            rotate: `${tilt}deg`,
            filter: `blur(${(1 - lock) * 1.2}px) brightness(0.92)`,
          }}
        >
          <QrWindow title={title} start={-200} style={{ left: 0, top: 0 }} />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 100% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />
      </div>
      {lock > 0.01 ? (
        <svg
          width={bracket}
          height={bracket}
          viewBox="0 0 100 100"
          style={{ position: "absolute", left: qrCx - bracket / 2, top: qrCy - bracket / 2 + 14, opacity: Math.min(1, lock * 1.6) }}
        >
          {["M2 24V8a6 6 0 0 1 6-6h16", "M76 2h16a6 6 0 0 1 6 6v16", "M98 76v16a6 6 0 0 1-6 6H76", "M24 98H8a6 6 0 0 1-6-6V76"].map((d) => (
            <path key={d} d={d} stroke="#FFD60A" strokeWidth={3.2} fill="none" strokeLinecap="round" />
          ))}
        </svg>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: qrCy + 128,
          translate: `-50% ${(1 - pill) * 12}px`,
          opacity: pill,
          scale: String(1 - tap * 0.06),
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          borderRadius: 18,
          background: "#FFD60A",
          color: "#1C1C1E",
          fontSize: 15,
          fontWeight: 600,
          boxShadow: tap ? `0 0 0 ${10 * tap}px rgba(255,214,10,${0.22 * tap})` : undefined,
        }}
      >
        <svg width={16} height={16} viewBox="0 0 16 16">
          <circle cx={8} cy={8} r={6.6} stroke="#1C1C1E" strokeWidth={1.4} fill="none" />
          <path d="M1.6 8h12.8M8 1.4c2 2 2 11.2 0 13.2M8 1.4c-2 2-2 11.2 0 13.2" stroke="#1C1C1E" strokeWidth={1.2} fill="none" />
        </svg>
        bitba.ng
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 664, display: "flex", justifyContent: "center", gap: 20, fontSize: 13, fontWeight: 600, letterSpacing: "0.04em", color: "rgba(255,255,255,0.75)" }}>
        <span>SLO-MO</span>
        <span>VIDEO</span>
        <span style={{ color: "#FFD60A" }}>PHOTO</span>
        <span>PORTRAIT</span>
        <span>PANO</span>
      </div>
      <div style={{ position: "absolute", left: (SCREEN.w - 76) / 2, top: 716, width: 76, height: 76, borderRadius: 38, border: "4px solid #FFF", display: "grid", placeItems: "center" }}>
        <div style={{ width: 62, height: 62, borderRadius: 31, background: "#FFF" }} />
      </div>
      <div style={{ position: "absolute", left: 38, top: 730, width: 48, height: 48, borderRadius: 10, background: "linear-gradient(135deg, #3A3F55, #1B1D26)", border: "1.5px solid rgba(255,255,255,0.3)" }} />
      <div style={{ position: "absolute", right: 38, top: 730, width: 48, height: 48, borderRadius: 24, background: "rgba(255,255,255,0.12)" }} />
    </div>
  );
};

/** BitBang connecting, then paired. */
export const ConnectScreen: React.FC<{ frame: number; paired: number }> = ({ frame, paired }) => {
  const spin = frame * 9;
  return (
    <div style={{ ...fill, background: "#0E0D0C" }}>
      <BrowserBar />
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div style={{ position: "relative", width: 96, height: 96 }}>
          <svg width={96} height={96} viewBox="0 0 96 96" style={{ position: "absolute", inset: 0, opacity: 1 - paired }}>
            <circle cx={48} cy={48} r={42} stroke="rgba(255,255,255,0.1)" strokeWidth={4} fill="none" />
            <circle cx={48} cy={48} r={42} stroke={herdrDark.accent} strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray="70 194" transform={`rotate(${spin} 48 48)`} />
          </svg>
          <svg width={96} height={96} viewBox="0 0 96 96" style={{ position: "absolute", inset: 0, opacity: paired, scale: String(0.7 + paired * 0.3) }}>
            <circle cx={48} cy={48} r={42} fill="#2F6317" />
            <path d="M31 49 43 61 66 36" stroke="#FFF" strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width={30} height={36} viewBox="0 0 30 36" style={{ position: "absolute", left: 33, top: 30, opacity: 1 - paired }}>
            <rect x={2} y={14} width={26} height={20} rx={5} fill="#F2EDE6" />
            <path d="M8 15V10a7 7 0 0 1 14 0v5" stroke="#F2EDE6" strokeWidth={3.4} fill="none" />
          </svg>
        </div>
        <div style={{ position: "relative", height: 28, width: 300, textAlign: "center", fontSize: 21, fontWeight: 600, color: "#F2EDE6" }}>
          <span style={{ position: "absolute", left: 0, right: 0, opacity: 1 - paired }}>Connecting…</span>
          <span style={{ position: "absolute", left: 0, right: 0, opacity: paired }}>Paired</span>
        </div>
        <div style={{ fontSize: 14, color: herdrDark.muted, textAlign: "center", lineHeight: 1.5 }}>
          End-to-end encrypted, peer to peer
          <br />
          go-remote-acme-api
        </div>
      </div>
    </div>
  );
};

export const NtfyMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <rect width={40} height={40} rx={9} fill="#338574" />
    <path d="M20 9.5c-4.3 0-7.2 3.1-7.2 7.3v5.2l-2.6 3.6h19.6l-2.6-3.6v-5.2c0-4.2-2.9-7.3-7.2-7.3Z" fill="#FFF" />
    <path d="M16.8 28.6a3.3 3.3 0 0 0 6.4 0" stroke="#FFF" strokeWidth={2.2} fill="none" strokeLinecap="round" />
  </svg>
);

export const LockScreen: React.FC<{ time: string; date: string; children?: React.ReactNode }> = ({ time, date, children }) => (
  <div style={{ ...fill, background: "linear-gradient(170deg, #1E2A4A 0%, #2A1F3D 45%, #4A2C2A 100%)" }}>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 45% at 60% 30%, rgba(244,176,74,0.22), rgba(244,176,74,0) 70%)" }} />
    <div style={{ position: "absolute", left: 0, right: 0, top: 92, textAlign: "center", color: "rgba(255,255,255,0.86)", fontSize: 19, fontWeight: 600 }}>{date}</div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 112, textAlign: "center", color: "rgba(255,255,255,0.94)", fontSize: 96, fontWeight: 700, letterSpacing: "-0.03em" }}>
      {time}
    </div>
    {children}
    {[34, SCREEN.w - 34 - 50].map((x) => (
      <div key={x} style={{ position: "absolute", left: x, bottom: 46, width: 50, height: 50, borderRadius: 25, background: "rgba(0,0,0,0.32)" }} />
    ))}
  </div>
);

export const IosNotification: React.FC<{ title: string; body: string; app: string; icon: React.ReactNode; style?: React.CSSProperties }> = ({
  title,
  body,
  app,
  icon,
  style,
}) => (
  <div
    style={{
      position: "absolute",
      left: 10,
      right: 10,
      padding: "13px 14px",
      borderRadius: 22,
      background: "rgba(245,245,247,0.78)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      display: "flex",
      gap: 11,
      alignItems: "flex-start",
      color: "#111",
      ...style,
    }}
  >
    <div style={{ width: 38, height: 38, flexShrink: 0 }}>{icon}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(0,0,0,0.5)" }}>
        <span style={{ textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 500 }}>{app}</span>
        <span>now</span>
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 600, marginTop: 1 }}>{title}</div>
      <div style={{ fontSize: 15, marginTop: 1, lineHeight: 1.3 }}>{body}</div>
    </div>
  </div>
);
