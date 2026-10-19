/**
 * Scene 5: what else the phone does, each shown close enough to read. An ntfy alert lands on the lock
 * screen when Claude needs an answer; herdr turns Claude's permission prompt into a card, and one tap on
 * Yes lets the push go ahead; the repo's own shell runs the tests; and Claude Code, Codex and Cursor each
 * work in their own tab.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { ClaudeMark, CodexMark, CursorMark, PromptCard, Touch, type Approval, type ChatItem, type Tab } from "../components/herdr";
import { Phone, PhoneAt, type PhonePose } from "../components/Phone";
import { HerdrChatScreen, HerdrTerminalScreen, IosNotification, LockScreen, NtfyMark } from "../components/screens";
import { icon, line, span, type Line } from "../components/term";
import { BRANCH, CONTAINER_HOST, REPO, REPO_PATH } from "../data/session";
import { phoneItems } from "../data/chat";
import { claude, fonts, herdrDark, stage } from "../theme";
import { ease, keyframed, progress, springAt, typedCount } from "../lib/anim";
import { MONTAGE_PHONE, ZOOM_PHONE, phoneShowing } from "../layout";
import { DURATIONS, SCENES } from "../timeline";

export const M = { alert: 0, approve: 38, tap: 60, shell: 98, shellType: 104, agents: 132, codex: 148, cursor: 164 };

/** Close enough to read: the lock screen's alert, the approval card, the shell, and the tabs. */
const ALERT_PHONE = phoneShowing(196.5, 270, 1380, 540, 1.75);
const APPROVE_PHONE = phoneShowing(196.5, 826, 1380, 1046, 1.75);
const SHELL_PHONE = phoneShowing(196.5, 488, 1380, 540, 1.6);

const ITEMS = [
  { label: "Alerts", from: M.alert, to: M.approve },
  { label: "Approvals", from: M.approve, to: M.shell },
  { label: "Terminal", from: M.shell, to: M.agents },
];
const AGENTS = [
  { label: "Claude Code", from: M.agents, to: M.codex },
  { label: "Codex", from: M.codex, to: M.cursor },
  { label: "Cursor", from: M.cursor, to: 999 },
];

/** 52 cells across, which the container's own prompt and `git diff --stat` fill exactly. */
const TERM = { fontSize: 12, rowHeight: 18.5 };

const prompt = (cmd: string): Line =>
  line(span(`agent@${CONTAINER_HOST}`, herdrDark.green, { b: true }), span(":", herdrDark.text), span(".../src/acme-api", herdrDark.blue, { b: true }), span(`$ ${cmd}`, herdrDark.text));

export const tabsFor = (agent: "claude" | "codex" | "cursor"): Tab[] => [
  { label: "Shell" },
  { label: "Claude", live: agent === "claude" },
  { label: "Codex", live: agent === "codex" },
  { label: "Cursor", live: agent === "cursor" },
];

const nested = (l: Line): Line => ({ ...l, spans: [span("     "), ...l.spans], bgFrom: l.bg ? 5 : undefined });

/** Claude's permission prompt for the push, as herdr-web-ui's card puts it. */
const APPROVAL: Approval = {
  title: "Bash command",
  question: "Do you want to proceed?",
  body: `git push -u origin ${BRANCH}\nPush the branch for review`,
  options: ["Yes", "Yes, and don't ask again for: git push *", "No"],
};

/** The chat behind the card, and what lands in it once the push is allowed. */
const approvalItems: ChatItem[] = [
  ...phoneItems(-100, -100, -100),
  { kind: "tools", at: M.tap + 12, items: [{ verb: "Ran", target: `git push -u origin ${BRANCH}` }] },
  { kind: "assistant", at: M.tap + 20, duration: 12, text: "Pushed. `feature/upload-rate-limit` is ready for review." },
];

