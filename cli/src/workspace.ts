/**
 * Workspaces: one compose project per repo, named bbd-<repo directory>, whose container is labelled with the
 * repo's path. The container mounts the repo at that same path.
 */
import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { capture, inherit, output, type RunOptions } from "./proc.ts";
import { UserError } from "./ui.ts";

export const IMAGE = "go-remote:latest";
export const REPO_LABEL = "go-remote.repo";

/**
 * Container paths a repo mounted at its host path must not cover or land inside: the image's own files, the
 * home volume, the runtime directories in /tmp, and the /workspace link.
 */
export const RESERVED_PATHS = [
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/home/agent",
  "/lib",
  "/lib32",
  "/lib64",
  "/libx32",
  "/opt",
  "/proc",
  "/root",
  "/run",
  "/sbin",
  "/sys",
  "/tmp/bbd",
  "/tmp/bitbang",
  "/usr",
  "/workspace",
];

/** The reserved path a repo at `path` would cover or land inside, if any. */
export function reservedConflict(path: string): string | undefined {
  return RESERVED_PATHS.find((reserved) => path === reserved || path.startsWith(`${reserved}/`) || reserved.startsWith(`${path}/`));
}

/**
 * bbd-<repo directory name>, as Common.make's bbd_project computes it with tr: ASCII letters lowercased,
 * then every byte outside [a-z0-9_-] becomes a dash.
 */
export function projectName(repo: string): string {
  const bytes = new TextEncoder().encode(basename(repo).replace(/[A-Z]/g, (letter) => letter.toLowerCase()));
  let name = "";
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    name += /[a-z0-9_-]/.test(char) ? char : "-";
  }
  return `bbd-${name}`;
}

export interface Workspace {
  id: string;
  project: string;
  repo: string;
  state: string;
  health: string;
  ui: "web" | "shell";
  /** the .env it was given, as compose was told it (relative to the checkout, unless absolute) */
  envFile?: string;
}

/** The entrypoint's reading of GR_UI. Compose always sets it; images from before the web mode never had it. */
export function uiMode(env: string[]): Workspace["ui"] {
  const value = env.find((entry) => entry.startsWith("GR_UI="))?.slice("GR_UI=".length);
  if (value === undefined) return "shell";
  return value.toLowerCase() === "shell" ? "shell" : "web";
}

/** Resolves a repo path for mounting, or explains why it cannot be mounted. */
export function resolveRepo(input: string): { path: string; isGit: boolean } {
  const expanded = input.replace(/^~(?=$|\/)/, homedir());
  let path: string;
  try {
    path = realpathSync(expanded);
  } catch {
    throw new UserError(`${input} does not exist`);
  }
  if (!statSync(path).isDirectory()) throw new UserError(`${path} is not a directory`);
  if (path === "/" || path === realpathSync(homedir())) {
    throw new UserError(`Refusing to mount ${path}`, "Point bbd at a single repository.");
  }
  const reserved = reservedConflict(path);
  if (reserved) {
    throw new UserError(
      `Refusing to mount ${path}: the repo is mounted at its own path, which would collide with the container's ${reserved}`,
      "Move or clone the repo somewhere else, e.g. under your home directory.",
    );
  }
  const git = join(path, ".git");
  if (existsSync(git) && statSync(git).isFile()) {
    throw new UserError(
      `${path} is a git worktree or submodule`,
      "Its .git points outside the mount, so start the main checkout instead.",
    );
  }
  return { path, isGit: existsSync(git) };
}

export async function docker(args: string[], options?: RunOptions): Promise<string> {
  return output(["docker", ...args], options);
}

export async function checkDocker(): Promise<void> {
  const info = await capture(["docker", "info", "--format", "{{.ServerVersion}}"]);
  if (info.code === 127) throw new UserError("Docker is not installed");
  if (info.code !== 0) throw new UserError("The Docker daemon is not running", "Start Docker Desktop (or dockerd) and retry.");
  if ((await capture(["docker", "compose", "version"])).code !== 0) {
    throw new UserError("Docker Compose v2 ('docker compose') is required");
  }
}

/** The image's labels, which carry the versions it pins; undefined when it has not been built. */
export async function imageLabels(): Promise<Record<string, string> | undefined> {
  const result = await capture(["docker", "image", "inspect", "-f", "{{json .Config.Labels}}", IMAGE]);
  if (result.code !== 0) return undefined;
  return JSON.parse(result.stdout) ?? {};
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const ids = (await docker(["ps", "-aq", "--filter", `label=${REPO_LABEL}`, "--filter", "label=com.docker.compose.service=workspace"]))
    .split("\n")
    .filter(Boolean);
  if (ids.length === 0) return [];
  const inspected: Array<{
    Id: string;
    Config: { Labels: Record<string, string>; Env: string[] };
    State: { Status: string; Health?: { Status: string } };
  }> = JSON.parse(await docker(["inspect", ...ids]));
  return inspected
    .map((container) => ({
      id: container.Id,
      project: container.Config.Labels["com.docker.compose.project"] ?? "",
      repo: container.Config.Labels[REPO_LABEL] ?? "",
      state: container.State.Status,
      health: container.State.Health?.Status ?? "",
      ui: uiMode(container.Config.Env),
      envFile: container.Config.Labels["go-remote.env-file"] ?? ".env",
    }))
    .sort((a, b) => a.project.localeCompare(b.project));
}

