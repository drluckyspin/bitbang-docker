# BitBang Docker

Open a shell on one of your local git repos from any browser, including your phone, through
[BitBang](https://github.com/richlegrand/bitbang). The repo is mounted into a locked-down container that has Claude
Code, Codex, `gh`, Node, Python and `uv` installed, so you can run an agent against the repo from anywhere while it
stays fenced off from the rest of your machine.

`make run` prints a QR code. Scan it, and you are in a tmux session in the repo. There are no ports to open, no accounts
to create, and no SSH keys to manage.

## Quick start

You need Docker Desktop (macOS) or Docker Engine with Compose v2 (Linux), plus `make` and `git`.

```bash
make build                       # build the image (bakes in a Zscaler root CA if this Mac has one)
make run REPO=~/src/my-repo      # start, print the QR code, follow logs; Ctrl+C stops it
```

The first `make` that needs it creates `.env` from `.env.example`, readable by you only. Everything in it is optional,
so the defaults work as they are.

To leave the workspace running after you close the terminal, start it with `make run-detached REPO=~/src/my-repo`
instead. Then use these targets:

| Command                    | What it does                                                     |
| -------------------------- | ---------------------------------------------------------------- |
| `make url`                 | Print the QR code and URL again (`QR=false` prints only the URL) |
| `make attach`              | Join the same tmux session from this terminal                    |
| `make ping`                | List workspaces, their repos, and whether BitBang is registered  |
| `make logs`                | Follow the container log                                         |
| `make down`                | Stop a workspace (all of them when `REPO` is not given)          |
| `make clean` / `make help` | Remove the image and exported CAs / list every target            |

Each repo gets its own workspace, named `bbd-<directory name>`, so several can run at once. When exactly one workspace
exists, these targets find it without `REPO`. With more than one, pass `REPO=` to say which.

Every browser, plus `make attach`, joins the same tmux session, so you can start an agent on your laptop and check on it
from your phone.

## Using it from a phone

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
`BBD_KEY_BAR=false` in `.env`; `make run` or `make run-detached` then restarts the workspace without it.

Long URLs and codes are hard to copy on a phone. To sign in to Claude Code or Codex, run `make attach` on your laptop
and finish the login there. It is the same tmux session, and the login is saved for the phone too.

## Configuration

All settings live in `.env`. It is gitignored and should stay mode `600`; `make check` warns when it is not.

| Variable                | Default | Purpose                                                                     |
| ----------------------- | ------- | --------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`     | `""`    | API key for Claude Code. Leave empty to sign in with a subscription instead |
| `OPENAI_API_KEY`        | `""`    | API key for Codex. Leave empty to sign in with a subscription instead       |
| `GH_TOKEN`              | `""`    | Fine-grained GitHub token for `git push` and `gh` (see below)               |
| `BITBANG_PIN`           | `""`    | PIN that BitBang asks for before opening a shell                            |
| `BITBANG_MAX_SESSIONS`  | `3`     | Maximum concurrent shells across all browsers                               |
| `BBD_WATCHDOG_INTERVAL` | `300`   | Seconds between listener health probes; `0` turns the watchdog off          |
| `BBD_KEY_BAR`           | `true`  | `true` shows the [phone key bar](#using-it-from-a-phone); `false` hides it  |
| `BBD_MEMORY`            | `4g`    | Container memory limit                                                      |
| `BBD_CPUS`              | `2`     | Container CPU limit                                                         |
| `BBD_RUNTIME`           | `runc`  | Container runtime; `runsc` runs it under gVisor on Linux hosts that have it |

The container receives keys and tokens **only from `.env`**. Keys exported in your shell, such as an `ANTHROPIC_API_KEY`
set in `~/.zprofile`, never reach it. Anyone with the URL gets a shell in the container, so whatever the container holds
is theirs to read; keep that set small on purpose. `make test` checks this.

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

- **API key:** set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env`.
- **Subscription:** leave the key empty and sign in once from a workspace shell with `claude auth login` or
  `codex login --device-auth`. Both print a URL to open in any browser, so they work from a phone. Logins are saved in
  the `bitbang-docker-home` volume and survive restarts.

That home volume is shared by every workspace, so you sign in once for all repos. It also keeps shell history and global
git config. `make clean-home` deletes it after asking.

The image is read-only. To add tools, install them into your home directory, for example `uv tool install ruff`, or
`npm config set prefix ~/.npm-global` followed by `npm install -g <package>`.

## Security model

The container is built to limit what a shell, or an agent running in it, can reach on your machine.

| Control            | Setting                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| Mounted files      | Only `REPO` (read-write) and the home volume; `make` refuses `/` and `~` |
| User               | Non-root `agent`, matching your uid on Linux                             |
| Linux capabilities | All dropped, with `no-new-privileges`                                    |
| Root filesystem    | Read-only; `/tmp` is a `nosuid`, `nodev` tmpfs                           |
| Docker socket      | Not mounted                                                              |
| Published ports    | None; BitBang connects outbound only                                     |
| Resource limits    | 512 processes, plus the memory and CPU limits from `.env`                |
| Secrets            | Only those in `.env`; host shell variables are not passed through        |

Know these limits before you rely on it:

- **The URL is the key.** The QR code and the URL each grant a shell to anyone who has them, until the workspace stops.
  Treat them like a password. Set `BITBANG_PIN` for a second factor, and use `QR=false` when someone can see your
  screen. The URL also appears in `docker logs`.
- **Each workspace gets a new URL.** It stays the same while the container runs, including watchdog restarts. A fresh
  container (`make down` then `make run`, or a changed `.env`) gets a fresh URL, and the old one stops working.
- **Network access is open.** The container can reach the internet and anything your host can reach, including your LAN
  and services listening on the host. Only the tools you have given it credentials for can act as you.
- **The repo is fully writable.** An agent can rewrite any file in it, including `.git` and git hooks that run the next
  time you use git on the host. Review changes before running git on the host.
- **Git worktrees and submodules are not supported.** Their `.git` points outside the mount, so `make` refuses to mount
  a worktree; mount the main checkout instead.
- **Signaling skips TLS verification.** BitBang does not verify the TLS certificate of its signaling server. Its
  [security model](https://github.com/richlegrand/bitbang-cli/blob/main/SECURITY.md) is that sessions are end-to-end
  encrypted and the signaling server cannot read or join them, so TLS on that leg is not what protects you. Anyone on
  the path can still block connections.
- **BitBang is a young project.** Read its [README](https://github.com/richlegrand/bitbang-cli) before you depend on it.

## Connection reliability

**Watchdog.** If the host sleeps, BitBang's connection to the signaling server can die without either side noticing, and
browsers then report "Device not found". Every `BBD_WATCHDOG_INTERVAL` seconds the container connects to its own URL.
After two failures in a row, it restarts the listener with the same identity, so the URL keeps working. `make ping`
shows the result of the most recent check.

**Relays.** When a direct peer-to-peer path is impossible, BitBang falls back to the `bitba.ng` TURN relay, which is
time-limited. In testing on a Mac behind Zscaler, a phone on cellular was relayed. For long sessions, use your own TURN
server: copy `config/ice-servers.example.json` to `config/ice-servers.json`, fill in your provider's details (coturn,
Cloudflare and Twilio all work), and restart the workspace. That file is gitignored. A file that does not parse stops
the listener at startup instead of quietly falling back.

## Corporate networks and Zscaler

Zscaler inspects TLS to some hosts, including `api.anthropic.com` and `bitba.ng`. On macOS, `make build` exports the
`Zscaler Root CA` from the System keychain into `certs/`, and the image trusts it. Any other `*.crt` you put in `certs/`
before building is trusted too.

If BitBang still cannot connect through the proxy, temporarily turn off Zscaler Internet Security to confirm that it is
the cause.

## Troubleshooting

| Symptom                                             | Fix                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| Browser says "Device not found"                     | `make ping`; restart a stopped workspace, or wait for the watchdog  |
| `make url` times out                                | Run `make logs`; a bad `config/ice-servers.json` stops the listener |
| `curl: (60)` or certificate errors in the container | Rerun `make build` so it re-exports your proxy's root CA            |
| Permission denied writing to the repo on Linux      | Rebuild with `make build` as the user that owns the repo            |
| `claude` uses an empty API key                      | Use `make attach` or the browser shell, not a bare `docker exec`    |

## Development

```bash
make lint      # dprint formatting check, shellcheck, docker-compose.yml validation
make format    # apply dprint, shfmt and mbake formatting
make test      # 37-check smoke test in a throwaway container (needs make build)
```

`make test` uses `.env.example` and its own home volume, so it never reads your `.env` or touches your logins.

| Path                     | Purpose                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| `Dockerfile`             | Image with pinned BitBang (checksum-verified), Claude Code, Codex and tools      |
| `docker-compose.yml`     | Hardening, mounts and limits for one workspace                                   |
| `docker/entrypoint.bash` | Git setup, then the BitBang listener under the watchdog                          |
| `docker/session.bash`    | Opens the shared tmux session with a clean environment                           |
| `Common.make`            | All make targets; `Makefile` only includes it                                    |
| `scripts/`               | URL and QR output, CA export, smoke and key bar tests, and the `log.bash` logger |