/** The repo's shell: what the agent changed, then the tests, run by hand from the phone. */
const shellLines = (frame: number): Line[] => {
  const cmd = "npm test";
  const typed = cmd.slice(0, typedCount(frame, M.shellType, cmd.length, 1.3));
  const output: Array<readonly [number, Line]> = [
    [0, line("")],
    [1, line(span("> acme-api@1.4.0 test", herdrDark.text))],
    [1, line(span("> vitest run", herdrDark.text))],
    [2, line("")],
    [2, line(span(" RUN ", "#0B0A09", { b: true, bg: "#729FCF" }), span(` v3.2.4 ${REPO_PATH}`, herdrDark.muted))],
    [3, line("")],
    [5, line(span(" "), icon("check", claude.green), span("test/upload.test.ts ", herdrDark.text), span("(13 tests) 431ms", herdrDark.muted))],
    [7, line(span(" "), icon("check", claude.green), span("test/auth.test.ts ", herdrDark.text), span("(9 tests) 208ms", herdrDark.muted))],
    [8, line("")],
    [9, line(span(" Test Files  ", herdrDark.muted), span("2 passed", claude.green, { b: true }), span(" (2)", herdrDark.muted))],
    [9, line(span("      Tests  ", herdrDark.muted), span("22 passed", claude.green, { b: true }), span(" (22)", herdrDark.muted))],
    [10, line(span("   Duration  ", herdrDark.muted), span("1.24s", herdrDark.text))],
    [12, line("")],
    [12, prompt("")],
  ];
  const ran = frame - (M.shellType + 8);
  return [
    prompt("git diff --stat"),
    line(span(" src/middleware/rate-limit.ts | 40 ", herdrDark.text), span("+".repeat(12), claude.addSign)),
    line(span(" src/routes/upload.ts         |  3 ", herdrDark.text), span("++", claude.addSign), span("-", claude.delSign)),
    line(span(" test/upload.test.ts          | 31 ", herdrDark.text), span("+".repeat(9), claude.addSign)),
    line(span(" 3 files changed, 73 insertions(+), 1 deletion(-)", herdrDark.text)),
    prompt(typed),
    ...(ran >= 0 ? output.filter(([at]) => ran >= at).map(([, l]) => l) : []),
  ];
};

const codexItems: ChatItem[] = [
  { kind: "user", text: "Review the rate limiter before it ships", time: "9:59 AM" },
  {
    kind: "tools",
    items: [
      { verb: "Ran", target: "git diff main -- src/middleware" },
      { verb: "Read", target: "src/middleware/rate-limit.ts" },
      { verb: "Read", target: "test/upload.test.ts" },
    ],
  },
  {
    kind: "assistant",
    at: M.codex + 3,
    duration: 11,
    text: "The window logic in `rate-limit.ts` is sound. One fix: old keys never leave `hits`, so the map grows forever. Prune entries older than `WINDOW_MS` on each request.",
  },
];

const CURSOR_INK = "#F2EDE6";
const CURSOR_BLUE = "#8FB8FF";

const docAdd = (n: number, text: string): Line => ({
  spans: [
    span(String(n).padStart(4), claude.faint),
    span(" + ", claude.addSign),
    span(text, text.startsWith("#") ? "#79C0FF" : "#E6EDF3", { b: text.startsWith("#") }),
  ],
  bg: claude.addBg,
});

/** Cursor's agent CLI in its own tab, working on the docs while the others are busy. */
const cursorLines = (frame: number): Line[] => {
  const at = (f: number) => frame >= M.cursor + f;
  return [
    line(span("Cursor Agent", CURSOR_INK, { b: true })),
    line(span(`~/src/${REPO} · ${BRANCH}`, herdrDark.muted)),
    line(""),
    line(span("> Document the 429 response in docs/api.md", CURSOR_INK)),
    line(""),
    line(icon("dot", CURSOR_BLUE), span("Read ", herdrDark.text, { b: true }), span("docs/api.md", herdrDark.text)),
    line(icon("dot", CURSOR_BLUE), span("Read ", herdrDark.text, { b: true }), span("src/middleware/rate-limit.ts", herdrDark.text)),
    ...(at(3)
      ? [
          line(icon("dot", CURSOR_BLUE), span("Edit ", herdrDark.text, { b: true }), span("docs/api.md ", herdrDark.text), span("+5", claude.addSign)),
          nested(docAdd(41, "## 429 Too Many Requests")),
          nested(docAdd(42, "")),
          nested(docAdd(43, "Each user gets 10 uploads a minute.")),
          nested(docAdd(44, "Then wait Retry-After seconds.")),
          nested(docAdd(45, "")),
        ]
      : []),
    ...(at(8) ? [line(""), line(span("Documented the 429 response.", CURSOR_INK))] : []),
  ];
};

