/**
 * Scene 4, the turn the video builds to. The laptop's transcript lifts off its screen and Claude's last
 * message lights up. The conversation then flies across into the phone, part by part with the lit message
 * last, and each part lands as herdr's chat shows it. The phone comes forward, and the developer answers
 * Claude's question from it: the same session carries on.
 */
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { ClaudeCode, transcriptRows, type ClaudeScript } from "../components/ClaudeCode";
import { Beam } from "../components/Connection";
import { ClaudeMark, Touch } from "../components/herdr";
import { MacWindow } from "../components/Laptop";
import { Phone, PhoneAt, type PhonePose } from "../components/Phone";
import { HerdrChatScreen } from "../components/screens";
import { TermLine, line, span, type Line } from "../components/term";
import { Workspace } from "../components/Workspace";
import { DONE_INDEX, followUp, historyItems } from "../data/chat";
import { says } from "../data/session";
import { claude, fonts } from "../theme";
import { Camera, MotionBlur } from "../lib/motion";
import { ease, keyframed, mix, progress, springAt, typedCount } from "../lib/anim";
import { HERO_PHONE, PAIR_CAMERA, ZOOM_PHONE, containerOnScreen, onPhone, phoneLinkPoint } from "../layout";
import { DURATIONS, SCENES, sinceHandoff } from "../timeline";
import { LaptopAt } from "./HandoffScene";

const ROW = 24;
const COLS = 78;
const PAD = { x: 22, y: 14, title: 34 };

/** The laptop transcript, condensed to the parts both screens show. */
const excerpt: ClaudeScript = {
  blocks: [
    { kind: "user", at: -1, text: says.prompt },
    { kind: "say", at: -1, text: says.plan, duration: 1 },
    { kind: "tool", at: -1, name: "Read", args: "src/routes/upload.ts", doneAt: -1, result: [line(span("Read 84 lines", claude.dim))] },
    {
      kind: "tool",
      at: -1,
      name: "Write",
      args: "src/middleware/rate-limit.ts",
      doneAt: -1,
      result: [line(span("Wrote 38 lines to ", claude.dim), span("src/middleware/rate-limit.ts", claude.fg))],
    },
    {
      kind: "tool",
      at: -1,
      name: "Update",
      args: "src/routes/upload.ts",
      doneAt: -1,
      result: [line(span("Updated ", claude.dim), span("src/routes/upload.ts", claude.fg), span(" with 2 additions and 1 removal", claude.dim))],
    },
    {
      kind: "tool",
      at: -1,
      name: "Bash",
      args: "npm test -- upload",
      doneAt: -1,
      result: [line(span("Tests  ", claude.dim), span("12 passed", claude.green, { b: true }))],
    },
    { kind: "say", at: -1, text: says.done, duration: 1 },
  ],
  prompts: [],
  busy: [],
  exitAt: -1,
};

const rowsOf = (blocks: number) => transcriptRows({ ...excerpt, blocks: excerpt.blocks.slice(0, blocks) }, 0, 30, COLS);
const ROWS = rowsOf(excerpt.blocks.length);

/** What flies, as runs of excerpt blocks, in the order of the phone's history: prompt, plan, tools, reply. */
const PARTS = [
  [0, 0],
  [1, 1],
  [2, 5],
  [6, 6],
] as const;
/** Each part's first and last row in the transcript. */
const SPANS = PARTS.map(([first, last]) => [first === 0 ? 0 : rowsOf(first).length, rowsOf(last + 1).length - 2] as const);

const PANEL = { x: 112, y: 262, w: 820, h: PAD.title + PAD.y * 2 + ROWS.length * ROW };
/** The laptop's display, where the panel lifts from. */
const DISPLAY = { x: 271, y: 272, w: 888, h: 553 };

export const S = {
  light: 20,
  fly: [38, 48, 58, 80],
  flight: [24, 24, 26, 30],
  zoom: 112,
  type: 146,
  send: 190,
  work: 206,
  reply: 236,
} as const;

/** The frame each part lands on the phone; the reply's is beat 38 of the soundtrack. */
export const LANDS = S.fly.map((at, k) => at + (S.flight[k] ?? 0));
const LAND = LANDS[DONE_INDEX] ?? 0;

/** The phone holds still for the landings, comes forward, and gives a little as the reply lands. */
const phoneAt = (frame: number): PhonePose => {
  const pose = keyframed(frame, [
    [0, HERO_PHONE],
    [S.zoom, HERO_PHONE],
    [S.zoom + 32, ZOOM_PHONE],
    [DURATIONS.session, ZOOM_PHONE],
  ]);
  const give = frame < LAND ? 0 : Math.exp(-(frame - LAND) / 5) * Math.sin((frame - LAND) / 2.2) * 7;
  return { ...pose, y: pose.y + give };
};

