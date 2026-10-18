import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claudeProjectDir,
  describeClaude,
  describeCodex,
  findHostSession,
  hostSessions,
  parseSessionRef,
  resumeArgs,
  type Stores,
  writeBack,
} from "./sessions.ts";

const REPO = "/Users/me/src/my.repo";
const CLAUDE_ID = "0b6f7a4e-3c1d-4e8f-9a2b-1c3d5e7f9a0b";
const CODEX_ID = "0199a213-81c0-7800-8aa1-bbab2a035a53";

function lines(...entries: object[]): string {
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function claudeTranscript(id: string, cwd: string, prompt: string): string {
  return lines(
    { type: "summary", summary: "A summary", leafUuid: "x" },
    { type: "user", isMeta: true, sessionId: id, cwd, message: { role: "user", content: "Caveat: local commands" } },
    { type: "user", sessionId: id, cwd, message: { role: "user", content: "<command-name>/clear</command-name>" } },
    { type: "user", sessionId: id, cwd, message: { role: "user", content: [{ type: "text", text: prompt }] } },
    { type: "assistant", sessionId: id, cwd, message: { role: "assistant", content: [{ type: "text", text: "On it." }] } },
  );
}

function codexRollout(id: string, cwd: string, prompt: string): string {
  return lines(
    { timestamp: "2026-10-17T10:00:00Z", type: "session_meta", payload: { id, cwd, cli_version: "0.161.0" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>...</environment_context>" }] } },
    { type: "event_msg", payload: { type: "user_message", message: prompt } },
  );
}

/** A laptop with one Claude session in the repo, one in a sibling that shares its folder prefix, and two Codex rollouts. */
function fixture(): Stores {
  const root = mkdtempSync(join(tmpdir(), "go-remote-stores-"));
  const stores = { claude: join(root, ".claude"), codex: join(root, ".codex") };
  const project = join(stores.claude, "projects", claudeProjectDir(`${REPO}/sub`));
  mkdirSync(join(project, CLAUDE_ID, "subagents"), { recursive: true });
  writeFileSync(join(project, `${CLAUDE_ID}.jsonl`), claudeTranscript(CLAUDE_ID, `${REPO}/sub`, "Fix the   flaky\ntest"));
  writeFileSync(join(project, CLAUDE_ID, "subagents", "agent-1.jsonl"), lines({ type: "user" }));

  const sibling = join(stores.claude, "projects", claudeProjectDir(`${REPO}-old`));
  mkdirSync(sibling, { recursive: true });
  writeFileSync(join(sibling, "1b6f7a4e-3c1d-4e8f-9a2b-1c3d5e7f9a0b.jsonl"), claudeTranscript("1b6f7a4e-3c1d-4e8f-9a2b-1c3d5e7f9a0b", `${REPO}-old`, "Old"));

  const day = join(stores.codex, "sessions", "2026", "10", "17");
  mkdirSync(day, { recursive: true });
  writeFileSync(join(day, `rollout-2026-10-17T10-00-00-${CODEX_ID}.jsonl`), codexRollout(CODEX_ID, REPO, "Add a CLI"));
  const old = join(stores.codex, "sessions", "2026", "09", "01");
  mkdirSync(old, { recursive: true });
  const otherId = "0199a213-81c0-7800-8aa1-000000000001";
  writeFileSync(
    join(old, `rollout-2026-09-01T10-00-00-${otherId}.jsonl.zst`),
    Bun.zstdCompressSync(new TextEncoder().encode(codexRollout(otherId, `${REPO}/docs`, "Write the docs"))),
  );
  utimesSync(join(old, `rollout-2026-09-01T10-00-00-${otherId}.jsonl.zst`), new Date("2026-09-01"), new Date("2026-09-01"));
  return stores;
}

describe("parseSessionRef", () => {
  test("takes agent:uuid, in any case", () => {
    expect(parseSessionRef(`claude:${CLAUDE_ID.toUpperCase()}`)).toEqual({ agent: "claude", id: CLAUDE_ID });
    expect(parseSessionRef(`codex:${CODEX_ID}`)).toEqual({ agent: "codex", id: CODEX_ID });
  });

  test("refuses anything else", () => {
    for (const bad of [CLAUDE_ID, `cursor:${CLAUDE_ID}`, "claude:latest", `claude:${CLAUDE_ID}/../x`]) {
      expect(() => parseSessionRef(bad)).toThrow("Not a session");
    }
  });
});

describe("transcript metadata", () => {
  test("Claude: the directory, and the first real prompt", () => {
    expect(describeClaude(CLAUDE_ID, claudeTranscript(CLAUDE_ID, REPO, "Fix the   flaky\ntest").trim().split("\n"))).toEqual({
      cwd: REPO,
      title: "Fix the flaky test",
    });
  });

  test("Codex: the rollout's id and directory, and the first prompt", () => {
    expect(describeCodex(codexRollout(CODEX_ID, REPO, "Add a CLI").trim().split("\n"))).toEqual({
      id: CODEX_ID,
      cwd: REPO,
      title: "Add a CLI",
    });
    expect(describeCodex(['{"type":"response_item"}'])).toBeUndefined();
  });
});

describe("hostSessions", () => {
  test("finds the repo's sessions, including subdirectories and compressed rollouts, and not a sibling's", () => {
    const found = hostSessions(REPO, fixture());
    expect(found.map((session) => `${session.agent}:${session.cwd}:${session.title}`).sort()).toEqual([
      `claude:${REPO}/sub:Fix the flaky test`,
      `codex:${REPO}/docs:Write the docs`,
      `codex:${REPO}:Add a CLI`,
    ]);
    const claude = found.find((session) => session.agent === "claude");
    expect(claude?.files).toEqual([
      join("projects", claudeProjectDir(`${REPO}/sub`), `${CLAUDE_ID}.jsonl`),
      join("projects", claudeProjectDir(`${REPO}/sub`), CLAUDE_ID, "subagents", "agent-1.jsonl"),
    ]);
    expect(found.at(-1)?.title).toBe("Write the docs");
  });

  test("finds one session by id, wherever it ran", () => {
    const stores = fixture();
    expect(findHostSession({ agent: "claude", id: CLAUDE_ID }, stores)?.cwd).toBe(`${REPO}/sub`);
    expect(findHostSession({ agent: "codex", id: CODEX_ID }, stores)?.transcript).toBe(
      join("sessions", "2026", "10", "17", `rollout-2026-10-17T10-00-00-${CODEX_ID}.jsonl`),
    );
    expect(findHostSession({ agent: "codex", id: "0199a213-81c0-7800-8aa1-ffffffffffff" }, stores)).toBeUndefined();
  });
});

test("resumeArgs continues the session, or a copy of it", () => {
  expect(resumeArgs({ agent: "claude", id: CLAUDE_ID }, false)).toEqual(["--resume", CLAUDE_ID]);
  expect(resumeArgs({ agent: "claude", id: CLAUDE_ID }, true)).toEqual(["--resume", CLAUDE_ID, "--fork-session"]);
  expect(resumeArgs({ agent: "codex", id: CODEX_ID }, false)).toEqual(["resume", CODEX_ID]);
  expect(resumeArgs({ agent: "codex", id: CODEX_ID }, true)).toEqual(["fork", CODEX_ID]);
});

test("writeBack keeps a differing laptop copy beside the new one", () => {
  const store = mkdtempSync(join(tmpdir(), "go-remote-back-"));
  const file = join("projects", "dir", `${CLAUDE_ID}.jsonl`);
  const bytes = (text: string) => new TextEncoder().encode(text);
  expect(writeBack(store, file, bytes("one\n"), "stamp")).toBe("new");
  expect(writeBack(store, file, bytes("one\n"), "stamp")).toBe("same");
  expect(writeBack(store, file, bytes("two\n"), "stamp")).toBe("updated");
  expect(readFileSync(join(store, file), "utf8")).toBe("two\n");
  expect(readFileSync(join(store, `${file}.go-remote-stamp.bak`), "utf8")).toBe("one\n");
  expect(existsSync(join(store, "projects", "dir"))).toBe(true);
});

test("writeBack refuses a path that leaves the store", () => {
  const store = mkdtempSync(join(tmpdir(), "go-remote-back-"));
  const bytes = new TextEncoder().encode("x\n");
  expect(() => writeBack(join(store, ".claude"), "projects/../../outside.jsonl", bytes, "stamp")).toThrow("outside");
  expect(() => writeBack(join(store, ".claude"), "..", bytes, "stamp")).toThrow("outside");
  expect(existsSync(join(store, "outside.jsonl"))).toBe(false);
});

test("writeBack refuses to write through a symlink under the store", () => {
  const root = mkdtempSync(join(tmpdir(), "go-remote-back-"));
  const store = join(root, ".claude");
  const outside = join(root, "outside");
  mkdirSync(join(store, "projects", "dir", CLAUDE_ID), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(outside, "result.txt"), "mine\n");
  symlinkSync(outside, join(store, "projects", "dir", CLAUDE_ID, "tool-results"));
  symlinkSync(join(outside, "new.jsonl"), join(store, "projects", "dir", "dangling.jsonl"));
  const bytes = new TextEncoder().encode("x\n");
  const toolResult = join("projects", "dir", CLAUDE_ID, "tool-results", "result.txt");
  expect(() => writeBack(store, toolResult, bytes, "stamp")).toThrow("not a plain directory");
  expect(() => writeBack(store, join("projects", "dir", "dangling.jsonl"), bytes, "stamp")).toThrow("not a plain file");
  expect(readFileSync(join(outside, "result.txt"), "utf8")).toBe("mine\n");
  expect(readdirSync(outside)).toEqual(["result.txt"]);
});

test("writeBack accepts a store that is itself a symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "go-remote-back-"));
  mkdirSync(join(root, "real"));
  symlinkSync(join(root, "real"), join(root, ".claude"));
  const file = join("projects", "dir", `${CLAUDE_ID}.jsonl`);
  expect(writeBack(join(root, ".claude"), file, new TextEncoder().encode("one\n"), "stamp")).toBe("new");
  expect(readFileSync(join(root, "real", file), "utf8")).toBe("one\n");
});
