/**
 * Scene 6: the pull-back. The phone shrinks away from the montage, the laptop slides in beside it, and the
 * link joins them. The repo and the container stay inside the dashed outline of the Mac; nothing goes to a
 * cloud.
 */
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { getLength, getPointAtLength } from "@remotion/paths";
import { Backdrop } from "../components/Backdrop";
import { Badge, Beam, beamPath } from "../components/Connection";
import { CONTAINER_AT } from "../components/Container";
import { ClaudeMark } from "../components/herdr";
import { LAPTOP } from "../components/Laptop";
import { PHONE, Phone, PhoneAt, type PhonePose } from "../components/Phone";
import { HerdrChatScreen } from "../components/screens";
import { WS, Workspace } from "../components/Workspace";
import { phoneItems } from "../data/chat";
import { REPO } from "../data/session";
import { Camera } from "../lib/motion";
import { cameraAt, ease, keyframed, progress, springAt, type Cam } from "../lib/anim";
import { DISPLAY_ORIGIN, MONTAGE_PHONE, containerOnScreen, phoneLinkPoint, toScreen } from "../layout";
import { fonts, stage } from "../theme";
import { DURATIONS, SCENES, sinceHandoff } from "../timeline";
import { LAPTOP_AT } from "./FlowScene";
import { LaptopAt } from "./HandoffScene";
import { CursorScreen, MontageList, tabsFor } from "./MontageScene";

const END = DURATIONS.local - 1;

const camKeys: ReadonlyArray<readonly [number, Cam]> = [
  [0, { x: 2900, y: 600, s: 0.9 }],
  [50, { x: 1403, y: 532, s: 0.7 }],
  [END, { x: 1398, y: 530, s: 0.688 }],
];

export const LOCAL_PHONE: PhonePose = { x: 1536, y: 606, s: 0.7, r: 0 };
const phoneKeys: ReadonlyArray<readonly [number, PhonePose]> = [
  [0, MONTAGE_PHONE],
  [50, LOCAL_PHONE],
  [END, { ...LOCAL_PHONE, x: LOCAL_PHONE.x - 4, s: 0.69 }],
];

export const L = { beam: 12, outline: 44, badge: 50, labels: 54, cloud: 60, strike: 68, out: 88 };
const LIFT = 170;
const OUTLINE_PAD = 54;

const MacOutline: React.FC<{ cam: Cam; appear: number }> = ({ cam, appear }) => {
  const [x, y] = toScreen(cam, LAPTOP_AT.x - LAPTOP.w / 2 - OUTLINE_PAD, LAPTOP_AT.y - LAPTOP.h / 2 - OUTLINE_PAD);
  const w = (LAPTOP.w + OUTLINE_PAD * 2) * cam.s;
  const h = (LAPTOP.h + OUTLINE_PAD * 2) * cam.s;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, opacity: appear, scale: String(1.03 - 0.03 * appear) }}>
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <rect x={0} y={0} width={w} height={h} rx={34} fill="rgba(255,255,255,0.014)" stroke="rgba(245,245,247,0.3)" strokeWidth={1.6} strokeDasharray="9 9" />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 44,
          top: 0,
          translate: "0 -50%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "7px 16px 7px 12px",
          borderRadius: 999,
          background: "#101114",
          border: "1px solid rgba(245,245,247,0.16)",
          fontFamily: fonts.sans,
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: stage.ink,
        }}
      >
        <svg width={24} height={17} viewBox="0 0 24 17">
          <rect x={3.5} y={1} width={17} height={11.5} rx={1.6} stroke={stage.ink} strokeWidth={1.6} fill="none" />
          <path d="M1 15.2h22" stroke={stage.ink} strokeWidth={1.8} strokeLinecap="round" />
        </svg>
        Your Mac
      </div>
    </div>
  );
};

/** A small annotation under something on the laptop's screen. */
const Note: React.FC<{ x: number; y: number; appear: number; title: string; detail: string }> = ({ x, y, appear, title, detail }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      translate: `-50% ${(1 - appear) * 10}px`,
      opacity: appear,
      padding: "7px 14px",
      borderRadius: 10,
      background: "rgba(12,13,16,0.86)",
      border: "1px solid rgba(125,226,195,0.35)",
      fontFamily: fonts.sans,
      whiteSpace: "nowrap",
      textAlign: "center",
      lineHeight: 1.25,
    }}
  >
    <div style={{ fontSize: 17, fontWeight: 600, color: stage.ink }}>{title}</div>
    <div style={{ fontSize: 14, fontFamily: fonts.mono, color: "rgba(245,245,247,0.6)" }}>{detail}</div>
  </div>
);