/** A scrap of the terminal is a little wider than its text; where each scrap starts and where it lands. */
const SCRAP = { w: COLS * 9.6 + 24, padX: 12, padY: 6 };
const sourceOf = (k: number): [number, number] => {
  const last = SPANS[k]?.[1] ?? 0;
  return [PANEL.x + PAD.x + (COLS * 9.6) / 2, PANEL.y + PAD.title + PAD.y + (last + 1) * ROW + SCRAP.padY];
};
const targetOf = (k: number): [number, number] => onPhone(HERO_PHONE, k === 0 ? 226 : 196.5, 702 - 18 + SCRAP.padY);
/** A landed scrap is as wide as the chat's column. */
const LANDED_SCALE = ((361 + 16) * HERO_PHONE.s) / SCRAP.w;

const flightAt = (k: number, frame: number) => {
  const t = progress(frame, S.fly[k] ?? 0, S.flight[k] ?? 1, ease.inOut);
  const [x0, y0] = sourceOf(k);
  const [x2, y2] = targetOf(k);
  // Comes in level with the slot, so a scrap never crosses the chat on its way down.
  const cx = mix(x0, x2, 0.62);
  const cy = mix(y2, y0, 0.15) - (k === DONE_INDEX ? 90 : 50);
  return {
    t,
    x: (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x2,
    y: (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y2,
    s: mix(1, LANDED_SCALE, t) * (1 + (k === DONE_INDEX ? 0.1 : 0.05) * Math.sin(Math.PI * t)),
  };
};

/** A part of the transcript in flight: its rows on a scrap of the terminal, lit while it travels. */
const Scrap: React.FC<{ rows: Line[]; lit: number }> = ({ rows, lit }) => (
  <div
    style={{
      width: SCRAP.w,
      boxSizing: "border-box",
      padding: `${SCRAP.padY}px ${SCRAP.padX}px`,
      borderRadius: 10,
      background: claude.bg,
      border: `1.5px solid rgba(232,170,80,${(0.4 + 0.5 * lit).toFixed(3)})`,
      boxShadow: `0 18px 50px rgba(0,0,0,0.5), 0 0 ${(16 + 34 * lit).toFixed(1)}px rgba(232,170,80,${(0.22 + 0.4 * lit).toFixed(3)})`,
      fontFamily: fonts.mono,
      fontSize: 16,
      color: claude.fg,
      fontVariantLigatures: "none",
    }}
  >
    {rows.map((l, i) => (
      <TermLine key={i} l={l} height={ROW} />
    ))}
  </div>
);

const Flight: React.FC<{ k: number; frame: number; opacity?: number }> = ({ k, frame, opacity = 1 }) => {
  const [first, last] = SPANS[k] ?? [0, 0];
  const f = flightAt(k, frame);
  const prev = flightAt(k, frame - 1);
  const fade = 1 - progress(f.t, 0.74, 0.22, (t) => t);
  const hero = k === DONE_INDEX;
  return (
    <MotionBlur dx={(f.x - prev.x) * 0.55} dy={(f.y - prev.y) * 0.55}>
      <div
        style={{
          position: "absolute",
          left: f.x,
          top: f.y,
          translate: "-50% -100%",
          scale: String(f.s),
          transformOrigin: "50% 100%",
          opacity: opacity * fade,
        }}
      >
        <Scrap rows={ROWS.slice(first, last + 1)} lit={hero ? 1 : 0.35} />
      </div>
    </MotionBlur>
  );
};

/** The amber frame that lights Claude's last message on the laptop. */
const Lit: React.FC<{ amount: number }> = ({ amount }) => {
  const [first, last] = SPANS[DONE_INDEX] ?? [0, 0];
  if (amount <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: PAD.x - 10,
        width: COLS * 9.6 + 20,
        top: PAD.title + PAD.y + first * ROW - 5,
        height: (last - first + 1) * ROW + 10,
        borderRadius: 9,
        border: `2px solid rgba(232,170,80,${(0.95 * amount).toFixed(3)})`,
        background: `rgba(232,170,80,${(0.12 * amount).toFixed(3)})`,
        boxShadow: `0 0 ${(34 * amount).toFixed(1)}px rgba(232,170,80,${(0.45 * amount).toFixed(3)}), inset 0 0 ${(18 * amount).toFixed(1)}px rgba(232,170,80,${(0.2 * amount).toFixed(3)})`,
      }}
    />
  );
};

