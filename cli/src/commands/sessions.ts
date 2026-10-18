/** bbd sessions and bbd pull: agent sessions on the laptop, and bringing the container's back. */
import { containerFiles, fetchFile, groupSessions, hostCopy, openAnywhere, pullState } from "../handoff.ts";
import { AGENT_NAMES, hostSessions, hostStores, parseSessionRef, writeBack } from "../sessions.ts";
import { shellQuote, ui, UserError } from "../ui.ts";
import { checkDocker, findWorkspace, requireRunning, resolveRepo } from "../workspace.ts";

/** A file the agent is still appending to is not copied. */
const SETTLED_MS = 5_000;

export function ago(time: number, now = Date.now()): string {
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function continueCommand(agent: "claude" | "codex", id: string, cwd: string): string {
  return `cd ${shellQuote(cwd)} && ${agent === "claude" ? `claude --resume ${id}` : `codex resume ${id}`}`;
}

export async function sessions(options: { path?: string; json: boolean }): Promise<Record<string, unknown>[] | undefined> {
  const repo = resolveRepo(options.path ?? process.cwd()).path;
  const found = hostSessions(repo);
  if (options.json) {
    return found.map((session) => ({
      ref: `${session.agent}:${session.id}`,
      cwd: session.cwd,
      modified: new Date(session.modified).toISOString(),
      title: session.title ?? null,
    }));
  }
  if (found.length === 0) {
    ui.infoDim(`No Claude Code or Codex sessions on this computer ran in ${repo}.`);
    return undefined;
  }
  for (const session of found) {
    const where = session.cwd && session.cwd !== repo ? `  (in ${session.cwd.slice(repo.length + 1)})` : "";
    process.stdout.write(`${session.agent}:${session.id}  ${ago(session.modified).padEnd(12)}  ${session.title ?? ""}${where}\n`);
  }
  ui.dim(`Hand one to a workspace with: bbd start ${repo} --resume <agent:id> (add --fork to keep the laptop's going too)`);
  return undefined;
}

export async function pull(options: { path?: string; ref?: string; json: boolean }): Promise<Record<string, unknown>[] | undefined> {
  await checkDocker();
  const workspace = await findWorkspace(options.path);
  requireRunning(workspace);
  const wanted = options.ref ? parseSessionRef(options.ref) : undefined;
  let groups = groupSessions(await containerFiles(workspace), workspace.repo);
  if (wanted) {
    groups = groups.filter((group) => group.agent === wanted.agent && group.id === wanted.id);
    if (groups.length === 0) throw new UserError(`The container has no ${AGENT_NAMES[wanted.agent]} session ${wanted.id} for ${workspace.repo}`);
  }
  const openIn = await openAnywhere();
  const stores = hostStores();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const results: Record<string, unknown>[] = [];

  for (const group of groups) {
    const ref = `${group.agent}:${group.id}`;
    const where = openIn(group.id);
    if (where) {
      if (wanted) {
        throw new UserError(`${ref} is still open in ${where}`, "Quit the agent there first, so only one copy of the session is ever written to.");
      }
      results.push({ ref, state: "open", cwd: group.cwd, workspace: where });
      continue;
    }
    if (group.files.some((file) => Date.now() - file.modified < SETTLED_MS)) {
      results.push({ ref, state: "busy", cwd: group.cwd });
      continue;
    }
    const states = group.files.map((file) => ({ file, state: pullState(hostCopy(stores[group.agent], file.file), file) }));
    const pending = states.filter((entry) => entry.state === "copy").map((entry) => entry.file);
    if (pending.length === 0) {
      results.push({ ref, state: states.some((entry) => entry.state === "ahead") ? "ahead" : "same", cwd: group.cwd });
      continue;
    }
    let changed = 0;
    let isNew = false;
    for (const file of pending) {
      const written = writeBack(stores[group.agent], file.file, await fetchFile(workspace, group.agent, file.file), stamp);
      if (written !== "same") changed++;
      if (written === "new" && file === group.files[0]) isNew = true;
    }
    results.push({ ref, state: changed === 0 ? "same" : isNew ? "new" : "updated", cwd: group.cwd, files: changed });
  }

  if (options.json) return results;
  if (results.length === 0) ui.infoDim(`The container has no agent sessions for ${workspace.repo}.`);
  for (const result of results) {
    const ref = String(result.ref);
    const [agent, id] = ref.split(":") as ["claude" | "codex", string];
    switch (result.state) {
      case "open":
        ui.warn(`${ref} is still open in ${String(result.workspace)}; quit it there, then run bbd pull again`);
        break;
      case "busy":
        ui.warn(`${ref} is still being written to; try again in a moment`);
        break;
      case "same":
        ui.dim(`${ref} is the same on both sides`);
        break;
      case "ahead":
        ui.dim(`${ref} went on here after the container's copy, so this computer's is kept`);
        break;
      default:
        ui.success(`${ref} ${result.state === "new" ? "copied to" : "updated on"} the laptop. Continue with: ${continueCommand(agent, id, String(result.cwd))}`);
    }
  }
  if (results.some((result) => result.state === "updated")) {
    ui.dim("The laptop's previous copies were kept beside them, ending in .bak.");
  }
  return undefined;
}
