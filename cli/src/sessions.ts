/**
 * Agent sessions on the laptop and in a workspace: finding them, copying them in (go-remote start --resume) and back
 * out (go-remote pull). The repo has the same path on both sides, so transcripts need no rewriting: Claude Code keys
 * its project folder on the directory a session ran in, and Codex records that directory in the rollout.
 *
 * Files keep their path relative to the agent's own folder (~/.claude, ~/.codex) on both sides.
 */
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { printable, UserError } from "./ui.ts";

/** An agent available in the container. Cursor sessions cannot yet be moved between the laptop and container. */
export type AgentKind = "claude" | "codex" | "cursor";
/** An agent whose transcript format go-remote knows how to copy, resume and pull. */
export type SessionAgentKind = Exclude<AgentKind, "cursor">;

export const AGENT_NAMES: Record<AgentKind, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" };

export interface SessionRef {
  agent: SessionAgentKind;
  id: string;
}

export interface Session extends SessionRef {
  /** the transcript, relative to the agent's folder */
  transcript: string;
  /** the transcript and what is stored beside it (Claude's subagent transcripts and tool results) */
  files: string[];
  /** the directory the session ran in */
  cwd?: string;
  modified: number;
  /** the first thing the user asked, cut short */
  title?: string;
}

export interface Stores {
  claude: string;
  codex: string;
}

export function hostStores(): Stores {
  return {
    claude: process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
    codex: process.env.CODEX_HOME || join(homedir(), ".codex"),
  };
}

export const CONTAINER_STORES: Stores = { claude: "/home/agent/.claude", codex: "/home/agent/.codex" };

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEAD_BYTES = 256 * 1024;

export function isSessionId(text: string): boolean {
  return SESSION_ID.test(text);
}

export function parseSessionRef(text: string): SessionRef {
  const match = /^(claude|codex):(.+)$/.exec(text.trim());
  const id = match?.[2];
  if (!match || !id || !SESSION_ID.test(id)) {
    throw new UserError(`Not a session: ${text}`, "Use claude:<session id> or codex:<session id>; go-remote sessions lists them.");
  }
  return { agent: match[1] as SessionAgentKind, id: id.toLowerCase() };
}

/** Claude Code's folder name for a directory: every character that is not a letter or digit becomes a dash. */
export function claudeProjectDir(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, "-");
}

export function within(path: string, repo: string): boolean {
  return path === repo || path.startsWith(`${repo}/`);
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function isDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** The first lines of a transcript: whole for a compressed rollout, else what fits in the first 256 kB. */
export function headLines(path: string): string[] {
  if (path.endsWith(".zst")) return new TextDecoder().decode(Bun.zstdDecompressSync(readFileSync(path))).split("\n").filter(Boolean);
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const read = readSync(fd, buffer, 0, HEAD_BYTES, 0);
    const lines = buffer.subarray(0, read).toString("utf8").split("\n");
    if (read === HEAD_BYTES) lines.pop();
    return lines.filter(Boolean);
  } finally {
    closeSync(fd);
  }
}

function parse(line: string): Record<string, any> | undefined {
  try {
    const value = JSON.parse(line);
    return typeof value === "object" && value !== null ? value : undefined;
  } catch {
    return undefined;
  }
}

function shorten(text: string): string | undefined {
  const flat = printable(text.replace(/\s+/g, " ")).trim();
  // wrappers the CLIs add around commands, environment context and instructions
  if (flat === "" || flat.startsWith("<") || flat.startsWith("Caveat:")) return undefined;
  return flat.length > 72 ? `${flat.slice(0, 71)}…` : flat;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && (part.type === "text" || part.type === "input_text") && typeof part.text === "string")
    .map((part) => part.text)
    .join(" ");
}

function claudeTitle(entry: Record<string, any>): string | undefined {
  if (entry.type !== "user" || entry.isMeta || entry.message?.role !== "user") return undefined;
  return shorten(textOf(entry.message.content));
}

function codexTitle(entry: Record<string, any> | undefined): string | undefined {
  if (entry?.type === "event_msg" && entry.payload?.type === "user_message") return shorten(String(entry.payload.message ?? ""));
  if (entry?.type === "response_item" && entry.payload?.type === "message" && entry.payload.role === "user") {
    return shorten(textOf(entry.payload.content));
  }
  return undefined;
}

/** Reads one Claude transcript's metadata from lines of it; `files` and `modified` come from the caller. */
export function describeClaude(id: string, lines: string[]): Pick<Session, "cwd" | "title"> {
  let cwd: string | undefined;
  let title: string | undefined;
  for (const line of lines) {
    const entry = parse(line);
    if (!entry || (entry.sessionId !== undefined && entry.sessionId !== id)) continue;
    if (cwd === undefined && typeof entry.cwd === "string") cwd = entry.cwd;
    title ??= claudeTitle(entry);
    if (cwd !== undefined && title !== undefined) break;
  }
  return { cwd, title };
}

