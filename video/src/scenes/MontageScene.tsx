/**
 * Scene 5: what else the phone does, each shown close enough to read. An ntfy alert lands on the lock
 * screen when Claude needs an answer; herdr turns Claude's permission prompt into a card, and one tap on
 * Yes lets the push go ahead; the repo's own shell runs the tests; and Claude Code, Codex and Cursor share
 * the same tab bar. Each beat holds long enough to read before the next one takes focus.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { ClaudeMark, PromptCard, Touch, type Approval, type ChatItem, type Tab } from "../components/herdr";
import { Phone, PhoneAt, type PhonePose } from "../components/Phone";
import { HerdrChatScreen, HerdrTerminalScreen, IosNotification, LockScreen, NtfyMark } from "../components/screens";
import { icon, line, span, type Line } from "../components/term";
import { BRANCH, CONTAINER_HOST, REPO, REPO_PATH } from "../data/session";
import { phoneItems } from "../data/chat";
import { claude, herdrDark } from "../theme";
import { ease, keyframed, progress, springAt, typedCount } from "../lib/anim";
import { MONTAGE_PHONE, ZOOM_PHONE, phoneShowing } from "../layout";
import { DURATIONS, SCENES } from "../timeline";

export const M = { alert: 0, approve: 60, tap: 90, shell: 120, shellType: 128, agents: 180 };

/** Close enough to read: the lock screen's alert, the approval card, the shell, and the shared tabs. */
const ALERT_PHONE = phoneShowing(196.5, 270, 1380, 540, 1.75);
const APPROVE_PHONE = phoneShowing(196.5, 826, 1380, 1046, 1.75);
const SHELL_PHONE = phoneShowing(196.5, 488, 1380, 540, 1.6);

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

/** The phone moves to the single feature currently on screen; the final tabs make the agent-agnostic point. */
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
  const time = frame < M.approve ? "" : frame < M.agents ? "9:58" : "9:59";

  const cardIn = springAt(frame, fps, M.approve + 6, { damping: 18, stiffness: 150 });
  const cardOut = progress(frame, M.tap + 9, 9, ease.inOut);
  const press = progress(frame, M.tap - 2, 3) * (1 - progress(frame, M.tap + 9, 4));

  return (
    <AbsoluteFill>
      <Backdrop at={SCENES.montage.from} />
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
          <Slide frame={frame} from={M.agents} to={999}>
            <HerdrChatScreen
              frame={frame}
              items={phoneItems(-100, -100, -100)}
              title="One workspace. Any agent."
              composer=""
              caret={false}
              tabs={tabsFor("claude")}
              active={1}
              mark={<ClaudeMark size={20} />}
            />
          </Slide>
        </Phone>
      </PhoneAt>
    </AbsoluteFill>
  );
};
