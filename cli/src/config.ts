/**
 * Where the bitbang-docker checkout is: it holds docker-compose.yml, .env and the scripts. In order: --root,
 * BBD_ROOT, ~/.config/bbd/config.json (written by bbd setup, which make install-cli runs), then the checkout a
 * dist/ binary sits in.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { UserError } from "./ui.ts";

export function configPath(): string {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "bbd", "config.json");
}

function configuredRoot(): string | undefined {
  try {
    const config: unknown = JSON.parse(readFileSync(configPath(), "utf8"));
    if (typeof config === "object" && config !== null && "root" in config && typeof config.root === "string") {
      return config.root;
    }
  } catch {
    // no config yet
  }
  return undefined;
}

export function isCheckout(path: string): boolean {
  return existsSync(join(path, "docker-compose.yml")) && existsSync(join(path, "scripts", "checkenv.bash"));
}

export function resolveRoot(flag?: string): string {
  const explicit: Array<[string, string | undefined]> = [
    ["--root", flag],
    ["BBD_ROOT", process.env.BBD_ROOT],
    [configPath(), configuredRoot()],
  ];
  for (const [source, candidate] of explicit) {
    if (!candidate) continue;
    if (isCheckout(candidate)) return resolve(candidate);
    throw new UserError(
      `${candidate} (from ${source}) is not a bitbang-docker checkout`,
      "Run make install-cli in the checkout again, or point BBD_ROOT at it.",
    );
  }
  const beside = dirname(dirname(realpathSync(process.execPath)));
  if (isCheckout(beside)) return beside;
  throw new UserError("Cannot find the bitbang-docker checkout", "Run make install-cli in it, or set BBD_ROOT to its path.");
}

/** Records the checkout for later runs, from wherever they start. */
export function saveRoot(root: string): { root: string; file: string } {
  const path = resolve(root);
  if (!isCheckout(path)) throw new UserError(`${path} is not a bitbang-docker checkout`);
  const file = configPath();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify({ root: path }, null, 2)}\n`);
  return { root: path, file };
}
