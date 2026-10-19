/**
 * Scene 1: deep in a Claude Code session. A prompt is typed, and Claude plans, reads, writes, edits and runs
 * the tests while the camera pulls back to the laptop. A calendar alert says it is time to go: the camera
 * reads it, then whips back to Claude, still working. When the turn ends the developer types /go-remote, the
 * command the video is about: everything else dims, Enter sends a ring out of the input box, and the command
 * rises into the transcript, where it stays lit, with the camera on it, while Claude runs it.
 */
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Laptop, LAPTOP } from "../components/Laptop";
import { DesktopFrame, MAXIMISED, TERM, TerminalWindow } from "../components/Desktop";
import { sentLineY, type Focus } from "../components/ClaudeCode";
import { CalendarIcon, MacNotification } from "../components/MacNotification";
import { Backdrop, CaptionScrim } from "../components/Backdrop";
import { laptopScript, T, says } from "../data/session";
import { DISPLAY_ORIGIN, toScreen } from "../layout";
import { DURATIONS } from "../timeline";
import { Camera } from "../lib/motion";
import { cameraAt, clamp, ease, frameOn, mix, progress, type Cam } from "../lib/anim";

export const LAPTOP_AT = { x: 960, y: 632 };
/** The calendar alert that sends the developer away from the desk: it lands, is read, and the camera leaves. */
export const NOTIFY = { at: 110, read: 140, whip: 172, until: 200 };

/** The left edge of the terminal's text, in world pixels. */
const TEXT_X = DISPLAY_ORIGIN.x + MAXIMISED.x + 22;

/**
 * World points the camera reads: the alert, the running tests, and the start of the input box's text, low
 * enough that the command can rise out of it without reaching the caption.
 */
const ON_ALERT = frameOn(1313, 326, 960, 612, 2.3);
const ON_WORK = frameOn(863, 700, 960, 600, 1.9);
const ON_INPUT = frameOn(TEXT_X, 816, 200, 600, 3);

const keys: ReadonlyArray<readonly [number, Cam]> = [
  [0, { x: 690, y: 468, s: 2.05 }],
  [30, { x: 700, y: 490, s: 1.98 }],
  [96, { x: 960, y: 612, s: 1.0 }],
  [NOTIFY.at, { x: 968, y: 600, s: 1.03 }],
  [NOTIFY.read, ON_ALERT],
  [NOTIFY.whip, { ...ON_ALERT, s: ON_ALERT.s * 1.03 }],
  [NOTIFY.whip + 10, ON_WORK],
  [T.done + 4, { ...ON_WORK, y: ON_WORK.y + 16, s: ON_WORK.s * 1.02 }],
  [T.typeSlash - 2, ON_INPUT],
  [T.enter, { ...ON_INPUT, s: ON_INPUT.s * 1.03 }],
];

/** A slight push on the camera as Enter lands. */
const punch = (frame: number) => (frame < T.enter ? 0 : Math.sin(Math.min(1, (frame - T.enter) / 8) * Math.PI) * 0.012);

/**
 * Once the command has risen, the camera follows its line up the window as Claude's work arrives under it,
 * and draws back until the line sits just under the caption, where the handoff picks it up. The line is
 * averaged over `lag` frames, so the camera eases after each scroll instead of jerking with it.
 */
const FOLLOW = { from: T.submitSlash + 6, to: 300, lag: 3 };
const SENT_ON = { sx: 312, sy: 420, s: 1.5 };
const TERMINAL = { cols: TERM.cols, lineHeight: TERM.lineHeight, height: MAXIMISED.h - TERM.title };

const sentY = (frame: number) => {
  let sum = 0;
  for (let k = 0; k < FOLLOW.lag; k++) sum += sentLineY(laptopScript, Math.max(T.submitSlash, frame - k), 30, TERMINAL) ?? 0;
  return DISPLAY_ORIGIN.y + MAXIMISED.y + TERM.title + sum / FOLLOW.lag;
};

const follow = (frame: number, tracked: number): Cam => {
  const start = cameraAt(FOLLOW.from, keys);
  const [sx, sy] = toScreen(start, TEXT_X, sentY(FOLLOW.from));
  const t = progress(frame, FOLLOW.from, FOLLOW.to - FOLLOW.from, ease.camera);
  return frameOn(TEXT_X, sentY(tracked), mix(sx, SENT_ON.sx, t), mix(sy, SENT_ON.sy, t), mix(start.s, SENT_ON.s, t));
};

/**
 * The camera at `frame`, following the line where it is at `tracked`: the motion blur compares two frames
 * that follow the same point, so the line it holds stays sharp.
 */
export const flowCamera = (frame: number, tracked = frame): Cam => {
  const cam = frame < FOLLOW.from ? cameraAt(frame, keys) : follow(frame, tracked);
  return { ...cam, s: cam.s * (1 + punch(frame)) };
};

/** Where the handoff scene's camera starts. */
export const HANDOFF_FROM = flowCamera(DURATIONS.flow - 1);

export const focusAt = (frame: number): Focus => {
  const flash = frame < T.enter ? 0 : Math.exp(-(frame - T.enter) / 5);
  const settle = 1 - progress(frame, T.enter + 2, 18);
  return {
    dim: progress(frame, T.typeSlash - 14, 16) * (1 - progress(frame, T.enter + 8, 22)),
    glow: Math.min(1, progress(frame, T.typeSlash, 10) * 0.7 + flash * 0.2) * settle,
    pulse: frame < T.enter ? 0 : progress(frame, T.enter, 20, (t) => t),
    text: says.slash,
  };
};

export const LaptopWithTerminal: React.FC<{ children?: React.ReactNode; focus?: Focus }> = ({ children, focus }) => (
  <div style={{ position: "absolute", left: LAPTOP_AT.x - LAPTOP.w / 2, top: LAPTOP_AT.y - LAPTOP.h / 2 }}>
    <Laptop glow={0.7}>
      <DesktopFrame>
        <TerminalWindow rect={MAXIMISED} focus={focus} />
        {children}
      </DesktopFrame>
    </Laptop>
  </div>
);

export const FlowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const cam = flowCamera(frame);
  const previous = flowCamera(frame - 1, frame);
  const scrim = interpolate(cam.s, [1.1, 1.5], [0, 1], clamp);
  const focus = focusAt(frame);

  return (
    <AbsoluteFill>
      <Backdrop at={0} />
      <Camera cam={cam} previous={previous}>
        <LaptopWithTerminal focus={focus}>
          <MacNotification
            at={NOTIFY.at}
            until={NOTIFY.until}
            title="School pickup"
            body="Leaving in 5 minutes"
            appIcon={<CalendarIcon />}
            style={{ right: 16, top: 42 }}
          />
        </LaptopWithTerminal>
      </Camera>
      {focus.dim > 0 ? (
        <AbsoluteFill
          style={{
            opacity: focus.dim,
            background: "radial-gradient(ellipse 46% 38% at 26% 56%, rgba(3,4,6,0) 40%, rgba(3,4,6,0.78) 100%)",
          }}
        />
      ) : null}
      <CaptionScrim opacity={scrim} />
    </AbsoluteFill>
  );
};
