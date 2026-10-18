/**
 * Moving an agent session into its workspace from inside the session. An agent that runs bbd start --resume
 * on its own session is still in the turn that ran it, so the session is copied once that turn has ended, by
 * a helper bbd leaves running in the background. The helper ends the laptop's copy first, so the session
 * never has two writers, then resumes it in the container and opens the QR code in a window.
 */
import { spawn } from "node:child_process";
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { stateDir } from "./config.ts";
import { checkCopyIn, copyIn, prompt, startAgent } from "./handoff.ts";
import { keepAwake } from "./host.ts";
import { showLink } from "./present.ts";
import { capture } from "./proc.ts";
import {
  AGENT_NAMES,
  type SessionAgentKind,
  findHostSession,
  hostStores,
  resumeArgs,
  type Session,
  type SessionRef,
} from "./sessions.ts";
import { ui, UserError } from "./ui.ts";
import { listWorkspaces, waitForListener } from "./workspace.ts";

const TAIL_BYTES = 1024 * 1024;
/** How long the transcript must have been still before the turn counts as over. */
const QUIET_MS = 1500;
const TURN_TIMEOUT_MS = 10 * 60_000;
const EXIT_TIMEOUT_MS = 10_000;

export interface MovePlan {
  root: string;
  project: string;
  repo: string;
  ref: SessionRef;
  /** the transcript, relative to the agent's folder */
  transcript: string;
  /** the agent process the session is open in, ended once its turn is over */
  agent?: AgentProcess;
  brief?: string;
  window: boolean;
}

export interface AgentProcess {
  pid: number;
  args: string;
  /** its terminal, e.g. ttys003 or pts/3, told how the move went */
  tty?: string;
}

/** Whether a session's last turn is over, from the end of its transcript. */
export function turnEnded(agent: SessionAgentKind, lines: string[]): boolean {
  let message = -1;
  let end = -1;
  let finalReply = false;
  for (const [index, line] of lines.entries()) {
    let entry: { type?: string; subtype?: string; payload?: { type?: string }; message?: { stop_reason?: string } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (agent === "claude") {
      if (entry.type === "user" || entry.type === "assistant") {
        message = index;
        finalReply = entry.type === "assistant" && entry.message?.stop_reason === "end_turn";
      } else if (entry.type === "system" && entry.subtype === "turn_duration") {
        end = index;
      }
    } else if (entry.type === "response_item") {
      message = index;
    } else if (entry.type === "event_msg" && (entry.payload?.type === "task_complete" || entry.payload?.type === "turn_aborted")) {
      end = index;
    }
  }
  return end > message || finalReply;
}

/** The last lines of a transcript, up to the last megabyte. */
export function tailLines(path: string): string[] {
  if (path.endsWith(".zst")) return [];
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buffer = Buffer.alloc(size - start);
    const read = readSync(fd, buffer, 0, buffer.length, start);
    const lines = buffer.subarray(0, read).toString("utf8").split("\n");
    if (start > 0) lines.shift();
    return lines.filter(Boolean);
  } finally {
    closeSync(fd);
  }
}

function transcriptPath(session: Pick<Session, "agent" | "transcript">): string {
  return join(hostStores()[session.agent], session.transcript);
}

/** A session still in the turn that is running bbd: its transcript changed just now and the turn is not over. */
export function inTurn(session: Session, recentMs: number): boolean {
  if (Date.now() - session.modified >= recentMs) return false;
  return !turnEnded(session.agent, tailLines(transcriptPath(session)));
}

export function isAgentCommand(agent: SessionAgentKind, args: string): boolean {
  return args
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .some((word) => basename(word) === agent || (agent === "claude" ? /claude-code\/cli\.m?js$/ : /codex\.m?js$/).test(word));
}

interface ProcessRow {
  ppid: number;
  tty: string;
  args: string;
}

export function parseProcessTable(text: string): Map<number, ProcessRow> {
  const rows = new Map<number, ProcessRow>();
  for (const line of text.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (match) rows.set(Number(match[1]), { ppid: Number(match[2]), tty: match[3] ?? "", args: match[4] ?? "" });
  }
  return rows;
}

/** The nearest process above `pid` that is the agent itself. */
export function agentAbove(rows: Map<number, ProcessRow>, pid: number, agent: SessionAgentKind): AgentProcess | undefined {
  for (let current = rows.get(pid)?.ppid, depth = 0; current && current > 1 && depth < 32; depth++) {
    const row = rows.get(current);
    if (!row) return undefined;
    if (isAgentCommand(agent, row.args)) {
      return { pid: current, args: row.args, ...(/^(ttys?\d+|pts\/\d+)$/.test(row.tty) ? { tty: row.tty } : {}) };
    }
    current = row.ppid;
  }
  return undefined;
}

async function processTable(): Promise<Map<number, ProcessRow>> {
  return parseProcessTable((await capture(["ps", "-A", "-o", "pid=,ppid=,tty=,args="])).stdout);
}

/** The agent this bbd runs under, when an agent ran it. */
export async function callingAgent(agent: SessionAgentKind): Promise<AgentProcess | undefined> {
  return agentAbove(await processTable(), process.pid, agent);
}

function lockFile(ref: SessionRef): string {
  return join(stateDir(), `move-${ref.agent}-${ref.id}.pid`);
}

