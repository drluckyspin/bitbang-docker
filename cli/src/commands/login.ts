/**
 * bbd login: signs an agent CLI in inside the container. Workspaces share the home volume, so one sign-in
 * serves them all, and each one's default agent starts on its own once it sees it.
 */
import { defaultAgent, settledDefaultAgent } from "../handoff.ts";
import { AGENT_NAMES, type AgentKind } from "../sessions.ts";
import { ui, UserError } from "../ui.ts";
import { attach, checkDocker, findWorkspace, listWorkspaces, requireRunning, type Workspace } from "../workspace.ts";

/** Runs the agent's own sign-in in the container, on this terminal. */
export async function signIn(workspace: Workspace, agent: AgentKind): Promise<boolean> {
  if (process.stdin.isTTY !== true) throw new UserError("Signing in needs an interactive terminal", `Run bbd login ${agent} in one.`);
  ui.info(
    agent === "claude"
      ? "Signing in to Claude Code in the container: open the link below, sign in, then paste the code the page shows here."
      : "Signing in to Codex in the container: open the link below on any device and enter the code shown here.",
  );
  if ((await attach(workspace, ["bitbang-docker-agent", "login", agent])) !== 0) return false;
  ui.success(`${AGENT_NAMES[agent]} is signed in, for every workspace`);
  return true;
}

/** The named workspace, else any running one: they share their sign-ins. */
async function target(path?: string): Promise<Workspace> {
  if (path !== undefined) return findWorkspace(path);
  const running = (await listWorkspaces()).find((workspace) => workspace.state === "running");
  if (!running) throw new UserError("No workspace is running", "Start one with: bbd start /path/to/repo");
  return running;
}

export async function login(options: { path?: string; agent?: AgentKind }): Promise<void> {
  await checkDocker();
  const workspace = await target(options.path);
  requireRunning(workspace);
  const agent = options.agent ?? (workspace.ui === "web" ? (await defaultAgent(workspace)).agent : undefined) ?? "claude";
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
