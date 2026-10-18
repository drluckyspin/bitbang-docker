import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { envHas, setEnvValue, withEnvValue } from "./env.ts";

describe("withEnvValue", () => {
  test("replaces the line that sets the variable, in place", () => {
    expect(withEnvValue('A=1\nCLAUDE_CODE_OAUTH_TOKEN=""\nB=2\n', "CLAUDE_CODE_OAUTH_TOKEN", "sk-x")).toBe('A=1\nCLAUDE_CODE_OAUTH_TOKEN="sk-x"\nB=2\n');
  });

  test("appends it when no line sets it, after a final newline", () => {
    expect(withEnvValue("A=1", "T", "v")).toBe('A=1\nT="v"\n');
    expect(withEnvValue("A=1\n", "T", "v")).toBe('A=1\nT="v"\n');
    expect(withEnvValue("", "T", "v")).toBe('T="v"\n');
  });

  test("drops later lines that would override it, and leaves comments alone", () => {
    expect(withEnvValue("# T=old\nexport T=1\nT=2\n", "T", "v")).toBe('# T=old\nT="v"\n');
  });

  test("refuses a value that would need quoting", () => {
    expect(() => withEnvValue("", "T", 'a"b')).toThrow();
    expect(() => withEnvValue("", "T", "a b")).toThrow();
  });
});

describe("envHas and setEnvValue", () => {
  const dir = mkdtempSync(join(tmpdir(), "go-remote-env-"));

  test("tells a value from an empty one", () => {
    const file = join(dir, "has");
    writeFileSync(file, 'EMPTY=""\nBARE=\nSET="x"\n# COMMENTED=y\n');
    expect(envHas(file, "EMPTY")).toBe(false);
    expect(envHas(file, "BARE")).toBe(false);
    expect(envHas(file, "SET")).toBe(true);
    expect(envHas(file, "COMMENTED")).toBe(false);
    expect(envHas(join(dir, "missing"), "SET")).toBe(false);
  });

  test("writes the file private to this user", () => {
    const file = join(dir, "env");
    writeFileSync(file, "A=1\n", { mode: 0o644 });
    setEnvValue(file, "T", "v");
    expect(readFileSync(file, "utf8")).toBe('A=1\nT="v"\n');
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});
