/** The checkout's .env: created from .env.example on first use, checked by scripts/checkenv.bash, kept private. */
import { chmodSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { inherit } from "./proc.ts";
import { ui, UserError } from "./ui.ts";

/** The file compose gives the container: BBD_ENV_FILE (the tests use .env.example), else .env. */
export function envFile(root: string): string {
  return resolve(root, process.env.BBD_ENV_FILE || ".env");
}

export async function checkEnv(root: string): Promise<void> {
  const env = envFile(root);
  if (env === join(root, ".env.example")) return;
  const created = !existsSync(env);
  const code = await inherit(["bash", join(root, "scripts", "checkenv.bash"), env], { cwd: root, stdoutToStderr: true });
  if (code !== 0) throw new UserError(`${env} is incomplete`, "Add the keys listed above (or move .env.new into place) and retry.");
  if (created) chmodSync(env, 0o600);
  else if ((statSync(env).mode & 0o077) !== 0) ui.warn(`${env} is readable by other users. Fix with: chmod 600 ${env}`);
}
