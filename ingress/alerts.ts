/**
 * go-remote-alerts: posts to ntfy when an agent in this workspace needs you, or finishes a turn, so the phone hears
 * about it with the BitBang tab closed. herdr-web-ui's own Web Push cannot work inside BitBang's frame.
 *
 * An alert names the agent and the repo, never transcript text: the ntfy server may be a public one. The topic is
 * the secret (anyone who knows it can read it), so it is never logged. Tapping an alert cannot open the session,
 * because the BitBang URL is a credential and must not travel through ntfy.
 *
 * Settings: GR_NTFY_TOPIC (required), GR_NTFY_SERVER (default https://ntfy.sh), GR_NTFY_TOKEN (an access
 * token for a self-hosted server), GR_REPO_NAME, HERDR_SOCKET.
 */
import { createConnection } from "node:net";

export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

/** The fields of Herdr's AgentInfo (agent.list) that alerts use. */
export interface AgentInfo {
  pane_id: string;
  agent?: string | null;
  name?: string | null;
  display_agent?: string | null;
  agent_status: AgentStatus;
  completion_seq?: number | null;
}

export interface Alert {
  paneId: string;
  kind: "blocked" | "finished";
  title: string;
  message: string;
}

const AGENT_NAMES: Record<string, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" };

/** At most one alert of a kind per pane in this window, so an agent asking several questions in a row is one buzz. */
export const QUIET_MS = 30_000;

export function agentLabel(agent: AgentInfo): string {
  const label = agent.display_agent ?? agent.name ?? agent.agent ?? "";
  return AGENT_NAMES[label.toLowerCase()] ?? (label || "An agent");
}

/**
 * The alerts due between two snapshots. An agent seen for the first time raises none: a restart must not repeat
 * old news. A turn has finished when Herdr's completion counter moves and the agent is ready for input again.
 */
export function alertsBetween(previous: Map<string, AgentInfo>, current: AgentInfo[], repo: string): Alert[] {
  const alerts: Alert[] = [];
  for (const agent of current) {
    const before = previous.get(agent.pane_id);
    if (!before) continue;
    const label = agentLabel(agent);
    if (agent.agent_status === "blocked" && before.agent_status !== "blocked") {
      alerts.push({
        paneId: agent.pane_id,
        kind: "blocked",
        title: `${label} needs you`,
        message: `${repo}: waiting for an answer or an approval`,
      });
      continue;
    }
    const finished = (agent.completion_seq ?? 0) > (before.completion_seq ?? 0)
      || (before.agent_status === "working" && agent.agent_status === "done");
    if (finished && (agent.agent_status === "done" || agent.agent_status === "idle")) {
      alerts.push({
        paneId: agent.pane_id,
        kind: "finished",
        title: `${label} finished`,
        message: `${repo}: ready for the next prompt`,
      });
    }
  }
  return alerts;
}

/** Drop alerts that repeat one sent for the same pane and kind within QUIET_MS, and record the rest. */
export function throttle(alerts: Alert[], lastSent: Map<string, number>, now: number): Alert[] {
  return alerts.filter((alert) => {
    const key = `${alert.paneId}:${alert.kind}`;
    const last = lastSent.get(key);
    if (last !== undefined && now - last < QUIET_MS) return false;
    lastSent.set(key, now);
    return true;
  });
}

/** ntfy's JSON publishing format, which carries UTF-8 titles that its header format cannot. */
export function ntfyMessage(alert: Alert, topic: string) {
  return {
    topic,
    title: alert.title,
    message: alert.message,
    priority: alert.kind === "blocked" ? 4 : 3,
    tags: [alert.kind === "blocked" ? "raised_hand" : "white_check_mark"],
  };
}

/** One request on Herdr's newline-delimited JSON socket. */
export function herdrRequest<T>(socketPath: string, method: string, params: object = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path: socketPath });
    let buffer = "";
    socket.setEncoding("utf8");
    socket.setTimeout(10_000, () => socket.destroy(new Error(`${method} timed out`)));
    socket.on("connect", () => socket.write(`${JSON.stringify({ id: "go-remote-alerts", method, params })}\n`));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      socket.end();
      try {
        const response = JSON.parse(buffer.slice(0, end));
        if (response.error) reject(new Error(`${method}: ${response.error.code}`));
        else resolve(response.result as T);
      } catch (error) {
        reject(error);
      }
    });
    socket.on("error", reject);
    socket.on("close", () => reject(new Error(`${method}: Herdr closed the connection without answering`)));
  });
}

/** The watcher waits for each publish, so a stalled ntfy server must not hold up the next poll for long. */
export const PUBLISH_TIMEOUT_MS = 10_000;

export async function publish(
  alert: Alert,
  server: string,
  topic: string,
  token: string | undefined,
  timeoutMs = PUBLISH_TIMEOUT_MS,
): Promise<void> {
  const response = await fetch(server.replace(/\/+$/, "") + "/", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(ntfyMessage(alert, topic)),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`ntfy answered ${response.status}`);
}

function log(message: string): void {
  console.error(`${new Date().toISOString()} go-remote-alerts: ${message}`);
}

async function main(): Promise<void> {
  const topic = process.env["GR_NTFY_TOPIC"] ?? "";
  if (topic === "") {
    log("GR_NTFY_TOPIC is not set; nothing to do");
    return;
  }
  const server = process.env["GR_NTFY_SERVER"] || "https://ntfy.sh";
  const token = process.env["GR_NTFY_TOKEN"] || undefined;
  const repo = process.env["GR_REPO_NAME"] || "workspace";
  const socketPath = process.env["HERDR_SOCKET"]
    ?? `${process.env["HOME"]}/.config/herdr/sessions/${process.env["HERDR_SESSION"] ?? "default"}/herdr.sock`;
  const interval = Number(process.env["GR_ALERTS_INTERVAL_MS"] ?? 3000);

  let previous = new Map<string, AgentInfo>();
  const lastSent = new Map<string, number>();
  let failing = false;
  log(`watching agents in ${repo}`);

  for (;;) {
    try {
      const { agents } = await herdrRequest<{ agents: AgentInfo[] }>(socketPath, "agent.list");
      for (const alert of throttle(alertsBetween(previous, agents, repo), lastSent, Date.now())) {
        await publish(alert, server, topic, token).then(
          () => log(`sent: ${alert.title}`),
          (error) => log(`could not send "${alert.title}": ${String(error)}`),
        );
      }
      previous = new Map(agents.map((agent) => [agent.pane_id, agent]));
      failing = false;
    } catch (error) {
      if (!failing) log(`cannot read agent states: ${String(error)}`);
      failing = true;
    }
    await Bun.sleep(interval);
  }
}

if (import.meta.main) await main();
