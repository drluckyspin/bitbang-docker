---
name: go-remote
description: >-
  Moves the current coding session into a hardened bitbang-docker workspace and opens it on the user's phone: the same
  conversation carries on there, with its history, and closes here. Use when the user runs /go-remote ($go-remote in
  Codex), or asks to continue on their phone, go remote, or keep working from another device.
---

# Go remote

Moves this session into a bitbang-docker workspace for the current repo: a container on this computer that the phone
reaches over BitBang. A Claude Code or Codex session moves whole. Once your reply ends, it closes here, resumes in the
container, and a QR code opens in a window; scanning it lands the user in this same conversation on the phone. Other
agents hand over a written brief instead. The `bbd` CLI does the work.

## Guardrails

- **Never handle the way in.** The BitBang URL, the pairing link and code, the PIN, the web token, the sign-in token and
  `.env` each grant access, and anything you read goes to a model provider. Do not print, read, copy or ask for them.
  Run `bbd` with `--json`: its output never contains them, and the QR code opens in a window on the user's screen
  instead. Do not run `bbd logs`, `docker logs` or `bbd qr` without `--json`, and do not open the QR image.
- **Never push, commit, or stop a workspace** unless the user asks. Ask before running `bbd stop`.
- If `bbd` is not installed, tell the user to run `make install-cli` in their bitbang-docker checkout, and stop.

## Steps

1. **Confirm the repo.** Run `git rev-parse --show-toplevel` and `git status --short`. Tell the user which repo will be
   mounted and how many uncommitted changes it has: the laptop and the container share the working tree.

2. **Find this session's id.**

   | Agent                               | Where the id is                                                                                             |
   | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
   | Claude Code                         | `${CLAUDE_SESSION_ID}`; if that still reads as a placeholder, run `printf '%s\n' "$CLAUDE_CODE_SESSION_ID"` |
   | Codex                               | run `printf '%s\n' "$CODEX_THREAD_ID"`                                                                      |
   | Anything else (Cursor, Gemini, ...) | none: hand over a brief (step 3)                                                                            |

   Only if those are empty, run `bbd sessions --json` in the repo, take the newest entry for your agent, and confirm it
   with the user before using it.

3. **Move it.** For Claude Code or Codex, from the repo:

   ```bash
   bbd start "$(git rev-parse --show-toplevel)" --json --resume <agent>:<id>
   ```

   bbd starts the workspace (the first start can take a minute) and answers with `"moving": true`. The move itself waits
   for this turn to end. Codex: bbd needs Docker, so it has to run outside Codex's own sandbox.

   For any other agent, write a brief to `.bbd/handoff.md` at the repo root (bitbang-docker keeps `.bbd/` out of git):
   the goal, what is done, what is next, decisions and open questions, the files involved, and how to test. No secrets.
   Then start a new agent with it (`--agent codex` if the user prefers Codex):

   ```bash
   bbd start "$(git rev-parse --show-toplevel)" --json --agent claude --brief .bbd/handoff.md --open chat
   ```

4. **Tell the user, then end your turn.** Run nothing after bbd answers: the move starts when your reply ends.

   - `"moving": true`: when this reply ends, this session closes here and continues in the workspace, and a QR code
     opens in a window. Scanning it with the phone's camera connects, pairs the phone and opens this conversation.
     Later, `bbd pull` in the repo brings the session back to this computer, and `claude --resume <id>` (or
     `codex resume <id>`) carries on with it here.
   - `"qr": "window"`: the QR code is open in a window on their screen; scanning it opens the new agent's chat.
   - `"qr": "none"`: there was no window to show it in; ask them to run `bbd qr` in a terminal.
   - bbd fails because the agent is not signed in, in the container: the session stays here. Ask the user to run
     `bbd login` in a terminal (once, for every workspace), then `/go-remote` again.
   - Warnings on stderr (a version difference, uncommitted changes) are worth passing on.

   The pairing code in the QR code expires in 10 minutes; `bbd qr` in a terminal makes a new one. If no QR code appears
   within a minute of your reply ending, the terminal this session ran in says why.