export function logFile(ref: SessionRef): string {
  return join(stateDir(), `move-${ref.agent}-${ref.id}.log`);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Whether a move of this session is already waiting for its turn to end. */
export function movePending(ref: SessionRef): boolean {
  try {
    return alive(Number(readFileSync(lockFile(ref), "utf8")));
  } catch {
    return false;
  }
}

/** The command line that runs this bbd again, compiled or from source. */
function self(args: string[]): string[] {
  return Bun.main.startsWith("/$bunfs/") ? [process.execPath, ...args] : [process.execPath, Bun.main, ...args];
}

/** Leaves the helper running in the background, in its own session so the agent's tool cannot take it down. */
export function spawnMove(plan: MovePlan): string {
  mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  const log = logFile(plan.ref);
  const fd = openSync(log, "a", 0o600);
  const [command = "", ...args] = self(["__move", JSON.stringify(plan)]);
  const child = spawn(command, args, { detached: true, stdio: ["ignore", fd, fd], env: { ...process.env, NO_COLOR: "1" } });
  closeSync(fd);
  if (child.pid) writeFileSync(lockFile(plan.ref), String(child.pid), { mode: 0o600 });
  child.unref();
  return log;
}

/** A line on the terminal the agent ran in, once the agent has left it: never over the agent's own screen. */
function tell(agent: AgentProcess | undefined, message: string): void {
  if (!agent?.tty || alive(agent.pid)) return;
  try {
    const fd = openSync(`/dev/${agent.tty}`, "a");
    writeFileSync(fd, `\r\n${message}\r\n`);
    closeSync(fd);
  } catch {
    // the terminal is gone
  }
}

async function waitForTurn(plan: MovePlan): Promise<void> {
  const path = join(hostStores()[plan.ref.agent], plan.transcript);
  const deadline = Date.now() + TURN_TIMEOUT_MS;
  for (;;) {
    const quiet = Date.now() - statSync(path).mtimeMs >= QUIET_MS;
    const gone = plan.agent !== undefined && !alive(plan.agent.pid);
    if (quiet && (gone || turnEnded(plan.ref.agent, tailLines(path)))) return;
    if (Date.now() > deadline) throw new UserError("the turn that started the move did not end within ten minutes");
    await Bun.sleep(500);
  }
}

/** Ends the laptop's copy of the session, if it is still the process that started the move. */
async function endLaptopCopy(agent: AgentProcess | undefined): Promise<void> {
  if (!agent || !alive(agent.pid)) return;
  if ((await processTable()).get(agent.pid)?.args !== agent.args) return;
  process.kill(agent.pid, "SIGTERM");
  const deadline = Date.now() + EXIT_TIMEOUT_MS;
  while (alive(agent.pid)) {
    if (Date.now() > deadline) throw new UserError("the session on this computer did not close, so it was not moved");
    await Bun.sleep(200);
  }
}

/** The helper: waits for the turn, ends the laptop's copy, resumes the session in the workspace, shows the QR code. */
export async function finishMove(plan: MovePlan): Promise<void> {
  const name = AGENT_NAMES[plan.ref.agent];
  const resume = plan.ref.agent === "claude" ? `claude --resume ${plan.ref.id}` : `codex resume ${plan.ref.id}`;
  ui.info(`${new Date().toISOString()} moving ${plan.ref.agent}:${plan.ref.id} to ${plan.project}`);
  try {
    await waitForTurn(plan);
    ui.info("The turn has ended");
    const workspace = (await listWorkspaces()).find((candidate) => candidate.project === plan.project && candidate.state === "running");
    if (!workspace) throw new UserError(`${plan.project} is not running`);
    const ended = findHostSession(plan.ref);
    if (!ended) throw new UserError(`the session's transcript is gone from this computer`);
    await checkCopyIn(workspace, ended, hostStores());
    await endLaptopCopy(plan.agent);
    // The agent may write a last line as it exits, so the files are listed again.
    const session = findHostSession(plan.ref) ?? ended;
    await copyIn(workspace, session, hostStores());
    const started = await startAgent(workspace, plan.ref.agent, session.cwd ?? plan.repo, resumeArgs(plan.ref, false));
    if (!started.ready) ui.warn(`${name} was started in the ${started.tab} tab but is not ready for input yet`);
    if (plan.brief) await prompt(workspace, started.name, `Read ${plan.brief} and continue the work it describes.`);
    const url = await waitForListener(workspace);
    await keepAwake(workspace.id);
    const shown = await showLink(workspace, url, { pane: started.pane, view: "chat" }, { json: true, qr: false, window: plan.window });
    ui.success(`${name} resumed the session in the ${started.tab} tab; QR code: ${shown.qr}`);
    tell(
      plan.agent,
      shown.qr === "window"
        ? `bbd: this session now runs in ${plan.project}. Scan the QR code in the window to carry on from your phone; bbd pull brings it back here.`
        : `bbd: this session now runs in ${plan.project}. bbd qr ${plan.repo} shows the QR code; bbd pull brings the session back here.`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    ui.error(`The move failed: ${reason}`);
    tell(plan.agent, `bbd could not move the session: ${reason}. It is unchanged on this computer: ${resume}`);
    process.exitCode = 1;
  } finally {
    try {
      if (existsSync(lockFile(plan.ref)) && readFileSync(lockFile(plan.ref), "utf8") === String(process.pid)) unlinkSync(lockFile(plan.ref));
    } catch {
      // already gone
    }
  }
}