const CursorInput: React.FC<{ frame: number }> = ({ frame }) => (
  <div style={{ marginTop: 12, lineHeight: "19px", opacity: progress(frame, M.cursor + 8, 4) }}>
    <div style={{ border: "1px solid #3A3631", borderRadius: 6, padding: "6px 10px", color: herdrDark.muted }}>
      <span style={{ color: CURSOR_INK }}>→ </span>Add a follow-up
    </div>
    <div style={{ color: herdrDark.muted, padding: "4px 10px 0" }}>Auto · 1 file edited</div>
  </div>
);

/** One phone screen of the montage, pushed in from the right, or faded in when `push` is off. */
const Slide: React.FC<{ frame: number; from: number; to: number; push?: boolean; children: React.ReactNode }> = ({
  frame,
  from,
  to,
  push = true,
  children,
}) => {
  if (frame < from - 1 || frame >= to + 6) return null;
  const enter = from < 0 ? 1 : progress(frame, from, 7, ease.out);
  const exit = progress(frame, to, 6, ease.in);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        translate: push ? `${(1 - enter) * 120 - exit * 60}px 0` : undefined,
        opacity: Math.min(enter * 1.5, 1) * (1 - exit),
        filter: enter < 1 || exit > 0 ? `blur(${(1 - enter) * 8 + exit * 6}px)` : undefined,
      }}
    >
      {children}
    </div>
  );
};

const ListItem: React.FC<{ label: string; on: number; size: number; shift: number }> = ({ label, on, size, shift }) => (
  <span
    style={{
      display: "inline-block",
      fontSize: size,
      fontWeight: 800,
      letterSpacing: "-0.035em",
      color: `rgba(245,245,247,${0.2 + 0.8 * on})`,
      translate: `${on * shift}px 0`,
      textShadow: on > 0.5 ? `0 0 40px rgba(244,176,74,${0.25 * on})` : undefined,
    }}
  >
    {label}
  </span>
);

/** The kinetic list on the left. The local scene keeps drawing it for a moment, so the cut doesn't pop. */
export const MontageList: React.FC<{ frame: number; style?: React.CSSProperties }> = ({ frame, style }) => {
  const listIn = progress(frame, 0, 16);
  const activeness = (from: number, to: number) => progress(frame, from, 6) * (1 - progress(frame, to, 6));
  return (
    <div style={{ position: "absolute", left: 150, top: 270, fontFamily: fonts.display, opacity: listIn, translate: `${(1 - listIn) * -30}px 0`, ...style }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 20, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: stage.amber, marginBottom: 26 }}>From your phone</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {ITEMS.map((it) => (
          <ListItem key={it.label} label={it.label} on={activeness(it.from, it.to)} size={88} shift={14} />
        ))}
        <div style={{ display: "flex", gap: 26, marginTop: 18, alignItems: "baseline" }}>
          {AGENTS.map((a) => (
            <ListItem key={a.label} label={a.label} on={activeness(a.from, a.to)} size={50} shift={0} />
          ))}
        </div>
      </div>
    </div>
  );
};

export const CursorScreen: React.FC<{ frame: number }> = ({ frame }) => (
  <HerdrTerminalScreen
    title="Cursor"
    mark={<CursorMark size={20} />}
    tabs={tabsFor("cursor")}
    active={3}
    top
    lines={cursorLines(frame)}
    body={<CursorInput frame={frame} />}
    {...TERM}
  />
);

