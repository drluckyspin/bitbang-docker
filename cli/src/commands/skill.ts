/**
 * go-remote install-skill: the go-remote skill, embedded in the binary, into ~/.agents/skills (which Codex and Cursor
 * read), with a link from ~/.claude/skills for Claude Code. It replaces create-remote-session, its old name.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import skill from "../../../skills/go-remote/SKILL.md" with { type: "text" };
import { inherit } from "../proc.ts";
import { confirm, ui } from "../ui.ts";

export const SKILL_NAME = "go-remote";
const OLD_NAME = "create-remote-session";
const SKILLS_SOURCE = "drluckyspin/go-remote";
const SKILLS_SEARCH = `https://skills.sh/api/search?q=${SKILL_NAME}&owner=drluckyspin&limit=20`;

/** A skills.sh result we trust to install this skill from. */
export function publishedSource(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null || !("skills" in result) || !Array.isArray(result.skills)) return undefined;
  for (const item of result.skills) {
    if (typeof item !== "object" || item === null || !("name" in item) || !("source" in item)) continue;
    if (item.name === SKILL_NAME && item.source === SKILLS_SOURCE) return item.source;
  }
  return undefined;
}

/** Looks for the skill's published record. A network or directory problem means the included copy remains available. */
async function skillsShSource(): Promise<string | undefined> {
  try {
    const response = await fetch(SKILLS_SEARCH, { signal: AbortSignal.timeout(3_000) });
    return response.ok ? publishedSource(await response.json()) : undefined;
  } catch {
    return undefined;
  }
}

async function installFromSkillsSh(source: string): Promise<boolean> {
  const npx = Bun.which("npx");
  if (!npx) {
    ui.warn("The published /go-remote skill needs npx to install; using go-remote's included copy instead.");
    return false;
  }
  ui.info("Installing /go-remote from skills.sh");
  const status = await inherit(
    [npx, "--yes", "skills", "add", source, "--global", "--agent", "claude-code", "--agent", "codex", "--agent", "cursor", "--skill", SKILL_NAME, "--yes"],
    // go-remote itself sets DO_NOT_TRACK for Bun's crash reporter. Let skills.sh receive its anonymous install event,
    // which is how the public directory indexes a skill.
    { env: { DISABLE_TELEMETRY: undefined, DO_NOT_TRACK: undefined } },
  );
  if (status === 0) {
    ui.success("Installed /go-remote from skills.sh");
    return true;
  }
  ui.warn("skills.sh could not install /go-remote; using go-remote's included copy instead.");
  return false;
}

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
 * Takes out the skill under its old name, as bbd (go-remote's old name) installed it: its SKILL.md, its folder once
 * empty, and the link. A skill of that name that bbd did not write stays, link and all.
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

/**
 * Uses the skills.sh copy once it is published, but always keeps the embedded installation usable offline.
 * The directory record is checked before asking because go-remote must not download an unregistered skill.
 */
export async function installPreferredSkill(): Promise<void> {
  const source = await skillsShSource();
  if (source && (await confirm("The published /go-remote skill is available on skills.sh. Install it with the skills CLI?", true))) {
    if (await installFromSkillsSh(source)) return;
  }
  installSkill();
}
