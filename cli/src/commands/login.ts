/**
 * bbd login: signs Claude Code, Codex or Cursor in, once, for every workspace. Claude Code signs in on this computer
 * with claude setup-token, whose long-lived token goes into .env: every workspace then starts signed in.
 * Codex, and Claude Code where it is not installed here, sign in inside a running container instead; the home
 * volume keeps that login for every workspace, and each one's default agent then starts on its own.
 */
import { join } from "node:path";
import { resolveRoot } from "../config.ts";
import { checkEnv, envFile, envHas, setEnvValue } from "../env.ts";
import { defaultAgent, settledDefaultAgent } from "../handoff.ts";
import { setupToken } from "../setup-token.ts";
import { AGENT_NAMES, type AgentKind } from "../sessions.ts";
import { confirm, ui, UserError } from "../ui.ts";
import { attach, checkDocker, composeUp, findWorkspace, listWorkspaces, requireRunning, type Workspace } from "../workspace.ts";
import { start } from "./start.ts";

/** Claude Code on this computer, which can make the token. */
export function hostClaude(): string | undefined {
  return Bun.which("claude") ?? undefined;
}

/** Runs the agent's own sign-in in the container, on this terminal. */
export async function signIn(workspace: Workspace, agent: AgentKind): Promise<boolean> {
  if (process.stdin.isTTY !== true) throw new UserError("Signing in needs an interactive terminal", `Run bbd login ${agent} in one.`);
  ui.info(
    agent === "claude"
      ? "Signing in to Claude Code in the container: open the link below, sign in, then paste the code the page shows here."
      : `Signing in to ${AGENT_NAMES[agent]} in the container: follow the prompts below on any device.`,
  );
  if ((await attach(workspace, ["bitbang-docker-agent", "login", agent])) !== 0) return false;
  ui.success(`${AGENT_NAMES[agent]} is signed in, for every workspace`);
  return true;
}

/** Makes a Claude Code token with claude setup-token on this computer and keeps it in .env; false if none was made. */
export async function saveClaudeToken(root: string): Promise<boolean> {
  const claude = hostClaude();
  if (!claude) return false;
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    throw new UserError("Signing in needs an interactive terminal", "Run bbd login in one.");
  }
  const env = envFile(root);
  if (env === join(root, ".env.example")) throw new UserError("BBD_ENV_FILE points at the template, which holds no keys");
  await checkEnv(root);
  ui.info("Signing in to Claude Code on this computer, with claude setup-token. bbd keeps the token it makes in .env, for every workspace, and does not show it.");
  const token = await setupToken(claude);
  if (!token) {
    ui.warn("Claude Code made no token.");
    return false;
  }
  setEnvValue(env, "CLAUDE_CODE_OAUTH_TOKEN", token);
  ui.success(`Saved Claude Code's token in ${env}; workspaces start signed in`);
  if (envHas(env, "ANTHROPIC_API_KEY")) {
    ui.warn("ANTHROPIC_API_KEY is set in .env too, and Claude Code uses it instead of the token. Empty it to use your subscription.");
  }
  return true;
}

/** Running workspaces given this .env started without the token; a restart gives it to them. */
async function restartRunning(root: string): Promise<void> {
  const env = envFile(root);
  const running = (await listWorkspaces()).filter(
    (workspace) => workspace.state === "running" && workspace.envFile === env,
  );
  if (running.length === 0) {
    ui.dim("Start a workspace with bbd start (or make run-detached); it starts signed in.");
    return;
  }
  const one = running.length === 1;
  ui.info(
    `${running.map((workspace) => workspace.project).join(", ")} started without the token. A restart gives ${one ? "it" : "them"} the token; ${one ? "its link changes" : "their links change"}, and what runs in ${one ? "it" : "them"} stops.`,
  );
  if (!(await confirm(`Restart ${one ? "it" : "them"} now?`, true))) {
    ui.dim("A workspace gets the token when it next starts: bbd stop, then bbd start.");
    return;
  }
  for (const workspace of running) {
    ui.info(`Restarting ${workspace.project}`);
    await composeUp(root, workspace.repo, workspace.project, { recreate: true });
  }
  if (one && running[0]) await start({ path: running[0].repo, root, fork: false, json: false, qr: true, window: true });
  else ui.dim("bbd qr <repo> shows each one's new QR code.");
}

/** The default agent of the named workspace, else of a running one, when it is a web workspace. */
async function preferred(path?: string): Promise<AgentKind | undefined> {
  const workspace = path !== undefined
    ? await findWorkspace(path).catch(() => undefined)
    : (await listWorkspaces()).find((candidate) => candidate.state === "running");
  if (workspace?.state !== "running" || workspace.ui !== "web") return undefined;
  return (await defaultAgent(workspace)).agent;
}

/** The named workspace, else any running one: they share their sign-ins. */
async function target(path?: string): Promise<Workspace> {
  if (path !== undefined) return findWorkspace(path);
  const running = (await listWorkspaces()).find((workspace) => workspace.state === "running");
  if (!running) throw new UserError("No workspace is running", "Start one with: bbd start /path/to/repo");
  return running;
}

export async function login(options: { path?: string; agent?: AgentKind; root?: string }): Promise<void> {
  await checkDocker();
  const agent = options.agent ?? (await preferred(options.path)) ?? "claude";
  if (agent === "claude" && hostClaude()) {
    const root = resolveRoot(options.root);
    if (!(await saveClaudeToken(root))) throw new UserError("Claude Code is not signed in", "Try again with: bbd login");
    await restartRunning(root);
    return;
  }
  const workspace = await target(options.path);
  requireRunning(workspace);
  if (agent === "claude") ui.dim("Claude Code is not installed on this computer, so it signs in inside the container.");
  if (!(await signIn(workspace, agent))) {
    throw new UserError(`${AGENT_NAMES[agent]} is not signed in`, `Try again with: bbd login ${agent}`);
  }
  if (workspace.ui !== "web") return;
  const current = await settledDefaultAgent(workspace, { signedIn: true, timeoutMs: 60_000 });
  if (current.state === "running" && current.agent) {
    ui.success(`${AGENT_NAMES[current.agent]} is ready in its own tab: open Chat on the phone`);
  } else if (current.state === "failed") {
    ui.warn("The default agent did not start; open its tab on the phone to see why.");
  }
}
