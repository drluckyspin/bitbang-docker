import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSkill, publishedSource, skillPaths, skillState } from "./skill.ts";

function home(): string {
  return mkdtempSync(join(tmpdir(), "bbd-skill-"));
}

function oldSkill(dir: string, text: string): { dir: string; link: string } {
  const skill = join(dir, ".agents", "skills", "create-remote-session");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), text);
  mkdirSync(join(dir, ".claude", "skills"), { recursive: true });
  const link = join(dir, ".claude", "skills", "create-remote-session");
  symlinkSync(skill, link);
  return { dir: skill, link };
}

describe("installSkill", () => {
  test("uses only the published go-remote skill from this repository", () => {
    expect(publishedSource({ skills: [{ name: "go-remote", source: "drluckyspin/go-remote" }] })).toBe("drluckyspin/go-remote");
    expect(publishedSource({ skills: [{ name: "go-remote", source: "someone-else/go-remote" }] })).toBeUndefined();
    expect(publishedSource({ skills: [{ name: "other-skill", source: "drluckyspin/go-remote" }] })).toBeUndefined();
    expect(publishedSource({ skills: "not a list" })).toBeUndefined();
  });

  test("installs go-remote, linked for Claude Code", () => {
    const dir = home();
    expect(skillState(dir)).toBe("missing");
    installSkill(dir);
    const { dir: skill, claudeLink } = skillPaths(dir);
    expect(skillState(dir)).toBe("current");
    expect(lstatSync(claudeLink).isSymbolicLink()).toBe(true);
    expect(readlinkSync(claudeLink)).toBe(skill);
  });

  test("takes out the skill under its old name, as bbd installed it", () => {
    const dir = home();
    const old = oldSkill(dir, "---\nname: create-remote-session\n---\nRun bbd start --fork.\n");
    installSkill(dir);
    expect(existsSync(old.dir)).toBe(false);
    expect(existsSync(old.link)).toBe(false);
  });

  test("keeps a create-remote-session that bbd did not write, and anything beside it", () => {
    const dir = home();
    const old = oldSkill(dir, "---\nname: create-remote-session\n---\nMy own skill.\n");
    installSkill(dir);
    expect(existsSync(join(old.dir, "SKILL.md"))).toBe(true);
    expect(lstatSync(old.link).isSymbolicLink()).toBe(true);

    const other = home();
    const kept = oldSkill(other, "---\nname: create-remote-session\n---\nbbd start\n");
    writeFileSync(join(kept.dir, "notes.md"), "mine");
    installSkill(other);
    expect(existsSync(join(kept.dir, "notes.md"))).toBe(true);
    expect(existsSync(join(kept.dir, "SKILL.md"))).toBe(false);
  });
});
