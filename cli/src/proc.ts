/** Running other programs: docker, git, the agent CLIs. */
import { UserError } from "./ui.ts";

export interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** bytes or a file to send to the program's stdin */
  stdin?: Uint8Array | Blob;
  /** for inherit(): send the program's stdout to stderr, keeping stdout for go-remote's own output */
  stdoutToStderr?: boolean;
}

function environment(extra?: Record<string, string | undefined>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...process.env, ...extra })) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/** Runs a program and collects its output. A missing program exits 127, as in a shell. */
export async function capture(command: string[], options: RunOptions = {}): Promise<Result> {
  let child;
  try {
    child = Bun.spawn(command, {
      cwd: options.cwd,
      env: environment(options.env),
      stdin: options.stdin ?? "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    return { code: 127, stdout: "", stderr: `${command[0]}: not found` };
  }
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
}

/** Runs a program and returns its stdout as bytes, or fails with the last line it printed on stderr. */
export async function outputBytes(command: string[], options: RunOptions = {}): Promise<Uint8Array> {
  let child;
  try {
    child = Bun.spawn(command, { cwd: options.cwd, env: environment(options.env), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  } catch {
    throw new UserError(`${command[0]} is not installed`);
  }
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new UserError(`${command.slice(0, 3).join(" ")} failed: ${stderr.trim().split("\n").at(-1) || `exit ${code}`}`);
  }
  return new Uint8Array(stdout);
}

/** Runs a program on this terminal and returns its exit code. */
export async function inherit(command: string[], options: RunOptions = {}): Promise<number> {
  let child;
  try {
    child = Bun.spawn(command, {
      cwd: options.cwd,
      env: environment(options.env),
      stdin: options.stdin ?? "inherit",
      stdout: options.stdoutToStderr ? 2 : "inherit",
      stderr: "inherit",
    });
  } catch {
    throw new UserError(`${command[0]} is not installed`);
  }
  return child.exited;
}

/** Runs a program and returns its stdout, or fails with the last line it printed on stderr. */
export async function output(command: string[], options: RunOptions = {}): Promise<string> {
  const result = await capture(command, options);
  if (result.code !== 0) {
    const reason = result.stderr.trim().split("\n").at(-1) || `exit ${result.code}`;
    throw new UserError(`${command.slice(0, 3).join(" ")} failed: ${reason}`);
  }
  return result.stdout;
}
