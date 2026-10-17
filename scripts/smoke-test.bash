#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: smoke-test.bash
#
# Description: Starts a throwaway workspace container against a temporary git repo and asserts the
#              hardening, the toolchain, git, and an end-to-end BitBang connection. Uses .env.example
#              (never your .env) and its own home volume, and removes everything afterwards.
#
# Usage: ./scripts/smoke-test.bash
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

# shellcheck source=scripts/log.bash
# shellcheck disable=SC1091
source "$(dirname "$0")/log.bash"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT=bbd-smoke-test
PASSED=0
FAILED=0

# Never the real home volume: `down -v` below removes whatever this names.
export BBD_HOME_VOLUME=bbd-smoke-test-home
export BBD_ENV_FILE=.env.example
export BBD_WATCHDOG_INTERVAL=10
export USER_UID="${USER_UID:-1000}"
export USER_GID="${USER_GID:-1000}"
export GIT_AUTHOR_NAME="Smoke Test" GIT_AUTHOR_EMAIL="smoke@example.invalid"
export GIT_COMMITTER_NAME="Smoke Test" GIT_COMMITTER_EMAIL="smoke@example.invalid"

# Canaries: keys exported on the host must never reach the container.
export ANTHROPIC_API_KEY=bbd-smoke-canary OPENAI_API_KEY=bbd-smoke-canary GH_TOKEN=bbd-smoke-canary

compose() {
  docker compose --project-directory "$ROOT_DIR" -f "$ROOT_DIR/docker-compose.yml" \
    --env-file "$ROOT_DIR/.env.example" -p "$PROJECT" "$@"
}

in_container() {
  compose exec -T workspace bash -c "$1"
}

check() {
  local description="$1" command="$2"
  if in_container "$command" >/dev/null 2>&1; then
    log_indent log_success "$description"
    PASSED=$((PASSED + 1))
  else
    log_indent log_error "$description"
    FAILED=$((FAILED + 1))
  fi
}

cleanup() {
  log_info_dim "Removing the smoke-test container, volume and repo"
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "${BBD_REPO:-}"
}

