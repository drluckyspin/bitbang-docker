/**
 * bbd install-skill: the go-remote skill, embedded in the binary, into ~/.agents/skills (which Codex and Cursor
 * read), with a link from ~/.claude/skills for Claude Code. It replaces create-remote-session, its old name.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import skill from "../../../skills/go-remote/SKILL.md" with { type: "text" };
import { ui } from "../ui.ts";

export const SKILL_NAME = "go-remote";
const OLD_NAME = "create-remote-session";

export function skillPaths(home = homedir(), name = SKILL_NAME): { dir: string; file: string; claudeLink: string } {
  const dir = join(home, ".agents", "skills", name);
  return { dir, file: join(dir, "SKILL.md"), claudeLink: join(home, ".claude", "skills", name) };
}

export function skillState(home = homedir()): "current" | "outdated" | "missing" {
  const { file } = skillPaths(home);
  if (!existsSync(file)) return "missing";
  return readFileSync(file, "utf8") === skill ? "current" : "outdated";
}

function linkTarget(path: string): string | undefined {
  try {
    return lstatSync(path).isSymbolicLink() ? readlinkSync(path) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Takes out the skill under its old name, as bbd installed it: its SKILL.md, its folder once empty, and the
 * link. A skill of that name that bbd did not write stays, link and all.
 */
function removeOldSkill(home: string): void {
  const { dir, file, claudeLink } = skillPaths(home, OLD_NAME);
  let text: string | undefined;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    // gone already; a link to it may be left
  }
  const ours = text !== undefined && text.includes(`name: ${OLD_NAME}`) && text.includes("bbd start");
  if (text !== undefined && !ours) return;
  const linked = linkTarget(claudeLink) === dir;
  if (linked) unlinkSync(claudeLink);
  if (ours) {
    unlinkSync(file);
    if (readdirSync(dir).length === 0) rmdirSync(dir);
  }
  if (ours || linked) ui.success(`Removed /${OLD_NAME}, which /${SKILL_NAME} replaces`);
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
  removeOldSkill(home);
  ui.dim(`Run it as /${SKILL_NAME} in Claude Code and Cursor, or $${SKILL_NAME} in Codex.`);
}
