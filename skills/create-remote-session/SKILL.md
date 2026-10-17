---
name: create-remote-session
description: >-
  Hands the current coding session to a hardened bitbang-docker workspace and opens it on the user's phone, so the
  work continues away from the laptop. Use when the user runs /create-remote-session ($create-remote-session in
  Codex), or asks to continue on their phone, go remote, or keep working from another device.
---

# Create a remote session

Moves this session into a bitbang-docker workspace for the current repo: a container on this computer that the phone
reaches over BitBang. Claude Code and Codex sessions continue there with their full history; other agents hand over a
written brief. The `bbd` CLI does the work; you prepare the handoff and run it.

## Guardrails

- **Never handle the way in.** The BitBang URL, the pairing link and code, the PIN, the web token and `.env` each grant
  access to the workspace, and anything you read goes to a model provider. Do not print, read, copy or ask for them. Run
  `bbd` with `--json`: its output never contains them, and the QR code opens in a window on the user's screen instead.
  Do not run `bbd logs`, `docker logs` or `bbd qr` without `--json`, and do not open the QR image.
- **Never push, commit, or stop a workspace** unless the user asks. Ask before running `bbd stop`.
- If `bbd` is not installed, tell the user to run `make install-cli` in their bitbang-docker checkout, and stop.

## Steps

1. **Confirm the repo.** Run `git rev-parse --show-toplevel` and `git status --short`. Tell the user which repo will be
   mounted and how many uncommitted changes it has: the laptop and the container share the working tree, so suggest a
   separate worktree for each agent if both will keep editing.

2. **Write the brief** to `.bbd/handoff.md` at the repo root (bitbang-docker keeps `.bbd/` out of git). Cover the goal,
   what is done, what is next, decisions and open questions, the files involved, and how to test. No secrets. The new
   agent reads it first, so a session that resumes with full history still gets its bearings.

3. **Find this session's id.**

   | Agent                               | Where the id is                                                                                             |
   | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
   | Claude Code                         | `${CLAUDE_SESSION_ID}`; if that still reads as a placeholder, run `printf '%s\n' "$CLAUDE_CODE_SESSION_ID"` |
   | Codex                               | run `printf '%s\n' "$CODEX_THREAD_ID"`                                                                      |
   | Anything else (Cursor, Gemini, ...) | none: hand over the brief alone                                                                             |

   Only if those are empty, run `bbd sessions --json` in the repo, take the newest entry for your agent, and confirm it
   with the user before using it.

4. **Start the workspace.** From the repo root, for Claude Code or Codex:

   ```bash
   bbd start "$(git rev-parse --show-toplevel)" --json --resume <agent>:<id> --fork --brief .bbd/handoff.md --open chat
   ```

   `--fork` continues a copy, because this session stays open while you run the command; without it, two copies would
   write to one transcript. For the brief alone:

   ```bash
   bbd start "$(git rev-parse --show-toplevel)" --json --agent claude --brief .bbd/handoff.md --open chat
   ```

   Use `--agent codex` instead if the user prefers Codex. The first start can take a minute.

5. **Tell the user what happened**, from the JSON:

   - `"qr": "window"`: the QR code is open in a window on their screen. Scanning it with the phone's camera connects,
     pairs the phone and opens the agent's chat. The pairing code expires in 10 minutes; `bbd qr` in a terminal makes a
     new one.
   - `"qr": "none"`: there was no window to show it in; ask them to run `bbd qr` in a terminal.
   - Warnings on stderr (an agent not logged in yet, a version difference, uncommitted changes) are worth passing on.

   Then say that they can close this session on the laptop, and that `bbd pull` in the repo brings the container's
   session back when they return.
