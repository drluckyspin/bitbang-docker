import { describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentInfo, agentLabel, alertsBetween, herdrRequest, ntfyMessage, publish, QUIET_MS, throttle } from "./alerts.ts";

const agent = (status: AgentInfo["agent_status"], extra: Partial<AgentInfo> = {}): AgentInfo => ({
  pane_id: "w1:p1",
  agent: "claude",
  agent_status: status,
  completion_seq: 1,
  ...extra,
});

const before = (info: AgentInfo) => new Map([[info.pane_id, info]]);

describe("alertsBetween", () => {
  test("an agent that becomes blocked needs you", () => {
    const [alert] = alertsBetween(before(agent("working")), [agent("blocked")], "my-repo");
    expect(alert).toEqual({
      paneId: "w1:p1",
      kind: "blocked",
      title: "Claude Code needs you",
      message: "my-repo: waiting for an answer or an approval",
    });
  });

  test("a finished turn is reported once the agent is ready again", () => {
    const alerts = alertsBetween(before(agent("working")), [agent("done", { completion_seq: 2 })], "my-repo");
    expect(alerts.map((alert) => alert.title)).toEqual(["Claude Code finished"]);
    expect(alertsBetween(before(agent("working")), [agent("idle", { completion_seq: 2 })], "r")).toHaveLength(1);
  });

  test("working to done finishes a turn even without a completion counter", () => {
    const alerts = alertsBetween(
      before(agent("working", { completion_seq: null })),
      [agent("done", { completion_seq: null })],
      "r",
    );
    expect(alerts).toHaveLength(1);
  });

  test("nothing new, nothing sent", () => {
    expect(alertsBetween(before(agent("blocked")), [agent("blocked")], "r")).toEqual([]);
    expect(alertsBetween(before(agent("idle")), [agent("idle")], "r")).toEqual([]);
    expect(alertsBetween(before(agent("idle")), [agent("working")], "r")).toEqual([]);
  });

  test("an agent seen for the first time raises nothing, so a restart repeats no old news", () => {
    expect(alertsBetween(new Map(), [agent("blocked")], "r")).toEqual([]);
  });

  test("alerts carry no pane output", () => {
    const [alert] = alertsBetween(before(agent("working")), [agent("blocked", { name: "reviewer" })], "r");
    expect(Object.keys(ntfyMessage(alert!, "topic")).sort()).toEqual(["message", "priority", "tags", "title", "topic"]);
  });
});

test("agentLabel prefers what Herdr displays, and names known agents", () => {
  expect(agentLabel(agent("idle"))).toBe("Claude Code");
  expect(agentLabel(agent("idle", { agent: "codex" }))).toBe("Codex");
  expect(agentLabel(agent("idle", { name: "reviewer" }))).toBe("reviewer");
  expect(agentLabel(agent("idle", { agent: null }))).toBe("An agent");
});

test("throttle sends one alert per pane and kind in the quiet window", () => {
  const lastSent = new Map<string, number>();
  const [alert] = alertsBetween(before(agent("working")), [agent("blocked")], "r");
  expect(throttle([alert!], lastSent, 1000)).toHaveLength(1);
  expect(throttle([alert!], lastSent, 1000 + QUIET_MS - 1)).toHaveLength(0);
  expect(throttle([alert!], lastSent, 1000 + QUIET_MS)).toHaveLength(1);
});

test("herdrRequest speaks newline-delimited JSON", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "go-remote-alerts-")), "herdr.sock");
  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    socket.on("data", (line: string) => {
      const request = JSON.parse(line);
      socket.write(`${JSON.stringify({ id: request.id, result: { type: "agent_list", agents: [agent("idle")] } })}\n`);
    });
  });
  await new Promise<void>((resolve) => server.listen(path, resolve));
  try {
    const result = await herdrRequest<{ agents: AgentInfo[] }>(path, "agent.list");
    expect(result.agents[0]!.pane_id).toBe("w1:p1");
  } finally {
    server.close();
  }
});

test("herdrRequest fails when Herdr closes the connection without a whole answer", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "go-remote-alerts-")), "herdr.sock");
  const server = createServer((socket) => {
    socket.on("data", () => socket.end('{"id":"go-remote-alerts","result":'));
  });
  await new Promise<void>((resolve) => server.listen(path, resolve));
  try {
    await expect(herdrRequest(path, "agent.list")).rejects.toThrow("closed the connection");
  } finally {
    server.close();
  }
});

test("publish gives up on an ntfy server that never answers", async () => {
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Promise<Response>(() => {}) });
  const alert = { paneId: "p1", kind: "finished", title: "Codex finished", message: "repo: ready" } as const;
  try {
    const started = Date.now();
    await expect(publish(alert, `http://127.0.0.1:${server.port}`, "topic", undefined, 200)).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
  } finally {
    server.stop(true);
  }
});
