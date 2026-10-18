/** The agent CLIs' versions on the laptop, against the ones the image pins. */
import { capture } from "./proc.ts";
import { AGENT_NAMES, type AgentKind } from "./sessions.ts";

export const PIN_LABELS: Record<AgentKind, string> = {
  claude: "bitbang-docker.version.claude-code",
  codex: "bitbang-docker.version.codex",
  cursor: "bitbang-docker.version.cursor-agent",
};

/** `2.1.286 (Claude Code)` and `codex-cli 0.161.0` both give the dotted version; undefined if not installed. */
export async function hostVersion(agent: AgentKind): Promise<string | undefined> {
  const command = agent === "cursor" ? "cursor-agent" : agent;
  const result = await capture([command, "--version"]);
  if (result.code !== 0) return undefined;
  return /\d+\.\d+\.\d+(?:[-+][\w.]+)?/.exec(result.stdout)?.[0];
}

/** A warning when a transcript moves between different versions; transcript formats are internal. */
export function skewWarning(agent: AgentKind, laptop: string | undefined, container: string | undefined): string | undefined {
  if (!laptop || !container || laptop === container) return undefined;
  return `The laptop runs ${AGENT_NAMES[agent]} ${laptop} and the container ${container}. Sessions usually move between `
    + "versions, but if this one does not resume, bring the two in line (the pin is in the Dockerfile).";
}
