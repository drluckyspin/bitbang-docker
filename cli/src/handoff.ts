/**
 * The container side of a handoff: copying sessions in, starting agents in Herdr panes, and finding what to
 * copy back. Files are written by the agent user through `docker exec`, which docker cp cannot do (it leaves
 * them owned by root, and the container has no capability to chown).
 */
import { CryptoHasher } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { capture, outputBytes } from "./proc.ts";
import { type AgentKind, claudeProjectDir, CONTAINER_STORES, isSessionId, type Session, type Stores, within } from "./sessions.ts";
import { hasControl, UserError } from "./ui.ts";
import { exec, herdr, type Workspace } from "./workspace.ts";

interface Pane {
  pane_id: string;
  workspace_id: string;
  cwd: string;
}

interface AgentInfo {
  name?: string;
  agent?: string;
  pane_id: string;
  agent_status: string;
  agent_session?: { value: string } | null;
}

export async function copyIn(workspace: Workspace, session: Session, stores: Stores): Promise<void> {
  const hostStore = stores[session.agent];
  const containerStore = CONTAINER_STORES[session.agent];
  for (const file of session.files) {
    await exec(workspace, ["sh", "-c", 'mkdir -p "$(dirname "$1")" && cat >"$1"', "sh", `${containerStore}/${file}`], {
      stdin: Bun.file(join(hostStore, file)),
    });
  }
}

/** Whether the container's agent CLI can run without stopping at a first-run or login screen. */
export async function agentReady(workspace: Workspace, agent: AgentKind): Promise<{ ok: boolean; reason?: string }> {
  const script = agent === "claude"
    ? '[ -n "$ANTHROPIC_API_KEY" ] || [ -f ~/.claude/.credentials.json ] || exit 3; jq -e ".hasCompletedOnboarding == true" ~/.claude.json >/dev/null 2>&1 || exit 4'
    : '[ -n "$OPENAI_API_KEY" ] || [ -f ~/.codex/auth.json ] || exit 3';
  const result = await capture(["docker", "exec", workspace.id, "bash", "-c", script]);
  if (result.code === 3) return { ok: false, reason: "it is not logged in yet" };
  if (result.code === 4) return { ok: false, reason: "its first-run setup has not been finished yet" };
  return { ok: result.code === 0 };
}

export async function panes(workspace: Workspace): Promise<Pane[]> {
  return (await herdr<{ panes: Pane[] }>(workspace, ["pane", "list"])).panes;
}

export async function agents(workspace: Workspace): Promise<AgentInfo[]> {
  return (await herdr<{ agents: AgentInfo[] }>(workspace, ["agent", "list"])).agents;
}

/** The repo's own pane: the one the entrypoint opened at the repo root. */
export async function mainPane(workspace: Workspace): Promise<Pane | undefined> {
  const all = await panes(workspace);
  return all.find((pane) => pane.cwd === workspace.repo) ?? all.find((pane) => within(pane.cwd, workspace.repo));
}

/**
 * Starts an agent in a new tab at `cwd`, so the repo's own shell stays as it was. Returns the agent's name,
 * its pane, and whether Herdr saw it come up ready for input.
 */
export async function startAgent(
  workspace: Workspace,
  agent: AgentKind,
  cwd: string,
  args: string[],
): Promise<{ name: string; pane: string; ready: boolean }> {
  const taken = new Set((await agents(workspace)).map((info) => info.name));
  let name: string = agent;
  for (let n = 2; taken.has(name); n++) name = `${agent}-${n}`;

  const home = await mainPane(workspace);
  const tab = await herdr<{ root_pane: { pane_id: string } }>(workspace, [
    "tab",
    "create",
    ...(home ? ["--workspace", home.workspace_id] : []),
    "--cwd",
    cwd,
    "--label",
    name,
    "--focus",
  ]);
  const pane = tab.root_pane.pane_id;
  const started = await capture([
    "docker",
    "exec",
    workspace.id,
    "herdr",
    "agent",
    "start",
    name,
    "--kind",
    agent,
    "--pane",
    pane,
    "--timeout",
    "90000",
    "--",
    ...args,
  ]);
  let ready = started.code === 0;
  try {
    ready = ready && !JSON.parse(started.stdout).error;
  } catch {
    ready = false;
  }
  return { name, pane, ready };
}

export async function prompt(workspace: Workspace, agent: string, text: string): Promise<void> {
  await herdr(workspace, ["agent", "prompt", agent, text]);
}

/** Session ids the container is still using: an agent Herdr tracks, or a process naming the id. */
export async function openSessions(workspace: Workspace): Promise<(id: string) => boolean> {
  const values = (await agents(workspace)).map((info) => info.agent_session?.value ?? "").filter(Boolean);
  const processes = (await capture(["docker", "exec", workspace.id, "ps", "-eo", "args="])).stdout;
  return (id) => values.some((value) => value.includes(id)) || processes.includes(id);
}

export interface ContainerFile {
  agent: AgentKind;
  /** relative to the agent's folder */
  file: string;
  sha256: string;
  modified: number;
  /** set on transcripts: the session's id and directory */
  id?: string;
  cwd?: string;
}

/**
 * One pass over the container's session folders for this repo. Claude's folders are picked by name and their
 * transcripts by the directory they record; Codex rollouts by the directory in their first line.
 */
