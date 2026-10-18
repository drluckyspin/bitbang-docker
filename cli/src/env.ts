/** The checkout's .env: created from .env.example on first use, checked by scripts/checkenv.bash, kept private. */
import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { inherit } from "./proc.ts";
import { ui, UserError } from "./ui.ts";

function setter(name: string): RegExp {
  return new RegExp(`^\\s*(export\\s+)?${name}=`);
}

/** A .env file's text with `name` set to `value`: on the first line that sets it (dropping any later ones), else appended. */
export function withEnvValue(text: string, name: string, value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || !/^[A-Za-z0-9_.:/+-]*$/.test(value)) {
    throw new Error(`Refusing to write ${name} to .env: it needs quoting go-remote does not do`);
  }
  const line = `${name}="${value}"`;
  const lines = text.split("\n");
  const first = lines.findIndex((entry) => setter(name).test(entry));
  if (first < 0) return `${text === "" || text.endsWith("\n") ? text : `${text}\n`}${line}\n`;
  return lines.flatMap((entry, index) => (index === first ? [line] : setter(name).test(entry) ? [] : [entry])).join("\n");
}

/** Sets one variable in a .env file, which stays private to this user. */
export function setEnvValue(file: string, name: string, value: string): void {
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const next = `${file}.go-remote-new`;
  writeFileSync(next, withEnvValue(text, name, value), { mode: 0o600 });
  chmodSync(next, 0o600);
  renameSync(next, file);
}

/** Whether a .env file gives `name` a value; the value itself is never returned. */
export function envHas(file: string, name: string): boolean {
  if (!existsSync(file)) return false;
  return readFileSync(file, "utf8")
    .split("\n")
    .some((line) => setter(name).test(line) && !/^(""|''|)$/.test(line.replace(setter(name), "").trim()));
}

/** The file compose gives the container: GR_ENV_FILE (the tests use .env.example), else .env. */
export function envFile(root: string): string {
  return resolve(root, process.env.GR_ENV_FILE || ".env");
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
