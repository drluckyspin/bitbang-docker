#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: entrypoint.bash
#
# Description: Container entrypoint. Prepares git for the mounted repo, then runs the BitBang listener
#              under a watchdog. The listener's identity lives in tmpfs, so the URL is stable for the
#              life of the container (watchdog restarts keep it) and gone once the container stops.
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

# shellcheck source=scripts/log.bash
# shellcheck disable=SC1091
source /usr/local/lib/bitbang-docker/log.bash

WORKSPACE=/workspace
BITBANG_HOME=/tmp/bitbang
ICE_SERVERS_FILE=/etc/bitbang-docker/ice-servers.json
SESSION_COMMAND=bitbang-docker-session
WATCHDOG_INTERVAL="${BBD_WATCHDOG_INTERVAL:-300}"
WATCHDOG_MAX_FAILURES=2
READY_TIMEOUT=60

LISTENER_PID=""

# -----------------------------------------------------------------------------------------------------------
# Function: check_workspace
# Description: Refuse to start unless a host directory is mounted at /workspace.
# -----------------------------------------------------------------------------------------------------------
check_workspace() {
  if [ "$(stat -c %d "$WORKSPACE")" = "$(stat -c %d /)" ]; then
    log_error "Nothing is mounted at ${WORKSPACE}. Start the container with: make run-detached REPO=/path/to/repo"
    exit 1
  fi
  if [ ! -d "${WORKSPACE}/.git" ]; then
    log_warning "${WORKSPACE} is not a git repository"
  fi
}

# -----------------------------------------------------------------------------------------------------------
# Function: configure_git
# Description: Global git config lives in the home volume, never in the mounted repo. SSH remotes are
#              rewritten to HTTPS because the container holds no SSH keys; GH_TOKEN authenticates HTTPS.
# -----------------------------------------------------------------------------------------------------------
configure_git() {
  local lock="${HOME}/.config/bitbang-docker/git-config.lock"
  mkdir -p "$(dirname "$lock")"
  (
    flock -x 9
    configure_git_locked
  ) 9>"$lock"
}

configure_git_locked() {
  if ! git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$WORKSPACE"; then
    git config --global --add safe.directory "$WORKSPACE"
  fi

  git config --global --unset-all url."https://github.com/".insteadOf 2>/dev/null || true
  git config --global --add url."https://github.com/".insteadOf "git@github.com:"
  git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/"

  if [ -n "${GH_TOKEN:-}" ]; then
    if gh auth setup-git >/dev/null 2>&1; then
      log_success "GitHub HTTPS credentials come from GH_TOKEN"
    else
      log_warning "gh auth setup-git failed; git push may prompt for credentials"
    fi
  else
    log_info_dim "GH_TOKEN is not set; the container has no GitHub credentials"
  fi
}

# -----------------------------------------------------------------------------------------------------------
# Function: build_listener_args
# Description: Assemble the bitbang serve command line into the global LISTENER_ARGS array.
# -----------------------------------------------------------------------------------------------------------
build_listener_args() {
  LISTENER_ARGS=(serve -nocode -noqr -disable-shell-mirror -shell-max-sessions "${BITBANG_MAX_SESSIONS:-3}")
  if [ -n "${BITBANG_PIN:-}" ]; then
    LISTENER_ARGS+=(-pin "$BITBANG_PIN")
  fi
  if [ -e "$ICE_SERVERS_FILE" ]; then
    LISTENER_ARGS+=(-ice-servers "$ICE_SERVERS_FILE")
    log_info "Using TURN/STUN servers from config/ice-servers.json"
  fi
  LISTENER_ARGS+=(shell "$SESSION_COMMAND")
}

set_health() {
  echo "$1" >"${BITBANG_HOME}/health"
}