const LIST_SCRIPT = String.raw`
set -u
repo="$1" prefix="$2"
emit() { printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$(sha256sum "$3" | cut -d' ' -f1)" "$(stat -c %Y "$3")" "$4" "$5"; }
cd /home/agent/.claude 2>/dev/null && for dir in projects/"$prefix" projects/"$prefix"-*; do
  [ -d "$dir" ] || continue
  find "$dir" -type f ! -name '*.bak' | while read -r file; do
    case "$file" in
      "$dir"/*/*) emit claude "$file" "$file" "" "" ;;
      *.jsonl)
        id="$(basename "$file" .jsonl)"
        cwd="$(head -n 50 "$file" | jq -r 'select(type == "object" and (.cwd | type) == "string") | .cwd' 2>/dev/null | head -n 1)"
        emit claude "$file" "$file" "$id" "$cwd" ;;
    esac
  done
done
cd /home/agent/.codex 2>/dev/null && find sessions -type f -name 'rollout-*.jsonl' 2>/dev/null | while read -r file; do
  meta="$(head -n 1 "$file" | jq -r 'select(.type == "session_meta") | [.payload.id, .payload.cwd] | @tsv' 2>/dev/null)"
  [ -n "$meta" ] || continue
  emit codex "$file" "$file" "$(printf '%s' "$meta" | cut -f1)" "$(printf '%s' "$meta" | cut -f2)"
done
exit 0
`;

export async function containerFiles(workspace: Workspace): Promise<ContainerFile[]> {
  const listing = await exec(workspace, ["sh", "-c", LIST_SCRIPT, "sh", workspace.repo, claudeProjectDir(workspace.repo)]);
  const files: ContainerFile[] = [];
  for (const line of listing.split("\n")) {
    const [agent, file, sha256, modified, id, cwd] = line.split("\t");
    if ((agent !== "claude" && agent !== "codex") || !file || !sha256) continue;
    files.push({ agent, file, sha256, modified: Number(modified) * 1000, id: id || undefined, cwd: cwd || undefined });
  }
  return files;
}

/**
 * Whether bbd pull may write a path the container listed onto the laptop: a plain relative path in the agent's
 * session folders for this repo. An agent in the container can name files so that the listing says anything.
 */
export function pullable(agent: AgentKind, file: string, repo: string): boolean {
  const parts = file.split("/");
  if (hasControl(file) || parts.some((part) => part === "" || part === "." || part === "..")) return false;
  if (agent === "codex") return parts[0] === "sessions" && parts.length >= 2 && /^rollout-.+\.jsonl(\.zst)?$/.test(parts.at(-1) ?? "");
  const prefix = claudeProjectDir(repo);
  const dir = parts[1] ?? "";
  return parts[0] === "projects" && parts.length >= 3 && (dir === prefix || dir.startsWith(`${prefix}-`));
}

/** Whether a listed transcript is the file its session id names, so one session cannot claim another's. */
function namesSession(file: ContainerFile, id: string): boolean {
  const parts = file.file.split("/");
  const name = parts.at(-1) ?? "";
  if (file.agent === "claude") return parts.length === 3 && name === `${id}.jsonl`;
  return name.endsWith(`-${id}.jsonl`) || name.endsWith(`-${id}.jsonl.zst`);
}

/** Container sessions for this repo, each with every file that belongs to it. */
export function groupSessions(files: ContainerFile[], repo: string): Array<{ agent: AgentKind; id: string; cwd: string; files: ContainerFile[] }> {
  const sessions = new Map<string, { agent: AgentKind; id: string; cwd: string; files: ContainerFile[] }>();
  for (const file of files) {
    const { id, cwd } = file;
    if (!id || !cwd || !isSessionId(id) || hasControl(cwd) || !within(cwd, repo)) continue;
    if (!pullable(file.agent, file.file, repo) || !namesSession(file, id)) continue;
    sessions.set(`${file.agent}:${id}`, { agent: file.agent, id, cwd, files: [file] });
  }
  for (const file of files) {
    if (file.agent !== "claude" || file.id || !pullable("claude", file.file, repo)) continue;
    // projects/<dir>/<id>/... belongs to projects/<dir>/<id>.jsonl
    const [, dir, id, ...inside] = file.file.split("/");
    const session = id && inside.length > 0 ? sessions.get(`claude:${id}`) : undefined;
    if (session && session.files[0]?.file === `projects/${dir}/${id}.jsonl`) session.files.push(file);
  }
  return [...sessions.values()];
}

export function hostSha256(store: string, file: string): string | undefined {
  const path = join(store, file);
  if (!existsSync(path)) return undefined;
  return new CryptoHasher("sha256").update(readFileSync(path)).digest("hex");
}

export async function fetchFile(workspace: Workspace, agent: AgentKind, file: string): Promise<Uint8Array> {
  return outputBytes(["docker", "exec", workspace.id, "cat", `${CONTAINER_STORES[agent]}/${file}`]);
}

export function requireWeb(workspace: Workspace, what: string): void {
  if (workspace.ui !== "web") {
    throw new UserError(`${what} needs the web mode`, "This workspace runs with BBD_UI=shell; set BBD_UI=web in .env and start it again.");
  }
}
