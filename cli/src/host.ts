/** The laptop side: a local window for the QR code, and keeping a Mac awake while a workspace runs. */
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture } from "./proc.ts";

const WINDOW_FILE_LIFETIME_S = 600;

function detached(command: string, args: string[]): void {
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

/**
 * Opens a PNG in the default viewer, from a private temp directory that is deleted again after ten minutes.
 * Returns false when there is no viewer to open it with.
 */
export async function openImage(png: Uint8Array, name: string): Promise<boolean> {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  if ((await capture(["sh", "-c", `command -v ${opener}`])).code !== 0) return false;
  const dir = mkdtempSync(join(tmpdir(), "go-remote-qr-"));
  chmodSync(dir, 0o700);
  const file = join(dir, `${name}.png`);
  writeFileSync(file, png, { mode: 0o600 });
  if ((await capture([opener, file])).code !== 0) return false;
  detached("sh", ["-c", `sleep ${WINDOW_FILE_LIFETIME_S}; rm -rf "$1"`, "sh", dir]);
  return true;
}

/**
 * On macOS, holds a no-idle-sleep assertion for as long as the container runs: caffeinate runs `docker wait`,
 * which returns when the container stops.
 */
export async function keepAwake(containerId: string): Promise<"started" | "already" | "unsupported"> {
  if (process.platform !== "darwin") return "unsupported";
  const pattern = `caffeinate -i -s docker wait ${containerId}`;
  if ((await capture(["pgrep", "-f", pattern])).code === 0) return "already";
  detached("caffeinate", ["-i", "-s", "docker", "wait", containerId]);
  return "started";
}

export async function onBattery(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const result = await capture(["pmset", "-g", "batt"]);
  return result.code === 0 && result.stdout.includes("'Battery Power'");
}