main() {
  log_separator
  log_info "Smoke test"

  BBD_REPO="$(mktemp -d "${TMPDIR:-/tmp}/bbd-smoke.XXXXXX")"
  export BBD_REPO
  trap cleanup EXIT

  git -C "$BBD_REPO" init -q
  git -C "$BBD_REPO" remote add origin git@github.com:example/smoke.git
  echo "smoke" >"$BBD_REPO/README.md"
  git -C "$BBD_REPO" add README.md
  git -C "$BBD_REPO" -c user.name="Smoke Test" -c user.email=smoke@example.invalid commit -qm "initial"

  log_info_dim "Starting ${PROJECT} against ${BBD_REPO}"
  compose --progress quiet up -d

  local url
  if ! url="$(QR=0 TIMEOUT=60 "$ROOT_DIR/scripts/bitbang-url.bash" "$PROJECT")"; then
    log_error "The listener never registered"
    exit 1
  fi
  log_indent log_success "Listener registered: ${url%%#*}#..."
  PASSED=$((PASSED + 1))

  log_info "Hardening"
  check "Runs as a non-root user" '[ "$(id -u)" != 0 ]'
  check "PID 1 has no effective capabilities" 'grep -q "^CapEff:[[:space:]]*0000000000000000$" /proc/1/status'
  check "bitbang has no effective capabilities" \
    'grep -q "^CapEff:[[:space:]]*0000000000000000$" /proc/$(pgrep -o -x bitbang)/status'
  check "no_new_privs is set" 'grep -q "^NoNewPrivs:[[:space:]]*1$" /proc/1/status'
  check "Root filesystem is mounted read-only" 'awk '\''$2 == "/" { print $4 }'\'' /proc/mounts | grep -q "^ro\(,\|$\)"'
  check "/tmp is a tmpfs" 'awk '\''$2 == "/tmp" { print $3 }'\'' /proc/mounts | grep -qx tmpfs'
  check "Home volume is writable" 'touch /home/agent/.smoke && rm /home/agent/.smoke'
  check "No Docker socket is mounted" '[ ! -e /var/run/docker.sock ]'
  check "BitBang identity lives in tmpfs" '[ -f /tmp/bitbang/.bitbang/bitbang/identity.pem ] && [ ! -e /home/agent/.bitbang ]'
  check "TERM is set for tmux" '[ "$TERM" = xterm-256color ]'
  check "Host shell API keys and tokens do not leak in" '! env | grep -q bbd-smoke-canary'

  log_info "Toolchain"
  local tool
  for tool in "bitbang version" "claude --version" "codex --version" "gh --version" "git --version" \
    "node --version" "npm --version" "python3 --version" "uv --version" "tmux -V" "rg --version" \
    "jq --version" "qrencode -V"; do
    check "$tool" "$tool"
  done

  log_info "Workspace and git"
  check "Workspace is writable and shared with the host" 'touch /workspace/.smoke && [ -f /workspace/.smoke ]'
  if [ -f "$BBD_REPO/.smoke" ]; then
    log_indent log_success "File written in the container is visible on the host"
    PASSED=$((PASSED + 1))
  else
    log_indent log_error "File written in the container is visible on the host"
    FAILED=$((FAILED + 1))
  fi
  check "git commit works in /workspace" 'cd /workspace && git add .smoke && git commit -qm smoke'
  check "SSH GitHub remotes are rewritten to HTTPS" \
    'cd /workspace && git ls-remote --get-url origin | grep -q "^https://github.com/example/smoke.git$"'
  # .env.example leaves ANTHROPIC_API_KEY empty, so the exec environment carries ANTHROPIC_API_KEY="".
  check "tmux session drops empty API keys and uses the home volume" \
    'bitbang-docker-session -d && ! tmux show-environment -g ANTHROPIC_API_KEY 2>/dev/null &&
     tmux show-environment -g HOME | grep -qx HOME=/home/agent'
  in_container 'tmux kill-server' >/dev/null 2>&1 || true

  check "BBD_KEY_BAR=0 hides the phone key bar" \
    'BBD_KEY_BAR=0 tmux -L keybar-off new-session -d && [ "$(tmux -L keybar-off show -gv status)" = on ]
     result=$?; tmux -L keybar-off kill-server; exit $result'

  local keybar_result
  if keybar_result="$(compose exec -T workspace python3 - <"$ROOT_DIR/scripts/keybar-test.py" 2>&1)"; then
    log_indent log_success "Phone key bar sends Esc, Ctrl-C, Tab, Shift-Tab and arrows, and pages the scrollback"
    PASSED=$((PASSED + 1))
  else
    log_indent log_error "Phone key bar: ${keybar_result}"
    FAILED=$((FAILED + 1))
  fi

  log_info "Network"
  check "TLS to api.anthropic.com verifies" 'curl -sS -o /dev/null --max-time 15 https://api.anthropic.com/'
  check "End-to-end BitBang connection" \
    "HOME=/tmp timeout 60 bitbang connect '$url' -nosave -timeout 30s -- true </dev/null 2>&1 | grep -q '^Connected.'"

  local old_pid
  old_pid="$(in_container 'pgrep -o -x bitbang')"
  in_container "kill $old_pid"
  check "Listener restarts with the same URL after it exits" \
    "for _ in \$(seq 20); do
       pid=\$(pgrep -o -x bitbang) && [ \"\$pid\" != $old_pid ] && [ \"\$(cat /tmp/bitbang/health)\" = ok ] && break
       sleep 1
     done
     [ \"\$(pgrep -o -x bitbang)\" != $old_pid ] && [ \"\$(cat /tmp/bitbang/url)\" = '$url' ]"

  log_info_dim "Waiting for two watchdog probes"
  sleep 25
  check "Watchdog reports healthy" '[ "$(cat /tmp/bitbang/health)" = ok ]'
  if compose logs workspace 2>&1 | grep -q "probe failed"; then
    log_indent log_error "Watchdog probes succeed"
    FAILED=$((FAILED + 1))
  else
    log_indent log_success "Watchdog probes succeed"
    PASSED=$((PASSED + 1))
  fi

  log_separator
  if [ "$FAILED" -eq 0 ]; then
    log_success "Smoke test passed (${PASSED} checks)"
  else
    log_error "Smoke test failed: ${FAILED} of $((PASSED + FAILED)) checks"
    exit 1
  fi
}

main "$@"
