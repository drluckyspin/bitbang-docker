/**
 * The one conversation the video follows. The laptop's Claude Code transcript and the phone's chat are both
 * built from these strings, so the phone shows exactly what happened on the laptop.
 */
import { claude } from "../theme";
import type { ClaudeScript } from "../components/ClaudeCode";
import { highlight, icon, line, span, type Line } from "../components/term";

export const REPO = "acme-api";
export const REPO_PATH = "/Users/dev/src/acme-api";
export const PROJECT = "go-remote-acme-api";
export const SESSION = "7c41e2a9-3b0d-4f6e-9a51-2d8c0e6b4f13";
export const BRANCH = "feature/upload-rate-limit";
export const CONTAINER_HOST = "4b2e91c07d3a";

export const says = {
  prompt: "Add rate limiting to the upload API, then run the tests",
  plan: "I'll add a sliding-window limiter to `POST /api/upload`, then cover the 429 path with tests.",
  done: "Done. `POST /api/upload` now allows 10 uploads a minute per user and returns 429 after that. All 12 tests pass. Want me to add a `Retry-After` header next?",
  slash: "/go-remote",
  move: "When this reply ends, this session closes here and carries on in **go-remote-acme-api**, and a QR code opens in a window. Scan it with your phone's camera to pick up right here.",
  phoneAsk: "Yes, add the Retry-After header. Then push a branch for review.",
  phoneReply: "Added `Retry-After` to every 429, with a test for it. All 13 tests pass. Pushing `feature/upload-rate-limit` for review.",
};

export const todos = ["Add a sliding-window rate limiter", "Apply it to POST /api/upload", "Test the 429 response"];

/** The tool calls, as the phone's chat lists them; the session scene's laptop excerpt shows the same four. */
export const toolSummary = [
  { verb: "Read", target: "src/routes/upload.ts" },
  { verb: "Wrote", target: "src/middleware/rate-limit.ts" },
  { verb: "Edited", target: "src/routes/upload.ts" },
  { verb: "Ran", target: "npm test -- upload" },
];

const code = (n: number | "", text: string): Line => line(span(String(n).padStart(4), claude.faint), span("  "), ...highlight(text));

export const diff = (n: number, sign: "+" | "-" | " ", text: string): Line => ({
  spans: [
    span(String(n).padStart(4), claude.faint),
    span(` ${sign} `, sign === "+" ? claude.addSign : sign === "-" ? claude.delSign : claude.faint),
    ...highlight(text),
  ],
  bg: sign === "+" ? claude.addBg : sign === "-" ? claude.delBg : undefined,
});

const more = (n: number) => line(span(`… +${n} lines (ctrl+r to expand)`, claude.faint));
const out = (text: string) => line(span(text, "#B9BDC5"));

/**
 * The laptop session, in frames of the opening scene; the handoff scene keeps playing it from where the
 * opening ends. `enter` is the key press, on a beat; the prompt leaves the box a moment later, at
 * `submitSlash`, and Claude starts on it at `think`, once it has risen into the transcript, so nothing new
 * appears under it on the way.
 */
export const T = {
  typePrompt: 6,
  submitPrompt: 34,
  plan: 42,
  read: 56,
  todos: 68,
  write: 80,
  update: 98,
  test: 114,
  testDone: 196,
  done: 202,
  typeSlash: 226,
  enter: 255,
  submitSlash: 258,
  think: 268,
  repo: 272,
  start: 284,
  startDone: 296,
  move: 300,
  exit: 326,
  tell: 500,
};

