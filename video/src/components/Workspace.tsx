/**
 * The laptop's display from the moment Claude Code exits: the terminal shrinks to a window, the session
 * flies into the go-remote container, the container locks, and the QR code window opens. Its clock is the
 * handoff scene's frame; later scenes shift it with a <Sequence from={-n}>.
 */
import React from "react";
import { Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { fonts } from "../theme";
import { PROJECT, SESSION } from "../data/session";
import { DURATIONS } from "../timeline";
import { ease, mix, progress, springAt } from "../lib/anim";
import { MotionBlur } from "../lib/motion";
import { CONTAINER_AT, CONTAINER_BOX, Container, Padlock } from "./Container";
import { Chip } from "./Connection";
import { DesktopFrame, MAXIMISED, TerminalWindow } from "./Desktop";
import { ClaudeMark } from "./herdr";
import { QR_WINDOW, QrWindow } from "./QrWindow";

/**
 * Where things sit on the 1168 by 728 display. The hardening scene owns the large chips; the settled container
 * leaves it clear for the QR window and the repo folder.
 */
export const WS = {
  terminal: { x: 28, y: 420, scale: 0.4 },
  container: { x: 790, y: 410 },
  settled: { x: 660, y: 470, scale: 0.8 },
  qr: { x: 960, y: 404, scale: 0.8 },
  folder: { x: 1000, y: 430 },
  chips: { x: 24, y: 230, gap: 84, scale: 1.7 },
};

export const W = {
  shrink: 6,
  build: 20,
  lift: 34,
  fly: 44,
  land: 80,
  lid: 84,
  lock: 96,
  click: 112,
  /** The terminal leaves for the Dock as the lock clicks, which clears the left side for the hardening scene. */
  minimise: 112,
  chips: DURATIONS.handoff + 22,
  slide: 146,
  qr: DURATIONS.handoff + 125,
  /** Just after the phone pairs, which is 86 frames into the pair scene. */
  qrClose: DURATIONS.handoff + DURATIONS.hardening + 95,
};

/** Where the container is, and its scale, at a frame of the handoff scene. */
export const containerAt = (frame: number) => {
  const t = progress(frame, W.slide, 30, ease.inOut);
  return { x: mix(WS.container.x, WS.settled.x, t), y: mix(WS.container.y, WS.settled.y, t), s: mix(1, WS.settled.scale, t) };
};

const CHIPS = ["Sees only this repo", "No open ports", "Read-only, never root", "Runs on your laptop"];

const FolderIcon: React.FC = () => (
  <svg width={108} height={86} viewBox="0 0 108 86">
    <defs>
      <linearGradient id="folderBack" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5EAEF0" />
        <stop offset="1" stopColor="#3D8BD6" />
      </linearGradient>
      <linearGradient id="folderFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8FCBFA" />
        <stop offset="1" stopColor="#5BAAEE" />
      </linearGradient>
    </defs>
    <path d="M4 12a6 6 0 0 1 6-6h26l8 8h54a6 6 0 0 1 6 6v58a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6Z" fill="url(#folderBack)" />
    <rect x={4} y={24} width={100} height={58} rx={6} fill="url(#folderFront)" />
    <path d="M40 46h28M40 56h20" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" />
  </svg>
);

const SessionCard: React.FC = () => (
  <div
    style={{
      width: 300,
      height: 128,
      borderRadius: 16,
      padding: "16px 18px",
      boxSizing: "border-box",
      background: "linear-gradient(160deg, #241B14, #120E0B)",
      border: "1px solid rgba(244,176,74,0.55)",
      boxShadow: "0 24px 60px rgba(0,0,0,0.55), 0 0 40px rgba(244,176,74,0.25)",
      fontFamily: fonts.sans,
      color: "#F5EDE3",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17, fontWeight: 600 }}>
      <ClaudeMark size={22} />
      Claude Code session
    </div>
    <div style={{ marginTop: 6, fontFamily: fonts.mono, fontSize: 13, color: "rgba(245,237,227,0.6)" }}>claude:{SESSION.slice(0, 8)} · acme-api</div>
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      {[0.92, 0.7, 0.8].map((w, i) => (
        <div key={i} style={{ height: 5, width: `${w * 100}%`, borderRadius: 3, background: `rgba(245,237,227,${0.35 - i * 0.08})` }} />
      ))}
    </div>
  </div>
);

const cardAt = (frame: number) => {
  const start = { x: WS.terminal.x + 234, y: WS.terminal.y + 140 };
  const end = { x: WS.container.x + CONTAINER_AT.top.x, y: WS.container.y + CONTAINER_AT.top.y };
  const ctrl = { x: 520, y: 150 };
  const t = progress(frame, W.fly, W.land - W.fly, ease.inOut);
  const lift = progress(frame, W.lift, 10, ease.out);
  const x = (1 - t) ** 2 * start.x + 2 * (1 - t) * t * ctrl.x + t ** 2 * end.x;
  const y = (1 - t) ** 2 * start.y + 2 * (1 - t) * t * ctrl.y + t ** 2 * end.y - lift * 16 * (1 - t);
  const scale = mix(0.8 + lift * 0.2, 0.42, t);
  return { x, y, scale, t, lift };
};

/** `time` is the menu bar clock, which has to agree with the phone whenever both are on screen. */
export const Workspace: React.FC<{ time?: string; hardening?: boolean }> = ({ time = "9:41", hardening = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const shrink = progress(frame, W.shrink, 34, ease.inOut);
  const mini = progress(frame, W.minimise, 24, ease.in);
  const termScale = mix(mix(1, WS.terminal.scale, shrink), 0.06, mini);
  const termX = mix(mix(MAXIMISED.x, WS.terminal.x, shrink), 560, mini);
  const termY = mix(mix(MAXIMISED.y, WS.terminal.y, shrink), 716, mini);
  const c = containerAt(frame);

  const build = progress(frame, W.build, 36, ease.inOut);
  const walls = progress(frame, W.build + 16, 24);
  const inside = progress(frame, W.land - 2, 10);
  const lid = springAt(frame, fps, W.lid, { damping: 14, stiffness: 160 });
  const lockIn = springAt(frame, fps, W.lock, { damping: 14 });
  const closed = springAt(frame, fps, W.click, { damping: 9, stiffness: 260, mass: 0.6 });
  const secure = progress(frame, W.click, 20);
  const ring = progress(frame, W.click, 36, ease.out);

  const card = cardAt(frame);
  const prev = cardAt(frame - 1);
  const cardOpacity = frame < W.lift ? 0 : Math.min(progress(frame, W.lift, 6), 1 - progress(frame, W.land - 4, 8));

  const qrIn = springAt(frame, fps, W.qr, { damping: 15, stiffness: 150 });
  const qrOut = progress(frame, W.qrClose, 14, ease.in);
  const qrVisible = frame >= W.qr && qrOut < 1;

  const folderIn = springAt(frame, fps, W.qrClose + 8, { damping: 16 });
  const lockX = c.x + CONTAINER_AT.lock.x * c.s;
  const lockY = c.y + CONTAINER_AT.lock.y * c.s;

  return (
    <DesktopFrame time={time}>
      {mini < 1 ? (
        <div
          style={{
            position: "absolute",
            left: termX,
            top: termY,
            width: MAXIMISED.w,
            height: MAXIMISED.h,
            transformOrigin: "0 0",
            scale: String(termScale),
            opacity: 1 - mini,
          }}
        >
          <Sequence from={-DURATIONS.flow} layout="none">
            <TerminalWindow rect={{ x: 0, y: 0, w: MAXIMISED.w, h: MAXIMISED.h }} radius={shrink > 0 ? 18 : 0} />
          </Sequence>
        </div>
      ) : null}

      {folderIn > 0.01 ? (
        <div
          style={{
            position: "absolute",
            left: WS.folder.x - 70,
            top: WS.folder.y - 60,
            width: 140,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            opacity: Math.min(1, folderIn * 1.4),
            scale: String(0.8 + 0.2 * folderIn),
          }}
        >
          <FolderIcon />
          <span style={{ fontFamily: fonts.sans, fontSize: 17, fontWeight: 600, color: "#F5F5F7" }}>acme-api</span>
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: c.x - CONTAINER_BOX.w / 2,
          top: c.y - CONTAINER_BOX.h / 2,
          scale: String(c.s),
          opacity: build > 0 ? 1 : 0,
        }}
      >
        <Container build={build} walls={walls} inside={inside} lid={Math.min(1, lid)} secure={secure} label={PROJECT} />
      </div>

      {ring > 0 && ring < 1 ? (
        <div
          style={{
            position: "absolute",
            left: lockX,
            top: lockY,
            width: 0,
            height: 0,
          }}
        >
          {[0, 0.18].map((delay) => {
            const r = Math.max(0, ring - delay) / (1 - delay);
            return (
              <div
                key={delay}
                style={{
                  position: "absolute",
                  left: -40 - r * 140,
                  top: -40 - r * 140,
                  width: 80 + r * 280,
                  height: 80 + r * 280,
                  borderRadius: "50%",
                  border: `2px solid rgba(125,226,195,${0.7 * (1 - r)})`,
                }}
              />
            );
          })}
        </div>
      ) : null}

      {frame >= W.lock ? (
        <div
          style={{
            position: "absolute",
            left: lockX - 42,
            top: lockY - 73,
            opacity: Math.min(1, lockIn * 1.4),
            scale: String((0.6 + 0.4 * lockIn) * c.s),
          }}
        >
          <Padlock size={84} closed={frame >= W.click ? closed : 0} glow={secure} />
        </div>
      ) : null}

      {hardening
        ? CHIPS.map((text, i) => {
        const p = progress(frame, W.chips + i * 6, 14);
        return (
          <Chip key={text} progress={p} style={{ left: WS.chips.x, top: WS.chips.y + i * WS.chips.gap, scale: String(WS.chips.scale), transformOrigin: "0 0" }}>
            {text}
          </Chip>
        );
          })
        : null}

      {cardOpacity > 0 ? (
        <MotionBlur dx={(card.x - prev.x) * 1.4} dy={(card.y - prev.y) * 1.4}>
          <div
            style={{
              position: "absolute",
              left: card.x - 150,
              top: card.y - 64,
              scale: String(card.scale),
              rotate: `${Math.sin(card.t * Math.PI) * -8}deg`,
              opacity: cardOpacity,
            }}
          >
            <SessionCard />
          </div>
        </MotionBlur>
      ) : null}

      {inside > 0 && inside < 1 ? (
        <div
          style={{
            position: "absolute",
            left: WS.container.x - 160,
            top: WS.container.y - 200,
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: `radial-gradient(closest-side, rgba(255,217,163,${0.55 * Math.sin(inside * Math.PI)}), rgba(244,176,74,0))`,
          }}
        />
      ) : null}

      {qrVisible ? (
        <QrWindow
          title={`${PROJECT}.png`}
          start={W.qr + 6}
          style={{
            left: WS.qr.x - QR_WINDOW.w / 2,
            top: WS.qr.y - QR_WINDOW.h / 2,
            opacity: Math.min(1, qrIn * 1.5) * (1 - qrOut),
            scale: String(WS.qr.scale * (0.86 + 0.14 * qrIn) * (1 - qrOut * 0.12)),
          }}
        />
      ) : null}
    </DesktopFrame>
  );
};
