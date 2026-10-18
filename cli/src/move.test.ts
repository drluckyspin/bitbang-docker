import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentAbove, isAgentCommand, openHere, otherSession, parseProcessTable, tailLines, turnEnded } from "./move.ts";

function jsonl(...entries: object[]): string[] {
  return entries.map((entry) => JSON.stringify(entry));
}

const claudeTurn = [
  { type: "user", message: { role: "user", content: "Fix the bug" } },
  { type: "assistant", message: { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "Done." }] } },
  { type: "system", subtype: "turn_duration", durationMs: 900 },
  { type: "last-prompt", lastPrompt: "Fix the bug" },
];

describe("turnEnded", () => {
  test("Claude Code: a turn ends with its turn_duration record", () => {
    expect(turnEnded("claude", jsonl(...claudeTurn))).toBe(true);
  });

  test("Claude Code: a tool call after the last turn_duration is a turn still running", () => {
    const running = jsonl(
      ...claudeTurn,
      { type: "user", message: { role: "user", content: "/go-remote" } },
      { type: "assistant", message: { role: "assistant", stop_reason: "tool_use", content: [{ type: "tool_use", name: "Bash" }] } },
    );
    expect(turnEnded("claude", running)).toBe(false);
    expect(turnEnded("claude", [...running, ...jsonl({ type: "user", message: { role: "user", content: [{ type: "tool_result" }] } })])).toBe(false);
  });

  test("Claude Code: a final reply counts before its turn_duration is written", () => {
    expect(turnEnded("claude", jsonl(claudeTurn[0]!, claudeTurn[1]!))).toBe(true);
  });

  test("Codex: a turn ends with task_complete", () => {
    const turn = jsonl(
      { type: "response_item", payload: { type: "message", role: "user" } },
      { type: "response_item", payload: { type: "function_call" } },
      { type: "event_msg", payload: { type: "token_count" } },
      { type: "event_msg", payload: { type: "task_complete" } },
    );
    expect(turnEnded("codex", turn)).toBe(true);
    expect(turnEnded("codex", [...turn, ...jsonl({ type: "response_item", payload: { type: "function_call" } })])).toBe(false);
  });

  test("ignores lines that are not JSON", () => {
    expect(turnEnded("claude", ["{partial", ...jsonl(...claudeTurn)])).toBe(true);
  });
});

describe("tailLines", () => {
  test("drops the partial line a long transcript's last megabyte starts in", () => {
    const file = join(mkdtempSync(join(tmpdir(), "go-remote-tail-")), "t.jsonl");
    writeFileSync(file, `${JSON.stringify({ pad: "x".repeat(1024 * 1024) })}\n${JSON.stringify({ type: "last" })}\n`);
    expect(tailLines(file)).toEqual([JSON.stringify({ type: "last" })]);
  });
});

describe("the agent go-remote runs under", () => {
  test("recognises the agents' own command lines", () => {
    expect(isAgentCommand("claude", "/opt/homebrew/Caskroom/claude-code/2.1.286/claude --resume x")).toBe(true);
    expect(isAgentCommand("claude", "node /usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js")).toBe(true);
    expect(isAgentCommand("claude", "/bin/zsh -c -l source /tmp/claude-shell-snapshot")).toBe(false);
    expect(isAgentCommand("codex", "/Users/me/.npm/vendor/aarch64-apple-darwin/codex/codex")).toBe(true);
    expect(isAgentCommand("codex", "go-remote start --resume codex:x")).toBe(false);
  });

  const table = parseProcessTable(
    [
      "  100    90 ttys003  go-remote start /repo --json --resume claude:x",
      "   90    80 ttys003  /bin/zsh -c -l eval 'go-remote start'",
      "   80    70 ttys003  /opt/homebrew/bin/claude",
      "   70     1 ttys003  -zsh",
      "  200     1 ??       go-remote start /repo",
    ].join("\n"),
  );

  test("walks up from go-remote to the agent, and takes its terminal", () => {
    expect(agentAbove(table, 100, "claude")).toEqual({ pid: 80, args: "/opt/homebrew/bin/claude", tty: "ttys003" });
  });

  test("finds none when no agent ran go-remote", () => {
    expect(agentAbove(table, 100, "codex")).toBeUndefined();
    expect(agentAbove(table, 200, "claude")).toBeUndefined();
  });

  test("knows when the agent is running a different session from the one being moved", () => {
    const ref = { agent: "claude", id: "a1" } as const;
    expect(otherSession(ref, { CLAUDE_CODE_SESSION_ID: "b2" })).toBe("b2");
    expect(otherSession(ref, { CLAUDE_CODE_SESSION_ID: "a1" })).toBeUndefined();
    expect(otherSession(ref, { CODEX_THREAD_ID: "b2" })).toBeUndefined();
    expect(otherSession({ agent: "codex", id: "c3" }, { CODEX_THREAD_ID: "d4" })).toBe("d4");
    expect(otherSession(ref, {})).toBeUndefined();
  });

  test("sees a session open here when an agent's command line names it, or go-remote runs inside it", () => {
    const ref = { agent: "claude", id: "0b6f7a4e-3c1d-4e8f-9a2b-1c3d5e7f9a0b" } as const;
    const rows = (args: string) => parseProcessTable(`  300     1 ttys004  ${args}`);
    expect(openHere(rows(`/opt/homebrew/bin/claude --resume ${ref.id}`), ref, {})).toBe(true);
    expect(openHere(rows("/opt/homebrew/bin/claude"), ref, {})).toBe(false);
    expect(openHere(rows(`go-remote pull /repo claude:${ref.id}`), ref, {})).toBe(false);
    expect(openHere(rows(`codex resume ${ref.id}`), ref, {})).toBe(false);
    expect(openHere(rows("/opt/homebrew/bin/claude"), ref, { CLAUDE_CODE_SESSION_ID: ref.id })).toBe(true);
    expect(openHere(rows(`codex resume ${ref.id}`), { agent: "codex", id: ref.id }, {})).toBe(true);
  });
});