/** The phone moves to whatever it is showing, and buzzes when the alert lands; the local scene pulls back from the end. */
const phonePose = (frame: number): PhonePose => {
  const base = keyframed(frame, [
    [0, ZOOM_PHONE],
    [18, ALERT_PHONE],
    [M.approve - 2, ALERT_PHONE],
    [M.approve + 12, APPROVE_PHONE],
    [M.shell - 2, APPROVE_PHONE],
    [M.shell + 12, SHELL_PHONE],
    [M.agents - 2, SHELL_PHONE],
    [M.agents + 12, MONTAGE_PHONE],
    [DURATIONS.montage, MONTAGE_PHONE],
  ]);
  const buzz = frame >= 10 && frame < 22 ? Math.sin(frame * 2.6) * 3 : 0;
  return { ...base, x: base.x + buzz, r: base.r + buzz * 0.3 };
};

export const MontageScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const note = springAt(frame, fps, 10, { damping: 15, stiffness: 140 });
  const time = frame < M.approve ? "" : frame < M.codex ? "9:58" : "9:59";

  const cardIn = springAt(frame, fps, M.approve + 6, { damping: 18, stiffness: 150 });
  const cardOut = progress(frame, M.tap + 9, 9, ease.inOut);
  const press = progress(frame, M.tap - 2, 3) * (1 - progress(frame, M.tap + 9, 4));

  return (
    <AbsoluteFill>
      <Backdrop at={SCENES.montage.from} />
      <MontageList frame={frame} />

      <PhoneAt pose={phonePose(frame)} previous={phonePose(frame - 1)}>
        <Phone statusBar="light" time={time} homeIndicator={frame < M.approve ? "light" : "dark"}>
          <Slide frame={frame} from={-10} to={0} push={false}>
            <HerdrChatScreen frame={frame} items={phoneItems(-100, -100, -100)} title="Rate limit the upload API" composer="" caret={false} mark={<ClaudeMark size={20} />} />
          </Slide>
          <Slide frame={frame} from={3} to={M.approve} push={false}>
            <LockScreen time="9:58" date="Monday 19 October">
              <div style={{ position: "absolute", left: 0, right: 0, top: 300, opacity: Math.min(1, note * 1.4), translate: `0 ${(1 - note) * -40}px`, scale: String(0.94 + 0.06 * note) }}>
                <IosNotification app="ntfy" title="Claude Code needs you" body={`${REPO}: waiting for an answer or an approval`} icon={<NtfyMark size={38} />} />
              </div>
            </LockScreen>
          </Slide>
          <Slide frame={frame} from={M.approve} to={M.shell}>
            <HerdrChatScreen
              frame={frame}
              items={approvalItems}
              title="Rate limit the upload API"
              composer=""
              caret={false}
              mark={<ClaudeMark size={20} />}
              prompt={<PromptCard approval={APPROVAL} picked={0} press={press} busy={frame >= M.tap + 3} />}
              promptGrow={Math.min(1, cardIn) * (1 - cardOut)}
            >
              <Touch x={176} y={578} frame={frame} at={M.tap} />
            </HerdrChatScreen>
          </Slide>
          <Slide frame={frame} from={M.shell} to={M.agents}>
            <HerdrTerminalScreen title=".../src/acme-api" tabs={tabsFor("claude")} active={0} top lines={shellLines(frame)} {...TERM} />
          </Slide>
          <Slide frame={frame} from={M.agents} to={M.codex}>
            <HerdrChatScreen
              frame={frame}
              items={approvalItems}
              title="Rate limit the upload API"
              composer=""
              caret={false}
              tabs={tabsFor("claude")}
              active={1}
              mark={<ClaudeMark size={20} />}
            />
          </Slide>
          <Slide frame={frame} from={M.codex} to={M.cursor}>
            <HerdrChatScreen
              frame={frame}
              items={codexItems}
              title="Review the rate limiter"
              composer=""
              caret={false}
              tabs={tabsFor("codex")}
              active={2}
              mark={<CodexMark size={20} />}
              agent="Codex"
              model="GPT-5.5"
            />
          </Slide>
          <Slide frame={frame} from={M.cursor} to={999}>
            <CursorScreen frame={frame} />
          </Slide>
        </Phone>
      </PhoneAt>
    </AbsoluteFill>
  );
};