/**
 * The workspace for a repo path, or the only workspace when no path is given. Fails when there is none, or
 * when the choice is ambiguous.
 */
export async function findWorkspace(path?: string): Promise<Workspace> {
  const workspaces = await listWorkspaces();
  if (path !== undefined) {
    // The recorded path first: the repo may since have moved or been deleted.
    const recorded = workspaces.find((workspace) => workspace.repo === resolve(path.replace(/^~(?=$|\/)/, homedir())));
    if (recorded) return recorded;
    const repo = resolveRepo(path).path;
    const found = workspaces.find((workspace) => workspace.repo === repo);
    if (!found) throw new UserError(`No workspace for ${repo}`, `Start one with: bbd start ${repo}`);
    return found;
  }
  if (workspaces.length === 1 && workspaces[0]) return workspaces[0];
  if (workspaces.length === 0) throw new UserError("No workspace exists", "Start one with: bbd start /path/to/repo");
  throw new UserError("Several workspaces exist", "Name the repo, e.g. bbd qr ~/src/my-repo (bbd ls lists them).");
}

export function requireRunning(workspace: Workspace): void {
  if (workspace.state !== "running") {
    throw new UserError(`The workspace for ${workspace.repo} is not running (${workspace.state})`, `See bbd logs ${workspace.repo}`);
  }
}

export function compose(root: string, project: string): string[] {
  return ["docker", "compose", "--project-directory", root, "-f", join(root, "docker-compose.yml"), "-p", project];
}

/**
 * Creates the external home volume, without which compose up fails. Compose resolves its name from the shell
 * and .env, so the name is taken from compose rather than worked out here.
 */
export async function ensureHomeVolume(root: string, project: string, env: RunOptions["env"]): Promise<void> {
  const config = JSON.parse(await output([...compose(root, project), "config", "--format", "json"], { env }));
  const name: unknown = config?.volumes?.home?.name;
  if (typeof name !== "string" || name === "") throw new UserError("docker-compose.yml names no home volume");
  await docker(["volume", "create", name]);
}

async function gitConfig(repo: string, key: string): Promise<string> {
  return (await capture(["git", "-C", repo, "config", key])).stdout.trim();
}

/**
 * compose up for a repo's workspace. With `handingOff` the container starts no default agent (bbd starts the
 * one asked for); `recreate` replaces a running container, which is how it gets a changed .env.
 */
export async function composeUp(
  root: string,
  repo: string,
  project: string,
  options: { handingOff?: boolean; recreate?: boolean } = {},
): Promise<Workspace> {
  const name = await gitConfig(repo, "user.name");
  const email = await gitConfig(repo, "user.email");
  const env = {
    GR_REPO: repo,
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
    ...(options.handingOff ? { GR_DEFAULT_AGENT: "none" } : {}),
  };
  await ensureHomeVolume(root, project, env);
  const up = [...compose(root, project), "up", "-d", ...(options.recreate ? ["--force-recreate"] : [])];
  if ((await inherit(up, { stdoutToStderr: true, env })) !== 0) throw new UserError(`docker compose could not start ${project}`);
  const started = (await listWorkspaces()).find((workspace) => workspace.project === project);
  if (!started) throw new UserError(`${project} did not start`);
  return started;
}

/** Runs a command in the workspace as the agent user. */
export async function exec(workspace: Workspace, command: string[], options?: RunOptions): Promise<string> {
  return docker(["exec", ...(options?.stdin ? ["-i"] : []), workspace.id, ...command], options);
}

/** A Herdr CLI call in the workspace, parsed from its JSON. */
export async function herdr<T = unknown>(workspace: Workspace, args: string[]): Promise<T> {
  const parsed = JSON.parse(await exec(workspace, ["herdr", ...args]));
  if (parsed?.error) throw new UserError(`herdr ${args.slice(0, 2).join(" ")} failed: ${parsed.error.message ?? "error"}`);
  return parsed.result as T;
}

/** Waits for the container's BitBang listener to register and report healthy; returns its URL. */
export async function waitForListener(workspace: Workspace, timeoutMs = 120_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await capture(["docker", "inspect", "-f", "{{.State.Running}}", workspace.id]);
    if (state.stdout.trim() !== "true") {
      throw new UserError(`The workspace for ${workspace.repo} stopped while starting`, `See bbd logs ${workspace.repo}`);
    }
    const probe = await capture([
      "docker",
      "exec",
      workspace.id,
      "sh",
      "-c",
      '[ "$(cat /tmp/bitbang/health 2>/dev/null)" = ok ] && cat /tmp/bitbang/url',
    ]);
    const url = probe.stdout.trim();
    if (probe.code === 0 && url) return url;
    await Bun.sleep(1000);
  }
  throw new UserError(`BitBang did not register within ${Math.round(timeoutMs / 1000)}s`, `See bbd logs ${workspace.repo}`);
}

export async function attach(workspace: Workspace, command: string[]): Promise<number> {
  const tty = process.stdin.isTTY === true ? ["-it"] : ["-i"];
  // Docker follows a failed command with an advert for Docker Debug unless its hints are off.
  return inherit(["docker", "exec", ...tty, workspace.id, ...command], { env: { DOCKER_CLI_HINTS: "false" } });
}
