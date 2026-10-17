/**
 * bbd install-skill: the create-remote-session skill, embedded in the binary, into ~/.agents/skills (which Codex
 * and Cursor read), with a link from ~/.claude/skills for Claude Code.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import skill from "../../../skills/create-remote-session/SKILL.md" with { type: "text" };
import { ui } from "../ui.ts";

export const SKILL_NAME = "create-remote-session";

export function skillPaths(home = homedir()): { dir: string; file: string; claudeLink: string } {
  const dir = join(home, ".agents", "skills", SKILL_NAME);
  return { dir, file: join(dir, "SKILL.md"), claudeLink: join(home, ".claude", "skills", SKILL_NAME) };
}

export function skillState(home = homedir()): "current" | "outdated" | "missing" {
  const { file } = skillPaths(home);
  if (!existsSync(file)) return "missing";
  return readFileSync(file, "utf8") === skill ? "current" : "outdated";
}

export function installSkill(home = homedir()): void {
  const { dir, file, claudeLink } = skillPaths(home);
  const before = skillState(home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, skill);
  ui.success(before === "current" ? `${file} is up to date` : `${before === "missing" ? "Installed" : "Updated"} ${file}`);

  let link: ReturnType<typeof lstatSync> | undefined;
  try {
    link = lstatSync(claudeLink);
  } catch {
    // not there yet
  }
  if (!link) {
    mkdirSync(join(home, ".claude", "skills"), { recursive: true });
    symlinkSync(dir, claudeLink);
    ui.success(`Linked ${claudeLink} for Claude Code`);
  } else if (link.isSymbolicLink() && readlinkSync(claudeLink) === dir) {
    ui.dim(`${claudeLink} already links to it`);
  } else {
    ui.warn(`${claudeLink} exists and is not a link to ${dir}; left it as it is`);
  }
  ui.dim(`Run it as /${SKILL_NAME} in Claude Code and Cursor, or $${SKILL_NAME} in Codex.`);
}