export const SessionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leave = progress(frame, 0, 26, ease.inOut);
  const lift = springAt(frame, fps, 2, { damping: 22, stiffness: 90 });
  const cam = { ...PAIR_CAMERA, x: PAIR_CAMERA.x + 12 + leave * 90, y: PAIR_CAMERA.y - leave * 20 };
  const panelOut = progress(frame, LAND - 2, 26, ease.in);
  const panel = {
    x: mix(DISPLAY.x, PANEL.x, lift) - panelOut * 160,
    y: mix(DISPLAY.y, PANEL.y, lift),
    w: mix(DISPLAY.w, PANEL.w, lift),
    h: mix(DISPLAY.h, PANEL.h, lift),
  };
  const launch = progress(frame, (S.fly[DONE_INDEX] ?? 0) - 10, 10);
  const lit = progress(frame, S.light, 14) * (1 + 0.25 * launch) * (frame >= (S.fly[DONE_INDEX] ?? 0) ? 0 : 1);

  const pose = phoneAt(frame);
  const previous = phoneAt(frame - 1);

  const glows = LANDS.map((at, k) => {
    const flash = frame < at ? 0 : Math.exp(-(frame - at) / 7);
    if (k !== DONE_INDEX) return flash;
    const hold = frame < at ? 0 : 1 - progress(frame, S.type + 10, 26);
    return Math.max(flash * 1.7, hold);
  });
  const bloom = frame < LAND - 4 ? 0 : progress(frame, LAND - 4, 30, (t) => t);
  const [bx, by] = onPhone(HERO_PHONE, 196.5, 702 - 18 - 72);

  const typed = frame >= S.send ? 0 : typedCount(frame, S.type, says.phoneAsk.length, 1.5);
  const send = frame >= S.send ? Math.sin(Math.min(1, (frame - S.send) / 8) * Math.PI) : 0;

  return (
    <AbsoluteFill>
      <Backdrop at={SCENES.session.from} />
      {leave < 1 ? (
        <AbsoluteFill style={{ opacity: 1 - leave }}>
          <Camera cam={cam}>
            <LaptopAt>
              <Sequence from={-sinceHandoff("session")} layout="none">
                <Workspace time="9:42" />
              </Sequence>
            </LaptopAt>
          </Camera>
          <Beam from={containerOnScreen(cam)} to={phoneLinkPoint(HERO_PHONE)} lift={190} draw={1} frame={frame + DURATIONS.pair} intensity={1 - leave} />
        </AbsoluteFill>
      ) : null}

      {panelOut < 1 ? (
        <div
          style={{
            position: "absolute",
            left: panel.x,
            top: panel.y,
            width: panel.w,
            height: panel.h,
            opacity: Math.min(1, lift * 1.6) * (1 - panelOut),
          }}
        >
          <MacWindow title="acme-api — claude" style={{ inset: 0, background: claude.bg }}>
            <ClaudeCode script={excerpt} cols={COLS} fontSize={16} lineHeight={ROW} height={PANEL.h - PAD.title} margin={0} />
          </MacWindow>
          {SPANS.map(([first, last], k) =>
            frame >= (S.fly[k] ?? 0) ? (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: PAD.x - 6,
                  width: COLS * 9.6 + 12,
                  top: PAD.title + PAD.y + first * ROW,
                  height: (last - first + 1) * ROW,
                  background: claude.bg,
                  opacity: 0.72 * progress(frame, S.fly[k] ?? 0, 8),
                }}
              />
            ) : null,
          )}
          <Lit amount={lit} />
        </div>
      ) : null}

      {bloom > 0 && bloom < 1 ? (
        <div
          style={{
            position: "absolute",
            left: bx - 520,
            top: by - 520,
            width: 1040,
            height: 1040,
            borderRadius: "50%",
            background: "radial-gradient(closest-side, rgba(255,206,140,0.55), rgba(244,176,74,0.18) 55%, rgba(244,176,74,0))",
            opacity: Math.sin(Math.min(1, bloom * 1.6) * Math.PI * 0.5) * (1 - bloom),
            scale: String(0.6 + 0.6 * bloom),
          }}
        />
      ) : null}

      <PhoneAt pose={pose} previous={previous}>
        <Phone statusBar="light" time="9:42" homeIndicator="dark">
          <HerdrChatScreen
            frame={frame}
            items={[...historyItems(LANDS.map((at) => at - 2)), ...followUp(S.send + 2, S.work, S.reply)]}
            title="Rate limit the upload API"
            composer={says.phoneAsk.slice(0, typed)}
            caret={frame >= S.type - 8 && frame < S.send}
            glows={glows}
            mark={<ClaudeMark size={20} />}
            sendPressed={send}
          >
            <Touch x={350} y={797} frame={frame} at={S.send} />
          </HerdrChatScreen>
        </Phone>
      </PhoneAt>

      {PARTS.map((_, k) => {
        const start = S.fly[k] ?? 0;
        if (frame < start || frame > (LANDS[k] ?? 0) + 6) return null;
        return (
          <React.Fragment key={k}>
            {k === DONE_INDEX
              ? [6, 4, 2].map((lag) => <Flight key={lag} k={k} frame={frame - lag} opacity={0.12 + (6 - lag) * 0.05} />)
              : null}
            <Flight k={k} frame={frame} />
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};