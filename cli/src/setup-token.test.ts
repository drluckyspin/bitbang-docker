import { describe, expect, test } from "bun:test";
import { relay, tokenOnScreen } from "./setup-token.ts";

const COLS = 60;
const TOKEN = `sk-ant-oat01-${"AbCd_eF-12".repeat(9)}xyz`;
const SECRET = TOKEN.slice("sk-ant-oat01-".length);

async function* chunks(...parts: string[]): AsyncIterable<Uint8Array> {
  for (const part of parts) yield new TextEncoder().encode(part);
}

/** The success screen as Claude Code draws it: cursor moves, the token wrapped onto a second row, in colour. */
function successFrame(): string {
  return [
    "\x1b[?2026h\x1b[H\x1b[2K",
    "\x1b[32m✓ Long-lived authentication token created successfully!\x1b[39m",
    "\x1b[3;1HYour OAuth token (valid for 1 year):",
    `\x1b[5;1H\x1b[33m${TOKEN.slice(0, COLS)}\x1b[6;1H${TOKEN.slice(COLS)}\x1b[39m`,
    "\x1b[8;1H\x1b[2mStore this token securely. You won't be able to see it again.\x1b[22m",
    "\x1b[?2026l",
  ].join("");
}

describe("tokenOnScreen", () => {
  test("reads a token on one row", () => {
    expect(tokenOnScreen(["Your OAuth token:", "", TOKEN, "", "Store this token securely."], 200)).toBe(TOKEN);
  });

  test("joins the full-width rows a token wrapped onto", () => {
    expect(tokenOnScreen(["", TOKEN.slice(0, COLS), TOKEN.slice(COLS), "", "Store it"], COLS)).toBe(TOKEN);
  });

  test("does not join the next row onto a token that ended before the edge", () => {
    expect(tokenOnScreen([TOKEN, "Store"], TOKEN.length + 20)).toBe(TOKEN);
  });

  test("finds nothing on a screen without a whole token", () => {
    expect(tokenOnScreen(["Paste code here if prompted >", "sk-ant-oat01-short"], 80)).toBeUndefined();
  });
});

describe("relay", () => {
  test("passes the sign-in screens on, holds the token back, and reads it", async () => {
    const shown: string[] = [];
    const frame = successFrame();
    const split = frame.indexOf("authentication");
    const result = await relay(
      chunks("\x1b[?25l\x1b[2J\x1b[HPaste code here if prompted > ", "1234#abcd", frame.slice(0, split), frame.slice(split)),
      { cols: COLS, rows: 20 },
      (chunk) => shown.push(new TextDecoder().decode(chunk)),
    );
    expect(result).toEqual({ token: TOKEN, held: true });
    expect(shown.join("")).toContain("Paste code here");
    expect(shown.join("")).not.toContain(SECRET.slice(0, 12));
    expect(shown.join("")).not.toContain(SECRET.slice(-12));
  });

  test("reads a token whose unchanged cells were skipped over, as a redraw does", async () => {
    // the row held the same characters at columns 21-30 before, so the redraw jumps over them (CSI 10 C)
    const before = `\x1b[5;1H${" ".repeat(20)}${TOKEN.slice(20, 30)}`;
    const redraw = `\x1b[5;1H${TOKEN.slice(0, 20)}\x1b[10C${TOKEN.slice(30, COLS)}\x1b[6;1H${TOKEN.slice(COLS)}`;
    const result = await relay(chunks("\x1b[2J", before, "\x1b[1;1HLong-lived authentication token created", redraw), { cols: COLS, rows: 20 }, () => {});
    expect(result.token).toBe(TOKEN);
  });

  test("passes everything on when no token appears", async () => {
    const shown: string[] = [];
    const result = await relay(chunks("Login cancelled\r\n"), { cols: COLS, rows: 20 }, (chunk) => shown.push(new TextDecoder().decode(chunk)));
    expect(result).toEqual({ held: false });
    expect(shown.join("")).toBe("Login cancelled\r\n");
  });
});