/** Reads a Codex rollout's id, directory and first prompt from its lines; undefined if it is not a rollout. */
export function describeCodex(lines: string[]): Pick<Session, "id" | "cwd" | "title"> | undefined {
  const meta = parse(lines[0] ?? "");
  if (meta?.type !== "session_meta" || typeof meta.payload?.id !== "string") return undefined;
  let title: string | undefined;
  for (const line of lines.slice(1)) {
    title = codexTitle(parse(line));
    if (title) break;
  }
  return { id: meta.payload.id, cwd: typeof meta.payload.cwd === "string" ? meta.payload.cwd : undefined, title };
}

function claudeSession(store: string, dir: string, id: string): Session {
  const transcript = join("projects", dir, `${id}.jsonl`);
  const path = join(store, transcript);
  const files = [transcript];
  const beside = join(store, "projects", dir, id);
  if (isDirectory(beside)) files.push(...walk(beside).map((file) => relative(store, file)));
  return { agent: "claude", id, transcript, files, modified: lstatSync(path).mtimeMs, ...describeClaude(id, headLines(path)) };
}

function claudeDirs(store: string): string[] {
  const projects = join(store, "projects");
  return isDirectory(projects) ? readdirSync(projects).filter((dir) => isDirectory(join(projects, dir))) : [];
}

function codexRollouts(store: string): string[] {
  const root = join(store, "sessions");
  if (!isDirectory(root)) return [];
  return walk(root)
    .filter((file) => /^rollout-.+\.jsonl(\.zst)?$/.test(file.split(sep).at(-1) ?? ""))
    .map((file) => relative(store, file));
}

function codexSession(store: string, transcript: string): Session | undefined {
  const path = join(store, transcript);
  const described = describeCodex(headLines(path));
  if (!described) return undefined;
  return { agent: "codex", transcript, files: [transcript], modified: lstatSync(path).mtimeMs, ...described };
}

/** Sessions on the laptop that ran in the repo or a directory inside it, newest first. */
export function hostSessions(repo: string, stores = hostStores()): Session[] {
  const sessions: Session[] = [];
  const prefix = claudeProjectDir(repo);
  for (const dir of claudeDirs(stores.claude)) {
    // a sibling such as my-repo-old has the same prefix, so the transcript's own directory decides
    if (dir !== prefix && !dir.startsWith(`${prefix}-`)) continue;
    for (const file of readdirSync(join(stores.claude, "projects", dir))) {
      const id = file.endsWith(".jsonl") ? file.slice(0, -".jsonl".length) : "";
      if (!SESSION_ID.test(id)) continue;
      const session = claudeSession(stores.claude, dir, id);
      if (session.cwd && within(session.cwd, repo)) sessions.push(session);
    }
  }
  for (const transcript of codexRollouts(stores.codex)) {
    const session = codexSession(stores.codex, transcript);
    if (session?.cwd && within(session.cwd, repo)) sessions.push(session);
  }
  return sessions.sort((a, b) => b.modified - a.modified);
}

/** One session on the laptop, by agent and id. */
export function findHostSession(ref: SessionRef, stores = hostStores()): Session | undefined {
  if (ref.agent === "claude") {
    const found = claudeDirs(stores.claude)
      .filter((dir) => existsSync(join(stores.claude, "projects", dir, `${ref.id}.jsonl`)))
      .map((dir) => claudeSession(stores.claude, dir, ref.id));
    return found.sort((a, b) => b.modified - a.modified)[0];
  }
  const transcript = codexRollouts(stores.codex).find((file) => /-(?<id>[0-9a-f-]{36})\.jsonl(\.zst)?$/.exec(file)?.groups?.id === ref.id);
  return transcript ? codexSession(stores.codex, transcript) : undefined;
}

/** The command line, after the agent's own executable, that continues a session (or a copy of it). */
export function resumeArgs(ref: SessionRef, fork: boolean): string[] {
  if (ref.agent === "claude") return fork ? ["--resume", ref.id, "--fork-session"] : ["--resume", ref.id];
  return fork ? ["fork", ref.id] : ["resume", ref.id];
}

/** Writes a file that came back from the container, keeping a differing laptop copy beside it. */
export function writeBack(store: string, file: string, bytes: Uint8Array, stamp: string): "new" | "updated" | "same" {
  const path = join(store, file);
  const inside = relative(store, path);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`Refusing to write outside ${store}: ${file}`);
  }
  let state: "new" | "updated" = "new";
  if (existsSync(path)) {
    if (Buffer.from(readFileSync(path)).equals(Buffer.from(bytes))) return "same";
    renameSync(path, `${path}.go-remote-${stamp}.bak`);
    state = "updated";
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, bytes, { mode: 0o600 });
  return state;
}
