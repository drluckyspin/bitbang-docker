import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compose, projectName, reservedConflict, resolveRepo, uiMode } from "./workspace.ts";

test("compose reads its settings from the env file GR_ENV_FILE picks, when it exists", () => {
  const root = mkdtempSync(join(tmpdir(), "go-remote-compose-"));
  const saved = process.env.GR_ENV_FILE;
  try {
    process.env.GR_ENV_FILE = "throwaway.env";
    expect(compose(root, "go-remote-app")).not.toContain("--env-file");
    writeFileSync(join(root, "throwaway.env"), "GR_UI=shell\n");
    const args = compose(root, "go-remote-app");
    expect(args.slice(args.indexOf("--env-file"), args.indexOf("--env-file") + 2)).toEqual(["--env-file", join(root, "throwaway.env")]);
  } finally {
    if (saved === undefined) delete process.env.GR_ENV_FILE;
    else process.env.GR_ENV_FILE = saved;
  }
});

test("uiMode reads GR_UI as the entrypoint does, and an image without it as the shell", () => {
  expect(uiMode(["PATH=/usr/bin", "GR_UI=web"])).toBe("web");
  expect(uiMode(["GR_UI=Shell"])).toBe("shell");
  expect(uiMode(["PATH=/usr/bin"])).toBe("shell");
});

describe("projectName", () => {
  test("matches Common.make's tr pipeline", () => {
    expect(projectName("/Users/me/src/My Repo.v2")).toBe("go-remote-my-repo-v2");
    expect(projectName("/Users/me/src/my_repo")).toBe("go-remote-my_repo");
    // tr works on bytes: é is two of them
    expect(projectName("/Users/me/src/café")).toBe("go-remote-caf--");
  });
});

describe("reservedConflict", () => {
  test("refuses paths that cover or land inside the container's own", () => {
    expect(reservedConflict("/usr/local/src/app")).toBe("/usr");
    expect(reservedConflict("/home/agent")).toBe("/home/agent");
    expect(reservedConflict("/home")).toBe("/home/agent");
    expect(reservedConflict("/tmp")).toBe("/tmp/go-remote");
    expect(reservedConflict("/workspace/app")).toBe("/workspace");
  });

  test("allows ordinary checkouts", () => {
    for (const path of ["/Users/me/src/app", "/home/todd/src/app", "/tmp/app", "/private/var/folders/x/T/repo", "/srv/app"]) {
      expect(reservedConflict(path)).toBeUndefined();
    }
  });
});

describe("resolveRepo", () => {
  test("resolves symlinks and spots a repo", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "go-remote-repo-")));
    mkdirSync(join(dir, ".git"));
    expect(resolveRepo(dir)).toEqual({ path: dir, isGit: true });
  });

  test("refuses a worktree, whose .git points outside the mount", () => {
    const dir = mkdtempSync(join(tmpdir(), "go-remote-worktree-"));
    writeFileSync(join(dir, ".git"), "gitdir: /elsewhere/.git/worktrees/x\n");
    expect(() => resolveRepo(dir)).toThrow("worktree");
  });

  test("refuses what does not exist, and the home directory", () => {
    expect(() => resolveRepo("/nonexistent/go-remote")).toThrow("does not exist");
    expect(() => resolveRepo("~")).toThrow("Refusing to mount");
  });
});