const NoCloud: React.FC<{ x: number; y: number; appear: number; strike: number }> = ({ x, y, appear, strike }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      translate: `-50% calc(-50% + ${(1 - appear) * 14}px)`,
      opacity: appear,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
    }}
  >
    <svg width={104} height={66} viewBox="0 0 96 60" style={{ overflow: "visible" }}>
      <path
        d="M24 52H72A15 15 0 0 0 74 22A22 22 0 0 0 32 18A17 17 0 0 0 24 52Z"
        stroke="rgba(245,245,247,0.5)"
        strokeWidth={2.6}
        strokeLinejoin="round"
        fill="rgba(255,255,255,0.03)"
      />
      <path d="M12 8 86 56" stroke={stage.coral} strokeWidth={3.6} strokeLinecap="round" strokeDasharray={90} strokeDashoffset={90 * (1 - strike)} />
    </svg>
    <div style={{ fontFamily: fonts.sans, fontSize: 20, fontWeight: 500, color: "rgba(245,245,247,0.72)", whiteSpace: "nowrap" }}>No files in the cloud</div>
  </div>
);

export const LocalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cam = cameraAt(frame, camKeys);
  const pose = keyframed(frame, phoneKeys);
  const previous = keyframed(frame - 1, phoneKeys);

  const container = containerOnScreen(cam);
  const phoneEdge = phoneLinkPoint(pose);
  const d = beamPath(container, phoneEdge, LIFT);
  // Short of the crest, so the badge ends inside the Mac's outline rather than on it.
  const badgeAt = getPointAtLength(d, getLength(d) * 0.45) ?? { x: (container[0] + phoneEdge[0]) / 2, y: container[1] - LIFT };

  const listOut = progress(frame, 0, 14, ease.in);
  const toChat = progress(frame, 8, 10);
  const outline = springAt(frame, fps, L.outline, { damping: 18 });
  const out = progress(frame, L.out, 12, ease.in);

  const [folderX, folderY] = toScreen(cam, DISPLAY_ORIGIN.x + WS.folder.x, DISPLAY_ORIGIN.y + WS.folder.y + 84);
  const [boxX, boxY] = toScreen(
    cam,
    DISPLAY_ORIGIN.x + WS.settled.x + CONTAINER_AT.base.x * WS.settled.scale,
    DISPLAY_ORIGIN.y + WS.settled.y + CONTAINER_AT.base.y * WS.settled.scale + 14,
  );
  // The cloud keeps clear of the Mac's outline, so it plainly sits outside it: midway to the phone, above the link.
  const [macRight, macTop] = toScreen(cam, LAPTOP_AT.x + LAPTOP.w / 2 + OUTLINE_PAD, LAPTOP_AT.y - LAPTOP.h / 2 - OUTLINE_PAD);
  const cloudX = (macRight + pose.x - (PHONE.w / 2) * pose.s) / 2;

  return (
    <AbsoluteFill>
      <Backdrop at={SCENES.local.from} />
      <AbsoluteFill style={{ opacity: 1 - out, scale: String(1 - out * 0.03), filter: out > 0 ? `blur(${out * 8}px)` : undefined }}>
        <MontageList frame={DURATIONS.montage + frame} style={{ opacity: 1 - listOut, translate: `${-listOut * 60}px 0` }} />
        <MacOutline cam={cam} appear={outline} />
        <Camera cam={cam} previous={cameraAt(frame - 1, camKeys)}>
          <LaptopAt>
            <Sequence from={-sinceHandoff("local")} layout="none">
              <Workspace time="9:59" />
            </Sequence>
          </LaptopAt>
        </Camera>
        <Note x={boxX} y={boxY} appear={progress(frame, L.labels, 12)} title="Container" detail={`go-remote-${REPO}`} />
        <Note x={folderX} y={folderY} appear={progress(frame, L.labels + 6, 12)} title="Your repo" detail={`~/src/${REPO}`} />
        <Beam from={container} to={phoneEdge} lift={LIFT} draw={progress(frame, L.beam, 34, ease.inOut)} frame={frame + 480} />
        <Badge x={badgeAt.x} y={badgeAt.y - 4} progress={progress(frame, L.badge, 14)}>
          End-to-end encrypted
        </Badge>
        <NoCloud x={cloudX} y={macTop - 10} appear={progress(frame, L.cloud, 14)} strike={progress(frame, L.strike, 12, ease.inOut)} />
        <PhoneAt pose={pose} previous={previous}>
          <Phone statusBar="light" time="9:59">
            {toChat < 1 ? (
              <div style={{ position: "absolute", inset: 0, opacity: 1 - toChat }}>
                <CursorScreen frame={DURATIONS.montage + frame} />
              </div>
            ) : null}
            {toChat > 0 ? (
              <div style={{ position: "absolute", inset: 0, opacity: toChat }}>
                <HerdrChatScreen
                  frame={frame}
                  items={phoneItems(-100, -100, -100)}
                  title="Rate limit the upload API"
                  composer=""
                  caret={false}
                  tabs={tabsFor("claude")}
                  active={1}
                  mark={<ClaudeMark size={20} />}
                />
              </div>
            ) : null}
          </Phone>
        </PhoneAt>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