export const laptopScript: ClaudeScript = {
  blocks: [
    { kind: "welcome", at: -1, cwd: REPO_PATH },
    { kind: "user", at: T.submitPrompt, text: says.prompt },
    { kind: "say", at: T.plan, text: says.plan, duration: 14 },
    {
      kind: "tool",
      at: T.read,
      name: "Read",
      args: "src/routes/upload.ts",
      doneAt: T.read + 8,
      result: [line(span("Read ", claude.dim), span("84", claude.fg, { b: true }), span(" lines (ctrl+r to expand)", claude.dim))],
    },
    {
      kind: "todos",
      at: T.todos,
      items: [
        { text: todos[0] ?? "", activeAt: T.todos + 6, doneAt: T.write + 14 },
        { text: todos[1] ?? "", activeAt: T.write + 14, doneAt: T.update + 12 },
        { text: todos[2] ?? "", activeAt: T.update + 12, doneAt: T.testDone + 4 },
      ],
    },
    {
      kind: "tool",
      at: T.write,
      name: "Write",
      args: "src/middleware/rate-limit.ts",
      doneAt: T.write + 10,
      result: [
        line(span("Wrote ", claude.dim), span("38", claude.fg, { b: true }), span(" lines to ", claude.dim), span("src/middleware/rate-limit.ts", claude.fg)),
        code(1, 'import type { NextFunction, Request, Response } from "express";'),
        code(2, ""),
        code(3, "const WINDOW_MS = 60_000;"),
        code(4, "const LIMIT = 10;"),
        code(5, "const hits = new Map<string, number[]>();"),
        more(33),
      ],
    },
    {
      kind: "tool",
      at: T.update,
      name: "Update",
      args: "src/routes/upload.ts",
      doneAt: T.update + 8,
      result: [
        line(
          span("Updated ", claude.dim),
          span("src/routes/upload.ts", claude.fg),
          span(" with ", claude.dim),
          span("2", claude.fg, { b: true }),
          span(" additions and ", claude.dim),
          span("1", claude.fg, { b: true }),
          span(" removal", claude.dim),
        ),
        diff(1, " ", 'import { Router } from "express";'),
        diff(2, "+", 'import { rateLimit } from "../middleware/rate-limit";'),
        diff(3, " ", 'import { requireUser } from "../auth";'),
        line(span("   …", claude.faint)),
        diff(13, "-", 'router.post("/api/upload", requireUser, saveUpload);'),
        diff(14, "+", 'router.post("/api/upload", requireUser, rateLimit, saveUpload);'),
      ],
    },
    {
      kind: "tool",
      at: T.test,
      name: "Bash",
      args: "npm test -- upload",
      doneAt: T.testDone,
      running: "Running… (vitest run upload)",
      result: [
        line(icon("check", claude.green), span("test/upload.test.ts", claude.fg), span(" (12 tests) ", claude.dim), span("412ms", claude.dim)),
        line(span("Test Files  ", claude.dim), span("1 passed", claude.green, { b: true }), span(" (1)", claude.dim)),
        line(span("     Tests  ", claude.dim), span("12 passed", claude.green, { b: true }), span(" (12)", claude.dim)),
      ],
    },
    { kind: "say", at: T.done, text: says.done, duration: 18 },
    { kind: "user", at: T.submitSlash, text: says.slash, sent: true },
    {
      kind: "tool",
      at: T.repo,
      name: "Bash",
      args: "git rev-parse --show-toplevel && git status --short",
      doneAt: T.repo + 8,
      result: [out(REPO_PATH), line(span(" M ", claude.yellow), span("src/routes/upload.ts", "#B9BDC5")), line(span("?? ", claude.red), span("src/middleware/rate-limit.ts", "#B9BDC5"))],
    },
    {
      kind: "tool",
      at: T.start,
      name: "Bash",
      args: `go-remote start "$(git rev-parse --show-toplevel)" --json --resume claude:${SESSION}`,
      doneAt: T.startDone,
      running: "Running… (starting go-remote-acme-api)",
      result: [
        line(
          icon("check", claude.green),
          span(`${PROJECT} is ready. The session moves there once this turn ends; then its QR code opens in a window.`, claude.fg),
        ),
        more(9),
      ],
    },
    { kind: "say", at: T.move, text: says.move, duration: 18 },
  ],
  prompts: [
    { text: says.prompt, start: T.typePrompt, cps: 2, submit: T.submitPrompt },
    { text: says.slash, start: T.typeSlash, cps: 0.5, submit: T.submitSlash },
  ],
  busy: [
    { from: T.submitPrompt + 1, to: T.done, verb: "Pondering", tokens: 800 },
    { from: T.think, to: T.exit, verb: "Cogitating", tokens: 300 },
  ],
  menu: [
    {
      name: "/go-remote",
      desc: "Moves the current coding session into a hardened go-remote workspace and opens it on the user's phone",
    },
    { name: "/review", desc: "Review a pull request" },
    { name: "/resume", desc: "Resume a conversation" },
  ],
  exitAt: T.exit,
  after: [
    { at: T.exit, lines: [line(span("dev@mbp ", claude.green, { b: true }), span("acme-api ", claude.blue, { b: true }), span("% ", claude.fg))] },
    {
      at: T.tell,
      lines: [
        line(
          span("go-remote: ", claude.orange, { b: true }),
          span(`this session now runs in ${PROJECT}. Scan the QR code in the window to carry on from your phone;`, claude.fg),
        ),
        line(span("go-remote pull brings it back here.", claude.fg)),
      ],
    },
  ],
};
