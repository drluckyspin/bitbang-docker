import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRoot, saveRoot } from "./config.ts";

const saved = { BBD_ROOT: process.env.BBD_ROOT, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function checkout(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "bbd-checkout-")));
  mkdirSync(join(dir, "scripts"));
  writeFileSync(join(dir, "docker-compose.yml"), "");
  writeFileSync(join(dir, "scripts", "checkenv.bash"), "");
  return dir;
}

test("the recorded checkout is found from anywhere, and --root and BBD_ROOT come first", () => {
  delete process.env.BBD_ROOT;
  process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "bbd-config-"));
  const recorded = checkout();
  expect(saveRoot(`${recorded}/`).root).toBe(recorded);
  expect(resolveRoot()).toBe(recorded);

  const other = checkout();
  process.env.BBD_ROOT = other;
  expect(resolveRoot()).toBe(other);
  expect(resolveRoot(recorded)).toBe(recorded);
});

test("a named checkout that is not one fails, instead of falling through to another", () => {
  process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "bbd-config-"));
  saveRoot(checkout());
  process.env.BBD_ROOT = tmpdir();
  expect(() => resolveRoot()).toThrow("(from BBD_ROOT) is not a bitbang-docker checkout");
  expect(() => saveRoot(tmpdir())).toThrow("is not a bitbang-docker checkout");
});
