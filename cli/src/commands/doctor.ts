/** bbd doctor: what bbd needs on this computer, and the versions it hands sessions between. */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveRoot } from "../config.ts";
import { envFile } from "../env.ts";
import { onBattery } from "../host.ts";
import { capture } from "../proc.ts";
import { AGENT_NAMES, type AgentKind } from "../sessions.ts";
import { ui, UserError } from "../ui.ts";
import { hostVersion, PIN_LABELS, skewWarning } from "../versions.ts";
import { checkDocker, IMAGE, imageLabels, listWorkspaces } from "../workspace.ts";
import { SKILL_NAME, skillState } from "./skill.ts";

interface Check {
  check: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export async function doctor(options: { json: boolean; root?: string }): Promise<{ checks: Check[]; ok: boolean }> {
  const checks: Check[] = [];
  const add = (check: string, status: Check["status"], detail: string) => checks.push({ check, status, detail });

  let root: string | undefined;
  try {
    root = resolveRoot(options.root);
    add("checkout", "ok", root);
  } catch (error) {
    add("checkout", "fail", error instanceof UserError ? `${error.message}. ${error.hint ?? ""}`.trim() : String(error));
  }
  if (root) {
    const env = envFile(root);
    if (env === join(root, ".env.example")) add(".env", "warn", "BBD_ENV_FILE points at the template, so workspaces get no keys");
    else if (!existsSync(env)) add(".env", "warn", "not created yet; bbd start creates it from .env.example");
    else if ((statSync(env).mode & 0o077) !== 0) add(".env", "warn", `readable by other users; fix with chmod 600 ${env}`);
    else add(".env", "ok", "private");
  }

  let labels: Record<string, string> | undefined;
  try {
    await checkDocker();
    add("docker", "ok", (await capture(["docker", "version", "-f", "{{.Server.Version}}"])).stdout.trim());
    labels = await imageLabels();
    if (!labels) add("image", "fail", `${IMAGE} not built; run make build`);
    else {
      const pins = Object.entries(labels)
        .filter(([key]) => key.startsWith("bitbang-docker.version."))
        .map(([key, value]) => `${key.slice("bitbang-docker.version.".length)} ${value}`);
      add("image", pins.length > 0 ? "ok" : "warn", pins.length > 0 ? pins.join(", ") : "built before version labels; run make build");
    }
    const running = (await listWorkspaces()).filter((workspace) => workspace.state === "running").length;
    add("workspaces", "ok", `${running} running`);
  } catch (error) {
    add("docker", "fail", error instanceof UserError ? `${error.message}. ${error.hint ?? ""}`.trim() : String(error));
  }

  for (const agent of ["claude", "codex"] as AgentKind[]) {
    const laptop = await hostVersion(agent);
    const container = labels?.[PIN_LABELS[agent]];
    if (!laptop) add(AGENT_NAMES[agent], "ok", "not installed on this computer (only needed to hand sessions over)");
    else if (skewWarning(agent, laptop, container)) add(AGENT_NAMES[agent], "warn", `${laptop} here, ${container} in the image`);
    else add(AGENT_NAMES[agent], "ok", laptop);
  }

  const skill = skillState();
  add("skill", skill === "current" ? "ok" : "warn", skill === "current" ? `${SKILL_NAME} installed` : `${SKILL_NAME} ${skill}; run bbd install-skill`);

  if (process.platform === "darwin") {
    const battery = await onBattery();
    add("power", battery ? "warn" : "ok", battery ? "on battery: closing the lid sleeps the Mac and drops the phone" : "on power");
  }

  const ok = checks.every((check) => check.status !== "fail");
  if (!options.json) {
    for (const { check, status, detail } of checks) {
      const line = `${check}: ${detail}`;
      if (status === "ok") ui.success(line);
      else if (status === "warn") ui.warn(line);
      else ui.error(line);
    }
  }
  return { checks, ok };
}
