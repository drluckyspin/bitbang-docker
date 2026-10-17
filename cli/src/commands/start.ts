/**
 * bbd start: brings up the workspace for a repo, optionally hands it an agent session from the laptop, and
 * shows the phone the way in.
 */
import { copyFileSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { resolveRoot } from "../config.ts";
import { checkEnv } from "../env.ts";
import { agentReady, copyIn, mainPane, prompt, requireWeb, startAgent } from "../handoff.ts";
import { keepAwake, onBattery } from "../host.ts";
import type { View } from "../link.ts";
import { type LinkOptions, showLink } from "../present.ts";
import { capture, inherit } from "../proc.ts";
import {
  AGENT_NAMES,
  type AgentKind,
  findHostSession,
  hostStores,
  parseSessionRef,
  resumeArgs,
  type Session,
  type SessionRef,
  within,
} from "../sessions.ts";
import { confirm, ui, UserError } from "../ui.ts";
import { hostVersion, PIN_LABELS, skewWarning } from "../versions.ts";
import {
  checkDocker,
  compose,
  imageLabels,
  IMAGE,
  listWorkspaces,
  projectName,
  resolveRepo,
  waitForListener,
  type Workspace,
} from "../workspace.ts";

export interface StartOptions extends LinkOptions {
  path?: string;
  root?: string;
  agent?: AgentKind;
  resume?: string;
  fork: boolean;
  brief?: string;
  open?: View;
}

/** A transcript written to this recently may still be open on the laptop. */
const LIVE_MS = 60_000;
const BRIEF = ".bbd/handoff.md";

async function gitConfig(repo: string, key: string): Promise<string> {
  return (await capture(["git", "-C", repo, "config", key])).stdout.trim();
}

async function uncommitted(repo: string): Promise<number> {
  const status = await capture(["git", "-C", repo, "status", "--porcelain"]);
  return status.code === 0 ? status.stdout.split("\n").filter(Boolean).length : 0;
}

/** The session to hand over, after the checks that keep it to one writer. */
async function sessionToHand(ref: SessionRef, repo: string, fork: boolean): Promise<Session> {
  const session = findHostSession(ref);
  if (!session) {
    throw new UserError(`No ${AGENT_NAMES[ref.agent]} session ${ref.id} on this computer`, `bbd sessions ${repo} lists them.`);
  }
  if (!session.cwd || !within(session.cwd, repo)) {
    throw new UserError(
      `That session ran in ${session.cwd ?? "an unknown directory"}, outside ${repo}`,
      "Start the workspace for the repo it belongs to.",
    );
  }
  if (!fork && Date.now() - session.modified < LIVE_MS) {
    ui.warn(`The session changed in the last minute, so it may still be open on the laptop. Two copies writing to one ${AGENT_NAMES[ref.agent]} session interleave.`);
    if (!(await confirm("Quit it on the laptop first. Continue anyway?"))) {
      throw new UserError("Not handing over a session that may still be open", "Quit it on the laptop, or use --fork to continue a copy.");
    }
  }
  return session;
}

async function bringUp(root: string, repo: string, project: string): Promise<Workspace> {
  const existing = (await listWorkspaces()).find((workspace) => workspace.project === project);
  if (existing && existing.repo !== repo) {
    throw new UserError(`${project} already serves ${existing.repo}`, `Stop it first: bbd stop ${existing.repo}`);
  }
  if (existing?.state === "running") {
    ui.infoDim(`${project} is already running`);
    return existing;
  }
  ui.info(`Starting ${project} for ${repo}`);
  const name = await gitConfig(repo, "user.name");
  const email = await gitConfig(repo, "user.email");
  const code = await inherit([...compose(root, project), "up", "-d"], {
    stdoutToStderr: true,
    env: {
      BBD_REPO: repo,
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
    },
  });
  if (code !== 0) throw new UserError(`docker compose could not start ${project}`);
  const started = (await listWorkspaces()).find((workspace) => workspace.project === project);
  if (!started) throw new UserError(`${project} did not start`);
  return started;
}

/** Writes the handoff brief into the repo, where the container sees it (.bbd/ is excluded from git there). */
function placeBrief(repo: string, brief: string): void {
  const target = join(repo, BRIEF);
  mkdirSync(join(repo, ".bbd"), { recursive: true });
  let same = false;
  try {
    same = realpathSync(brief) === realpathSync(target);
  } catch {
    // the target does not exist yet
  }
  if (!same) copyFileSync(brief, target);
}

export async function start(options: StartOptions): Promise<Record<string, unknown>> {
  const root = resolveRoot(options.root);
  const { path: repo, isGit } = resolveRepo(options.path ?? process.cwd());
  const ref = options.resume ? parseSessionRef(options.resume) : undefined;
  if (ref && options.agent && options.agent !== ref.agent) {
    throw new UserError(`--agent ${options.agent} does not match the ${ref.agent} session in --resume`);
  }
  if (options.fork && !ref) throw new UserError("--fork needs --resume");
  const agent = ref?.agent ?? options.agent ?? (options.brief ? "claude" : undefined);
  const session = ref ? await sessionToHand(ref, repo, options.fork) : undefined;

  await checkDocker();
  const labels = await imageLabels();
  if (!labels) throw new UserError(`Image ${IMAGE} not found`, "Build it with: make build");
  if (agent) {
    const warning = skewWarning(agent, await hostVersion(agent), labels[PIN_LABELS[agent]]);
    if (warning && ref) ui.warn(warning);
  }
  await checkEnv(root);
  if (!isGit) ui.warn(`${repo} is not a git repository; mounting it anyway`);

  const project = projectName(repo);
  const workspace = await bringUp(root, repo, project);
  const url = await waitForListener(workspace);
  ui.success(`${project} is running; its BitBang listener is registered`);

  const changes = await uncommitted(repo);
  if (changes > 0) {
    ui.warn(`${repo} has ${changes} uncommitted change${changes === 1 ? "" : "s"}. The laptop and the container now share them; give each agent its own worktree to keep them apart.`);
  }
  const awake = await keepAwake(workspace.id);
  if (awake === "started") ui.dim("This Mac stays awake while the workspace runs.");
  if (awake !== "unsupported" && (await onBattery())) {
    ui.warn("The Mac is on battery: closing the lid still puts it to sleep, which drops the phone's connection.");
  }

  let pane: string | undefined;
  let agentName: string | undefined;
  const view: View = options.open ?? (agent ? "chat" : "terminal");
  if (agent) {
    requireWeb(workspace, "Starting an agent");
    const ready = await agentReady(workspace, agent);
    if (!ready.ok) {
      ui.warn(`${AGENT_NAMES[agent]} cannot work in the container yet: ${ready.reason}. Finish that in its terminal view on the phone, or with bbd attach.`);
    }
    if (options.brief) placeBrief(repo, options.brief);
    if (session) {
      await copyIn(workspace, session, hostStores());
      ui.success(`Copied ${AGENT_NAMES[session.agent]} session ${session.id} into the container`);
    }
    const started = await startAgent(workspace, agent, session?.cwd ?? repo, ref ? resumeArgs(ref, options.fork) : []);
    pane = started.pane;
    agentName = started.name;
    if (started.ready) {
      ui.success(`${AGENT_NAMES[agent]} is running in the ${started.name} tab${ref ? (options.fork ? ", on a copy of the session" : ", resuming the session") : ""}`);
      if (options.brief) {
        await prompt(workspace, started.name, `Read ${join(repo, BRIEF)} and continue the work it describes.`);
        ui.success("Gave it the handoff brief");
      }
    } else {
      ui.warn(`${AGENT_NAMES[agent]} was started in the ${started.name} tab but is not ready for input yet; open its terminal view to see why.`);
    }
  } else if (workspace.ui === "web") {
    pane = (await mainPane(workspace))?.pane_id;
  }

  const shown = await showLink(workspace, url, { pane, view }, options);
  return {
    project,
    repo,
    ui: workspace.ui,
    ...(agentName ? { agent: agentName, kind: agent } : {}),
    ...(ref ? { session: `${ref.agent}:${ref.id}`, fork: options.fork } : {}),
    ...(pane ? { pane, view } : {}),
    ...shown,
  };
}
