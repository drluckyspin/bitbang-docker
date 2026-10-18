/**
 * Claude Code's long-lived sign-in, made on this computer with claude setup-token; every workspace then gets
 * the token from .env as CLAUDE_CODE_OAUTH_TOKEN. The command draws a full-screen sign-in, so it runs on a
 * pseudo-terminal (script(1)) whose output is passed on to this terminal until the token is about to appear,
 * and the token is never shown. Claude Code draws by moving the cursor and rewriting only the cells that
 * changed, so the token is read from a terminal emulator fed the same output, never from the raw bytes.
 */
import { Terminal } from "@xterm/headless";
import { shellQuote } from "./ui.ts";

const TOKEN = /^sk-ant-oat01-[A-Za-z0-9_-]{40,400}$/;
/** On screen just before the token: the success line, or the start of the token itself. */
const BEFORE_TOKEN = ["Long-lived authentication token created", "sk-ant-"];
/**
 * Modes a full-screen program turns on and turns off again as it exits. Its exit is not passed on once the
 * token has been hidden, so they are turned off here: synchronized output, bracketed paste, focus reports,
 * mouse reports and enhanced keyboard reports; then the colours are reset and the cursor shown.
 */
const RESET = "\x1b[?2026l\x1b[?2004l\x1b[?1004l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[<u\x1b[0m\x1b[?25h";

export interface Size {
  cols: number;
  rows: number;
}

function screenLines(terminal: Terminal): string[] {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  for (let y = 0; y < buffer.length; y++) lines.push(buffer.getLine(y)?.translateToString(true) ?? "");
  return lines;
}

/** The token on a screen: the row it starts on, joined with any full-width rows it wrapped onto. */
export function tokenOnScreen(lines: string[], cols: number): string | undefined {
  for (const [index, line] of lines.entries()) {
    const start = line.indexOf("sk-ant-oat01-");
    if (start < 0) continue;
    let token = line.slice(start).trimEnd();
    let row = line.trimEnd();
    for (const next of lines.slice(index + 1)) {
      if (row.length < cols - 1) break;
      const more = next.trim();
      if (!/^[A-Za-z0-9_-]+$/.test(more)) break;
      token += more;
      row = next.trimEnd();
    }
    const found = /^sk-ant-oat01-[A-Za-z0-9_-]+/.exec(token)?.[0];
    if (found && TOKEN.test(found)) return found;
  }
  return undefined;
}

/**
 * Feeds a program's terminal output to an emulator, and passes it on through `show` until the token is
 * about to appear. Returns the token, if the screen showed one, and whether any output was held back.
 */
export async function relay(output: AsyncIterable<Uint8Array>, size: Size, show: (chunk: Uint8Array) => void): Promise<{ token?: string; held: boolean }> {
  const terminal = new Terminal({ cols: size.cols, rows: size.rows, scrollback: 5000, allowProposedApi: true });
  let held = false;
  try {
    for await (const chunk of output) {
      await new Promise<void>((resolve) => terminal.write(chunk, resolve));
      if (!held) {
        const screen = screenLines(terminal).join("\n");
        held = BEFORE_TOKEN.some((text) => screen.includes(text));
      }
      if (!held) show(chunk);
    }
    return { token: tokenOnScreen(screenLines(terminal), size.cols), held };
  } finally {
    terminal.dispose();
  }
}

/** This terminal's size, read the way script(1) reads it for the pseudo-terminal: from stdin. */
async function terminalSize(): Promise<Size> {
  const child = Bun.spawn(["stty", "size"], { stdin: "inherit", stdout: "pipe", stderr: "ignore" });
  const [rows, cols] = (await new Response(child.stdout).text()).trim().split(/\s+/).map(Number);
  await child.exited;
  if (rows && cols) return { rows, cols };
  return { rows: process.stdout.rows || 24, cols: process.stdout.columns || 80 };
}

/** Runs claude setup-token on this terminal; returns the token it made, or undefined if it made none. */
export async function setupToken(claude: string): Promise<string | undefined> {
  const size = await terminalSize();
  const command = process.platform === "darwin"
    ? ["script", "-q", "/dev/null", claude, "setup-token"]
    : ["script", "-q", "-e", "-c", `${shellQuote(claude)} setup-token`, "/dev/null"];
  const child = Bun.spawn(command, { stdin: "inherit", stdout: "pipe", stderr: "inherit" });
  const { token, held } = await relay(child.stdout, size, (chunk) => process.stdout.write(chunk));
  await child.exited;
  // below whatever the sign-in screen left, with the modes it set turned off again
  process.stdout.write(`${held ? RESET : ""}\r\n\x1b[J`);
  return token;
}
