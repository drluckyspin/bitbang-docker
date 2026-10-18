# BitBang Docker

Work on one of your local git repos from your phone: chat with Claude Code or Codex, open a terminal, and browse the
files, all through [BitBang](https://github.com/richlegrand/bitbang). The repo is mounted into a locked-down container
that has Claude Code, Codex, `gh`, Node, Python and `uv` installed, so an agent can work on it from anywhere while it
stays fenced off from the rest of your machine.

`make run` shows a QR code. Scan it with your phone's camera, and you are in [Herdr](https://herdr.dev)'s web UI for the
repo, already paired. There are no ports to open, no accounts to create, and no SSH keys to manage.

## Quick start

You need Docker Desktop (macOS) or Docker Engine with Compose v2 (Linux), plus `make` and `git`.

```bash
make build                       # build the image (bakes in a Zscaler root CA if this Mac has one)
make run REPO=~/src/my-repo      # start, show the QR code, follow logs; Ctrl+C stops it
```

Without `REPO`, `make run` and `make run-detached` mount the directory you run them from, so
`make -C ~/src/bitbang-docker run` inside a repo mounts that repo.

The first run also builds `bbd`, the command-line tool behind the `make` targets, in Docker, so you need nothing else.
It creates `.env` from `.env.example`, readable by you only. Everything in it is optional, so the defaults work as they
are.

**Upgrading from an earlier version?** `.env.example` has new keys (`BBD_UI`, `BBD_DEFAULT_AGENT` and the `BBD_NTFY_*`
alert settings). The first run offers to write `.env.new`, your `.env` with the new keys added, for you to move into
place. It preserves existing values without printing them.

To leave the workspace running after you close the terminal, start it with `make run-detached REPO=~/src/my-repo`
instead. Then use these targets:

| Command                    | What it does                                                           |
| -------------------------- | ---------------------------------------------------------------------- |
| `make url`                 | Show a fresh QR code (`QR=false` prints only the link)                 |
| `make login`               | Sign Claude Code (or `AGENT=codex`) in, once for every workspace       |
| `make attach`              | Open the workspace's Herdr UI in this terminal                         |
| `make ping`                | List workspaces, their repos, and whether BitBang is registered        |
| `make logs`                | Follow the container log, with the URL taken out                       |
| `make down`                | Stop a workspace (all of them when `REPO` is not given)                |
| `make clean` / `make help` | Remove the images, `bbd` binaries and exported CAs / list every target |

Each repo gets its own workspace, named `bbd-<directory name>`, so several can run at once. When exactly one workspace
exists, these targets find it without `REPO`. With more than one, pass `REPO=` to say which.

## Two modes

`BBD_UI` in `.env` chooses what the QR code opens. It takes effect when the workspace next starts.

| Mode            | What the phone gets                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `web` (default) | [herdr-web-ui](https://github.com/devswha/herdr-web-ui): a chat view of each agent, terminal tabs and the repo's files |
| `shell`         | BitBang's own terminal on one shared tmux session, with a tappable key bar; the URL alone gets you a shell             |

In the web mode, the container runs a Herdr server, herdr-web-ui, and `bbd-ingress`, a small adapter that lets the app
run inside BitBang's page. Each agent runs in its own Herdr tab, so the laptop (`make attach`) and every paired phone
see the same agents. A new workspace has two tabs: Repo Shell, a shell in the repo, and one for the default agent, named
Claude or Codex; the QR code opens the agent's chat. Chat and Terminal, at the top, are two views of the tab you are on:
on the agent's tab, Terminal shows the agent's own screen, and the shell is in Repo Shell. `BBD_DEFAULT_AGENT=auto`
picks Claude Code when it is signed in, else Codex. With neither signed in, `bbd start` offers to sign you in, and the
repo's terminal on the phone says how. A new workspace starts a new conversation, with the tabs of the last one gone;
their transcripts stay, for `bbd pull` and `--resume`. A restarted container (`docker restart`) keeps its tabs.

## The bbd command

`make install-cli` installs `bbd` in `~/.local/bin` (set `BIN_DIR=` to change it), so you can run it from any repo:

| Command                    | What it does                                                                     |
| -------------------------- | -------------------------------------------------------------------------------- |
| `bbd start [path]`         | Start the workspace for a repo (default: the current directory) and show its QR  |
| `bbd start --agent claude` | Also start Claude Code (or `codex`) in a new tab, and open its chat on the phone |
| `bbd start --resume <id>`  | Move a session from this computer into the workspace, and open its chat          |
| `bbd qr [path]`            | Show a fresh QR code, with a new pairing code                                    |
| `bbd login [claude/codex]` | Sign an agent in, once for every workspace; Claude Code's token goes in `.env`   |
| `bbd ls`                   | List workspaces, their health, and the agents running in each                    |
| `bbd sessions [path]`      | List the Claude Code and Codex sessions on this computer that ran in the repo    |
| `bbd pull [path]`          | Copy the container's sessions back to this computer                              |
| `bbd attach [path]`        | Open the Herdr UI in this terminal (`--shell` for the tmux session)              |
| `bbd logs [path]`          | Show the container log, with the URL taken out                                   |
| `bbd stop [path]`          | Stop a workspace (`--all` stops every one)                                       |
| `bbd doctor`               | Check Docker, the image, `.env` and the agent CLIs on this computer              |
| `bbd install-skill`        | Install the `/go-remote` skill for Claude Code, Codex and Cursor                 |

`bbd help` lists every option. `--json` gives machine-readable output for scripts and agents.

## Taking an agent session to your phone

Working with Claude Code in a terminal and want to carry on away from the laptop? Type `/go-remote` (`$go-remote` in
Codex; `bbd install-skill` adds it). When the agent's reply ends, the session closes on the laptop and resumes in the
workspace, history and all, and a QR code opens in a window. Scan it, and the phone opens that same conversation, ready
for your next message. The link never passes through the agent.

For a session you have already quit, the same move from a terminal:

```bash
bbd sessions                      # find it: claude:<id> or codex:<id>
bbd start --resume claude:<id>    # continue it in the container, and open its chat on the phone
```

`bbd` copies the transcript into the container's home volume and resumes it in a new tab. The repo is mounted at the
same path as on your laptop, so the agent finds its session, and its files, where it left them.

- **One writer at a time.** A session moves, so only one side writes to it. Run from inside the session, as `/go-remote`
  runs it, `bbd` waits for the turn that ran it to end, then closes the laptop's agent before resuming the session. From
  a terminal, quit the session first; if its transcript changed in the last minute, `bbd` asks.
- **Or fork it.** `--fork` continues a copy, so the laptop's session can carry on too.
- **Brief it.** `--brief notes.md` copies a handoff note to `.bbd/handoff.md` in the repo, which git ignores, and asks
  the agent to read it. `/go-remote` in an agent `bbd` cannot resume, such as Cursor, writes a brief and starts Claude
  Code with it.
- **Bring it back.** Quit the agent in the container, then run `bbd pull`. It copies the container's sessions for the
  repo back, keeps a `.bak` of any laptop copy it replaces, and prints the command that resumes the session here.

The container's agent must be signed in first (see [Signing in](#signing-in-to-claude-code-and-codex)); otherwise the
session stays on the laptop and `bbd` says so. If no QR code appears after a move, the terminal the session ran in says
why. `bbd` warns when the laptop's Claude Code or Codex is a different version from the one pinned in the image, because
a newer transcript may not load in an older release. A session carries the conversation, never credentials.

For a new conversation instead, `bbd start` starts the workspace with its default agent signed in and no history, and
`bbd start --agent claude` opens another one beside it.

## Using it from a phone

**Pairing.** Scan the QR code with the camera. BitBang connects, and the pairing code in the link pairs the phone in the
same step. The code works once, and expires after ten minutes if nobody uses it. A paired phone stays paired when the
page reloads. To add another device, run `make url` (or `bbd qr`) for a new code. Herdr's settings, under Phone &
devices, list the paired devices and revoke them.

**Keys.** The terminal view has a row of keys above the phone keyboard: Esc, Tab, ^C, Ctrl, Alt, Shift, Enter and the
arrows. Herdr's settings let you change the row.

**Alerts.** Set `BBD_NTFY_TOPIC` and install the [ntfy](https://ntfy.sh) app to get a notification when an agent needs
you or finishes, even with BitBang closed. Alerts name the agent and the repo, never what was said, and tapping one does
not open the session. Anyone who knows the topic can read its alerts, so make it long and random, for example
`openssl rand -hex 16`.

**Signing in.** Long URLs and codes are hard to copy on a phone, so sign in from the laptop, once: `make login` (or
`bbd login`). For Claude Code it runs `claude setup-token` on the laptop and keeps the token in `.env`, so every
workspace starts signed in, its default agent ready to chat. `bbd` offers to restart the running ones so they get it.
For Codex, `make login AGENT=codex` signs it in inside the container, and its default agent starts a few seconds later.

### The shell mode

A phone keyboard has no Esc, Ctrl or arrow keys, and BitBang's browser terminal adds none. Swiping does not scroll
either, because the terminal (xterm.js) ignores touch gestures while tmux has mouse mode on. The bottom row of the tmux
status bar fills the gap with keys you tap:

| Key           | Sends                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| `Esc`         | Escape, for example to interrupt Claude Code                                    |
| `^C`          | Ctrl-C                                                                          |
| `Tab` `⇧Tab`  | Tab and Shift-Tab (Shift-Tab cycles Claude Code's modes)                        |
| `↑` `↓`       | Arrow keys, for menus and command history                                       |
| `PgUp` `PgDn` | Page through the scrollback; paging back to the bottom returns to the live view |

The row sits just above the keyboard and fits a 48-column phone screen. The laptop sees it too. To hide it, set
`BBD_KEY_BAR=false` in `.env`; the workspace starts without it next time.

## Configuration

All settings live in `.env`. It is gitignored and should stay mode `600`; `make check` and `bbd doctor` warn when it is
not.

| Variable                | Default           | Purpose                                                                     |
| ----------------------- | ----------------- | --------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`     | `""`              | API key for Claude Code. Leave empty to sign in with a subscription instead |
| `OPENAI_API_KEY`        | `""`              | API key for Codex. Leave empty to sign in with a subscription instead       |
| `GH_TOKEN`              | `""`              | Fine-grained GitHub token for `git push` and `gh` (see below)               |
| `BBD_UI`                | `web`             | [What the QR code opens](#two-modes): `web` or `shell`                      |
| `BBD_DEFAULT_AGENT`     | `auto`            | Web mode: `auto`, `claude`, `codex`, or `none`                              |
| `BITBANG_PIN`           | `""`              | PIN that BitBang asks for before connecting                                 |
| `BITBANG_MAX_SESSIONS`  | `3`               | Maximum concurrent shells across all browsers, in the shell mode            |
| `BBD_WATCHDOG_INTERVAL` | `300`             | Seconds between listener health probes; `0` turns the watchdog off          |
| `BBD_KEY_BAR`           | `true`            | `true` shows the [tmux key bar](#the-shell-mode); `false` hides it          |
| `BBD_NTFY_TOPIC`        | `""`              | ntfy topic for [agent alerts](#using-it-from-a-phone); empty turns them off |
| `BBD_NTFY_SERVER`       | `https://ntfy.sh` | The ntfy server                                                             |
| `BBD_NTFY_TOKEN`        | `""`              | Access token, for an ntfy server that requires one                          |
| `BBD_MEMORY`            | `4g`              | Container memory limit                                                      |
| `BBD_CPUS`              | `2`               | Container CPU limit                                                         |
| `BBD_RUNTIME`           | `runc`            | Container runtime; `runsc` runs it under gVisor on Linux hosts that have it |

The container receives keys and tokens **only from `.env`**. Keys exported in your shell, such as an `ANTHROPIC_API_KEY`
set in `~/.zprofile`, never reach it. Whoever gets into the workspace can read whatever the container holds, so keep
that set small on purpose. `make test` checks that nothing else gets in.

Commits use the `user.name` and `user.email` from the mounted repo's git config, or from your global git config.

### GitHub access

The container holds no SSH keys. SSH remotes such as `git@github.com:org/repo.git` are rewritten to HTTPS, and
`GH_TOKEN` authenticates both `git` and `gh`. Create a
[fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with:

- **Repository access:** only the repo you mount
- **Permissions:** Contents read and write, Pull requests read and write, Metadata read
- **Expiration:** as short as you can live with

Leave `GH_TOKEN` empty and the container has no GitHub access at all. You can still commit locally and push from the
host.

### Signing in to Claude Code and Codex

You can authenticate either way, and mix them per tool.

- **Claude Code subscription:** run `make login` (or `bbd login`). It runs `claude setup-token` on the laptop: you sign
  in in the browser as usual, and `bbd` saves the long-lived token it makes in `.env` as `CLAUDE_CODE_OAUTH_TOKEN`,
  without showing it. Every workspace then starts signed in. Running workspaces got their environment when they started,
  so `bbd` offers to restart them, which gives them new links. To use a token you already have, put it in `.env`
  yourself. Without Claude Code on the laptop, `bbd login` signs it in inside the container instead
  (`claude auth login`: open the link, sign in, and paste the code back).
- **Codex subscription:** run `make login AGENT=codex` (or `bbd login codex`). It runs `codex login --device-auth` in
  the container, on your terminal: enter the shown code on the page. The same commands also work from a workspace
  terminal. Logins made in the container are saved in the `bitbang-docker-home` volume and survive restarts.
- **API key:** set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env`. Codex is signed in with its key when the workspace
  starts. Claude Code uses `ANTHROPIC_API_KEY` ahead of a token, so leave it empty to use your subscription.

Each agent asks a few questions the first time it runs, and on a phone they get in the way of the chat. The container
answers them for you when a workspace starts: Claude Code's theme and onboarding, whether to use the API key from
`.env`, both agents' trust in the mounted repo, and Codex's review of the hook that tells Herdr its session ID.

That home volume is shared by every workspace, so you sign in once for all repos. It also keeps shell history, global
git config and handed-over sessions. `bbd` creates it outside compose, so `docker compose down -v` leaves it alone;
`make clean-home` deletes it after asking.

The image is read-only. To add tools, install them into your home directory, for example `uv tool install ruff`, or
`npm config set prefix ~/.npm-global` followed by `npm install -g <package>`.

## Security model

The container is built to limit what a shell, or an agent running in it, can reach on your machine.

| Control               | Setting                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Mounted files         | Only the repo (read-write, at its own path) and the home volume; `bbd` refuses `/`, `~` and system paths                  |
| User                  | Non-root `agent`, matching your uid on Linux                                                                              |
| Linux capabilities    | All dropped, with `no-new-privileges`                                                                                     |
| Root filesystem       | Read-only; `/tmp` is a `nosuid`, `nodev` tmpfs                                                                            |
| Docker socket         | Not mounted                                                                                                               |
| Published ports       | None; BitBang connects outbound only, and everything inside listens on loopback                                           |
| Resource limits       | 1024 processes, plus the memory and CPU limits from `.env`                                                                |
| Secrets               | Only those in `.env`; host shell variables are not passed through                                                         |
| Web UI access         | A paired device, or a random access token that never leaves the container                                                 |
| Updates and telemetry | Off in Herdr, herdr-web-ui, Claude Code, Codex, Bun and `bbd`; every component is pinned, and `make test` checks the pins |

Know these limits before you rely on it:

- **The link is the key.** In the shell mode, the URL grants a shell to anyone who has it. In the web mode, the URL
  alone reaches only the pairing screen, but the link in the QR code also carries a pairing code that lets one device
  in. `bbd` shows the link only in an interactive terminal or in a window on your screen, never when its output goes to
  a pipe or an agent, and `make logs` takes the URL out. Treat the QR code like a password: set `BITBANG_PIN` for a
  second factor, and use `QR=false` when someone can see your screen.
- **A paired device stays paired.** Pairings are kept per repo in the home volume, so they survive restarts. Revoke a
  lost phone in Herdr's settings.
- **Each workspace gets a new URL.** It stays the same while the container runs, including watchdog restarts. A fresh
  container (`make down` then `make run`, or a changed `.env`) gets a fresh URL, and the old one stops working.
- **Network access is open.** The container can reach the internet and anything your host can reach, including your LAN
  and services listening on the host. Only the tools you have given it credentials for can act as you.
- **The repo is fully writable.** An agent can rewrite any file in it, including `.git` and git hooks that run the next
  time you use git on the host. Review changes before running git on the host.
- **Codex runs without its own sandbox.** Codex's sandbox needs user namespaces, which the container does not allow, so
  it would fail every command. The image sets `sandbox_mode = "danger-full-access"` with
  `approval_policy = "on-request"` in `/etc/codex/config.toml`, so the container's limits are the ones that apply, and
  Codex still asks before a command it judges risky. Your own settings in the container's `~/.codex/config.toml` take
  precedence. Claude Code asks for permissions as it does anywhere.
- **The Claude Code token signs in every workspace.** `CLAUDE_CODE_OAUTH_TOKEN` is in each container's environment, like
  the API keys, where anyone who gets into a workspace can read it. `bbd login` never prints it, and keeps `.env` mode
  `600`.
- **A move ends the laptop's agent.** `/go-remote` leaves a `bbd` helper running in the background. Once the turn ends,
  it stops the agent process that ran it (the one the session is open in, and no other) before resuming the session in
  the container. Its log, which holds no links, is in `~/.local/state/bbd/`.
- **Handed-over sessions travel with the agent.** A transcript holds everything said in the session, including anything
  you pasted into it. `bbd start --resume` copies it into the home volume, where anyone who gets into a workspace can
  read it.
- **A pulled session brings the container's work home.** `bbd pull` copies what the container's agent wrote into your
  laptop's sessions, and the agent you resume it with there has none of the container's limits. Read what the agent did
  before you carry on, as you would its changes to the repo. `bbd pull` writes only session files for the repo, and only
  inside `~/.claude` and `~/.codex`.
- **Git worktrees and submodules are not supported.** Their `.git` points outside the mount, so `bbd` refuses to mount a
  worktree; mount the main checkout instead.
- **Signaling skips TLS verification.** BitBang does not verify the TLS certificate of its signaling server. Its
  [security model](https://github.com/richlegrand/bitbang-cli/blob/main/SECURITY.md) is that sessions are end-to-end
  encrypted and the signaling server cannot read or join them, so TLS on that leg is not what protects you. Anyone on
  the path can still block connections.
- **These are young projects.** BitBang, Herdr and herdr-web-ui all move fast. Read
  [BitBang's README](https://github.com/richlegrand/bitbang-cli) before you depend on it.

## Connection reliability

**Watchdog.** If the host sleeps, BitBang's connection to the signaling server can die without either side noticing, and
browsers then report "Device not found". Every `BBD_WATCHDOG_INTERVAL` seconds the container connects to its own URL,
and in the web mode also checks that the app answers through the adapter. After two failures in a row, it restarts the
listener with the same identity, so the URL keeps working. `make ping` shows the result of the most recent check.

**Sleep.** While a workspace runs, `bbd` keeps the Mac awake (with `caffeinate`, until the container stops). Closing the
lid on battery still puts it to sleep, which drops the phone's connection; `bbd` warns when the Mac is on battery.

**Relays.** When a direct peer-to-peer path is impossible, BitBang falls back to the `bitba.ng` TURN relay, which is
time-limited. In testing on a Mac behind Zscaler, a phone on cellular was relayed. For long sessions, use your own TURN
server: copy `config/ice-servers.example.json` to `config/ice-servers.json`, fill in your provider's details (coturn,
Cloudflare and Twilio all work), and restart the workspace. That file is gitignored. A file that does not parse stops
the listener at startup instead of quietly falling back.

## Corporate networks and Zscaler

Zscaler inspects TLS to some hosts, including `api.anthropic.com` and `bitba.ng`. On macOS, `make build` and `make cli`
export the `Zscaler Root CA` from the System keychain into `certs/`, and the builds trust it. Any other `*.crt` you put
in `certs/` before building is trusted too.

If BitBang still cannot connect through the proxy, temporarily turn off Zscaler Internet Security to confirm that it is
the cause.

## Checking it on a real phone

`make e2e` drives a phone browser through a real BitBang URL, but not a real phone. After a change, check these by hand:

1. `make run REPO=~/src/my-repo`, then scan the QR code with the camera: the terminal opens, already paired.
2. Type a command, and the output appears. Try Esc, Tab and Ctrl-C from the key row.
3. Lock the phone for a minute and unlock it: the page reconnects.
4. Reload the page: it stays paired. Scan a code that is more than ten minutes old: only the pairing screen appears.
5. `bbd start ~/src/my-repo --agent claude`: the chat view opens on the phone, and a message reaches the agent.
6. With `BBD_NTFY_TOPIC` set, an agent that finishes sends an alert.
7. With `BBD_UI=shell`: BitBang's terminal opens on the tmux session, with the key bar.
8. `/go-remote` in a Claude Code session on the laptop: when its reply ends, the session closes and a QR code opens.
   Scan it, and the phone shows the conversation; send a message, and it carries on.

## Troubleshooting

| Symptom                                             | Fix                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Browser says "Device not found"                     | `make ping`; restart a stopped workspace, or wait for the watchdog                      |
| The phone shows the pairing screen                  | The code was used or expired; `make url` makes a new one                                |
| `make url` times out                                | Run `make logs`; a bad `config/ice-servers.json` stops the listener                     |
| `curl: (60)` or certificate errors in the container | Rerun `make build` so it re-exports your proxy's root CA                                |
| Permission denied writing to the repo on Linux      | Rebuild with `make build` as the user that owns the repo                                |
| `claude` uses an empty API key                      | Use `make attach` or the phone's terminal, not a bare `docker exec`                     |
| macOS kills `bbd` as soon as it starts              | `codesign --force --sign - ~/.local/bin/bbd` (`make install-cli` does this when needed) |

## Development

```bash
make lint      # dprint formatting check, shellcheck, docker-compose.yml validation
make format    # apply dprint, shfmt and mbake formatting
make unit      # type-check and unit-test bbd and bbd-ingress, in Docker
make test      # 66-check smoke test of both modes in a throwaway container (needs make build)
make e2e       # Playwright phone test through a real BitBang URL: chat with Claude Code, then a moved session
make cli       # bbd for macOS and Linux, arm64 and x64, into dist/
```

`make test` and `make e2e` use `.env.example` and their own home volumes, so they never read your `.env` or touch your
logins, and they never print a URL or pairing code. `make e2e` adds a made-up Anthropic key, for a stand-in API that it
runs inside the container: the default agent starts on its own, and the phone's chat gets its reply from the real Claude
Code. It then moves a session in as `/go-remote` does, with stand-ins for the laptop's session store and agent, and the
phone must see the session's earlier turns and carry the same conversation on.

| Path                 | Purpose                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`         | Image with pinned, checksum-verified BitBang and Herdr, herdr-web-ui, Claude Code, Codex and tools              |
| `docker-compose.yml` | Hardening, mounts and limits for one workspace                                                                  |
| `docker/`            | Entrypoint (git, services, the watched listener), the session, attach, pairing and agent commands, Codex config |
| `ingress/`           | `bbd-ingress`, the adapter between BitBang's proxy and herdr-web-ui, and the ntfy alerts                        |
| `cli/`               | `bbd`, compiled in Docker by `cli/Dockerfile`                                                                   |
| `skills/`            | The `/go-remote` skill that `bbd install-skill` installs                                                        |
| `e2e/`               | The Playwright phone test, and the stand-in Anthropic API its chat talks to                                     |
| `Common.make`        | All make targets; `Makefile` only includes it                                                                   |
| `scripts/`           | CA export, the smoke, e2e and key bar tests, and the `log.bash` logger                                          |

[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists the software this builds on, and its licenses.