# -----------------------------------------------------------------------------------------------------------
# Function: start_listener
# Description: Start bitbang in the background with HOME on tmpfs, teeing its output to docker logs and
#              to serve.log, then wait until it has registered and record its URL.
# -----------------------------------------------------------------------------------------------------------
start_listener() {
  local log_file="${BITBANG_HOME}/serve.log"
  local waited=0

  : >"$log_file"
  HOME="$BITBANG_HOME" bitbang "${LISTENER_ARGS[@]}" > >(tee -a "$log_file") 2>&1 &
  LISTENER_PID=$!

  while ! grep -q '^Ready' "$log_file"; do
    if ! kill -0 "$LISTENER_PID" 2>/dev/null; then
      log_error "bitbang exited before registering with the signaling server"
      return 1
    fi
    if [ "$waited" -ge "$((READY_TIMEOUT * 2))" ]; then
      log_error "bitbang did not register within ${READY_TIMEOUT}s"
      return 1
    fi
    sleep 0.5
    waited=$((waited + 1))
  done

  grep -oE 'https://bitba\.ng/[^[:space:]]+' "$log_file" | tail -n 1 >"${BITBANG_HOME}/url"
  set_health ok
}

stop_listener() {
  if [ -n "$LISTENER_PID" ] && kill -0 "$LISTENER_PID" 2>/dev/null; then
    kill -TERM "$LISTENER_PID" 2>/dev/null || true
    wait "$LISTENER_PID" 2>/dev/null || true
  fi
}

# -----------------------------------------------------------------------------------------------------------
# Function: probe_listener
# Description: Connect to our own URL end to end. The listener refuses the command because its shell is
#              pinned to tmux, but only after a full handshake, so "Connected." proves the URL works.
# -----------------------------------------------------------------------------------------------------------
probe_listener() {
  local url output
  url="$(cat "${BITBANG_HOME}/url")"
  output="$(HOME="$BITBANG_HOME" timeout 60 bitbang connect "$url" -nosave -timeout 30s \
    ${BITBANG_PIN:+-pin "$BITBANG_PIN"} -- true </dev/null 2>&1)" || true
  if [[ "$output" == *"Connected."* ]]; then
    return 0
  fi
  log_warning "Watchdog probe failed: $(echo "$output" | tail -n 1)"
  return 1
}

# -----------------------------------------------------------------------------------------------------------
# Function: supervise_listener
# Description: Probe every WATCHDOG_INTERVAL seconds and return once the listener has exited or has
#              failed WATCHDOG_MAX_FAILURES probes in a row (it is then stopped).
# -----------------------------------------------------------------------------------------------------------
supervise_listener() {
  local failures=0 sleep_pid

  if [ "$WATCHDOG_INTERVAL" -le 0 ]; then
    wait "$LISTENER_PID" || true
    set_health down
    return
  fi

  while kill -0 "$LISTENER_PID" 2>/dev/null; do
    sleep "$WATCHDOG_INTERVAL" &
    sleep_pid=$!
    wait -n "$LISTENER_PID" "$sleep_pid" || true
    kill "$sleep_pid" 2>/dev/null || true
    kill -0 "$LISTENER_PID" 2>/dev/null || break

    if probe_listener; then
      failures=0
      set_health ok
      continue
    fi

    failures=$((failures + 1))
    if [ "$failures" -ge "$WATCHDOG_MAX_FAILURES" ]; then
      log_warning "Signaling server no longer reaches this listener; restarting it with the same URL"
      set_health stale
      stop_listener
      return
    fi
  done
  wait "$LISTENER_PID" 2>/dev/null || true
  set_health down
}

shutdown() {
  stop_listener
  exit 0
}

# -----------------------------------------------------------------------------------------------------------
# Script entry point
# -----------------------------------------------------------------------------------------------------------
main() {
  check_workspace
  configure_git
  build_listener_args

  install -d -m 0700 "$BITBANG_HOME"
  set_health starting
  trap shutdown TERM INT

  start_listener || exit 1
  while true; do
    supervise_listener
    log_warning "BitBang listener stopped; restarting in 3s"
    sleep 3 &
    wait $! || true
    start_listener || exit 1
  done
}

main "$@"
