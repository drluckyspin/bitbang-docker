#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: e2e.bash
#
# Description: Drives a web-mode workspace through its real BitBang URL with Playwright (Chromium, Pixel 7
#              emulation): an unpaired phone must see the pairing screen, the one-scan link must pair it and
#              open the terminal, a typed command must run in the pane, and a reload must stay paired. The
#              URL and pairing code go to the browser through a private temp directory and are never
#              printed. Without a project, it starts a throwaway workspace (temporary repo and home volume)
#              and removes it afterwards. That one's Claude Code talks to a stand-in for the Anthropic API
#              (e2e/mock-anthropic.ts, inside the container), so the check also proves the default agent
#              starts on its own and that a message sent from the phone's Chat comes back as its reply.
#              It then moves a laptop session in, the way /go-remote does: the phone must see its earlier
#              turns and carry on the same conversation.
#
# Usage: ./scripts/e2e.bash [compose_project]
#
# Environment:
#   GO_REMOTE           go-remote command (default: dist/go-remote-<os>-<arch>, built by make cli)
#   E2E_IMAGE           Test image (default go-remote-e2e:latest, built by make e2e)
#   E2E_SCREENSHOTS     Directory for screenshots of each step (default: none)
#   GR_E2E_TRACE        Set to print frame navigations and pairing requests (paths and parameter names only)
#   GR_E2E_TIMEOUT_MS   How long each step may take (default 120000)
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

# shellcheck source=scripts/log.bash
# shellcheck disable=SC1091
source "$(dirname "$0")/log.bash"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
E2E_IMAGE="${E2E_IMAGE:-go-remote-e2e:latest}"
PROJECT=""
SECRET_DIR=""
ENV_DIR=""
THROWAWAY_REPO=""
THROWAWAY_VOLUME=""
MOCK_PORT=8099
LAPTOP_DIR=""
STAND_IN_PID=""
MOVE_ID=""
MOVED_PANE=""

host_go_remote() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in
    arm64 | aarch64) arch=arm64 ;;
    *) arch=x64 ;;
  esac
  echo "${ROOT_DIR}/dist/go-remote-${os}-${arch}"
}

GO_REMOTE="${GO_REMOTE:-$(host_go_remote)}"

cleanup() {
  local dir
  if [ -n "$STAND_IN_PID" ]; then
    kill "$STAND_IN_PID" 2>/dev/null || true
  fi
  for dir in "$SECRET_DIR" "$ENV_DIR" "$LAPTOP_DIR"; do
    if [ -n "$dir" ]; then
      rm -rf "$dir"
    fi
  done
  if [ -n "$THROWAWAY_REPO" ]; then
    log_info_dim "Removing the throwaway workspace, its home volume and repo"
    GR_ROOT="$ROOT_DIR" GR_HOME_VOLUME="$THROWAWAY_VOLUME" "$GO_REMOTE" stop "$THROWAWAY_REPO" >/dev/null 2>&1 || true
    docker volume rm "$THROWAWAY_VOLUME" >/dev/null 2>&1 || true
    rm -rf "$THROWAWAY_REPO"
  fi
}

# -----------------------------------------------------------------------------------------------------------
# Function: start_throwaway
# Description: Start a workspace for a new temporary repo, with its own home volume, whose only key is a
#              made-up ANTHROPIC_API_KEY for the mock API. Sets PROJECT to its compose project.
# -----------------------------------------------------------------------------------------------------------
start_throwaway() {
  local result
  THROWAWAY_REPO="$(mktemp -d "${TMPDIR:-/tmp}/go-remote-e2e.XXXXXX")"
  THROWAWAY_REPO="$(cd "$THROWAWAY_REPO" && pwd -P)"
  THROWAWAY_VOLUME="go-remote-e2e-home-${RANDOM}${RANDOM}"
  git -C "$THROWAWAY_REPO" init -q
  echo "e2e" >"${THROWAWAY_REPO}/README.md"

  ENV_DIR="$(mktemp -d "${TMPDIR:-/tmp}/go-remote-e2e-env.XXXXXX")"
  chmod 700 "$ENV_DIR"
  cp "${ROOT_DIR}/.env.example" "${ENV_DIR}/env.example"
  (
    umask 077
    sed -e "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=sk-ant-api03-e2e-mock-${RANDOM}${RANDOM}${RANDOM}|" \
      "${ROOT_DIR}/.env.example" >"${ENV_DIR}/env"
    printf 'ANTHROPIC_BASE_URL=http://127.0.0.1:%s\nCLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1\n' "$MOCK_PORT" >>"${ENV_DIR}/env"
  )

  log_info "Starting a throwaway workspace"
  result="$(GR_ROOT="$ROOT_DIR" GR_ENV_FILE="${ENV_DIR}/env" GR_HOME_VOLUME="$THROWAWAY_VOLUME" \
    "$GO_REMOTE" start "$THROWAWAY_REPO" --json --no-window)"
  PROJECT="$(jq -r .project <<<"$result")"
}

# -----------------------------------------------------------------------------------------------------------
# Function: start_mock_api
# Description: Run the stand-in Anthropic API on the container's loopback, where ANTHROPIC_BASE_URL points.
# -----------------------------------------------------------------------------------------------------------
start_mock_api() {
  local cid="$1" waited=0
  docker exec -i "$cid" sh -c 'cat >/tmp/go-remote/mock-anthropic.ts' <"${ROOT_DIR}/e2e/mock-anthropic.ts"
  docker exec -d "$cid" sh -c "exec bun /tmp/go-remote/mock-anthropic.ts ${MOCK_PORT} >/tmp/go-remote/mock-anthropic.log 2>&1"
  until docker exec "$cid" curl -fsS -o /dev/null -X POST "http://127.0.0.1:${MOCK_PORT}/v1/messages/count_tokens" -d '{}'; do
    if [ "$waited" -ge 20 ]; then
      log_error "The mock Anthropic API did not start"
      return 1
    fi
    sleep 0.5
    waited=$((waited + 1))
  done
}

new_uuid() {
  uuidgen | tr '[:upper:]' '[:lower:]'
}

# -----------------------------------------------------------------------------------------------------------
# Function: append_entry
# Description: Append one entry to a Claude Code transcript, chained after its last message and in the
#              shape of the entries Claude Code itself wrote there.
# -----------------------------------------------------------------------------------------------------------
append_entry() {
  local file="$1" entry="$2" last
  last="$(jq -c 'select(.type == "user" or .type == "assistant")' "$file" | tail -n 1)"
  jq -c --argjson entry "$entry" --arg uuid "$(new_uuid)" \
    '{parentUuid: .uuid, isSidechain: false, userType: "external", cwd, sessionId, version, gitBranch,
      uuid: $uuid, timestamp: (now | todate)} + $entry' <<<"$last" >>"$file"
}

# -----------------------------------------------------------------------------------------------------------
# Function: wait_for_file
# Description: Wait up to a number of seconds for a file to exist (and, given a pattern, to contain it).
# -----------------------------------------------------------------------------------------------------------
wait_for_file() {
  local file="$1" seconds="$2" pattern="${3:-}" waited=0
  until [ -e "$file" ] && { [ -z "$pattern" ] || grep -qE -- "$pattern" "$file"; }; do
    if [ "$waited" -ge "$((seconds * 2))" ]; then
      return 1
    fi
    sleep 0.5
    waited=$((waited + 1))
  done
}

# -----------------------------------------------------------------------------------------------------------
# Function: move_session
# Description: The /go-remote path, with stand-ins for the laptop. Claude Code in the container makes a
#              real session against the mock, which is then taken out to a laptop store (CLAUDE_CONFIG_DIR).
#              A stand-in agent process named claude is in a turn of that session: it runs
#              go-remote start --resume on it, and the turn then ends. go-remote must wait for the end, end the stand-in
#              and resume the same session in the container. Sets MOVED_PANE.
# -----------------------------------------------------------------------------------------------------------
move_session() {
  local cid="$1" marker="$2" project_dir file move_dir stores result
  MOVE_ID="$(new_uuid)"
  LAPTOP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/go-remote-e2e-laptop.XXXXXX")"
  chmod 700 "$LAPTOP_DIR"
  move_dir="${LAPTOP_DIR}/move"
  mkdir -p "$move_dir" "${LAPTOP_DIR}/state"
  project_dir="$(printf '%s' "$THROWAWAY_REPO" | sed 's/[^A-Za-z0-9]/-/g')"
  stores="/home/agent/.claude/projects/${project_dir}"

  docker exec -w "$THROWAWAY_REPO" "$cid" claude -p "Reply to ${marker}" --session-id "$MOVE_ID" >/dev/null
  mkdir -p "${LAPTOP_DIR}/claude/projects/${project_dir}"
  file="${LAPTOP_DIR}/claude/projects/${project_dir}/${MOVE_ID}.jsonl"
  docker exec "$cid" cat "${stores}/${MOVE_ID}.jsonl" >"$file"
  docker exec "$cid" rm -f "${stores}/${MOVE_ID}.jsonl"
  if ! grep -qF -- "${marker}-reply" "$file"; then
    log_error "Claude Code did not make the session to move"
    return 1
  fi

  # The laptop's agent, in the turn that runs /go-remote: its tool call is in the transcript.
  append_entry "$file" '{"type": "user", "message": {"role": "user", "content": "/go-remote"}}'
  append_entry "$file" '{"type": "assistant", "message": {"id": "msg_e2e_move", "type": "message", "role": "assistant",
    "model": "claude-mock", "content": [{"type": "tool_use", "id": "toolu_e2e_move", "name": "Bash",
    "input": {"command": "go-remote start --resume"}}], "stop_reason": "tool_use", "stop_sequence": null,
    "usage": {"input_tokens": 1, "output_tokens": 1}}}'
  cat >"${move_dir}/claude" <<'STAND_IN'
#!/usr/bin/env bash
# Stands in for the laptop's Claude Code: runs go-remote from its turn, then stays open until something ends it.
trap 'touch "${MOVE_DIR}/ended"; exit 0' TERM
"$GO_REMOTE" start "$REPO" --json --no-window --resume "claude:${MOVE_ID}" >"${MOVE_DIR}/start.json" 2>"${MOVE_DIR}/start.err"
echo "$?" >"${MOVE_DIR}/start.code"
while :; do sleep 0.2; done
STAND_IN
  chmod +x "${move_dir}/claude"

  log_info "Moving a laptop session in, as /go-remote does"
  GO_REMOTE="$GO_REMOTE" REPO="$THROWAWAY_REPO" MOVE_ID="$MOVE_ID" MOVE_DIR="$move_dir" GR_ROOT="$ROOT_DIR" \
    GR_ENV_FILE="${ENV_DIR}/env" GR_HOME_VOLUME="$THROWAWAY_VOLUME" CLAUDE_CONFIG_DIR="${LAPTOP_DIR}/claude" \
    XDG_STATE_HOME="${LAPTOP_DIR}/state" "${move_dir}/claude" &
  STAND_IN_PID=$!
  if ! wait_for_file "${move_dir}/start.code" 120 || [ "$(cat "${move_dir}/start.code")" != 0 ]; then
    log_error "go-remote start --resume failed: $(tail -n 3 "${move_dir}/start.err" 2>/dev/null)"
    return 1
  fi
  result="$(cat "${move_dir}/start.json")"
  if [ "$(jq -r '.moving' <<<"$result")" != true ] || [ "$(jq -r '.qr' <<<"$result")" != pending ]; then
    log_error "go-remote did not wait for the turn to end: $(jq -c '{moving, qr}' <<<"$result")"
    return 1
  fi
  log_success "go-remote saw the session was still in its turn, and left the move for when it ends"
  sleep 3
  if [ -e "${move_dir}/ended" ]; then
    log_error "go-remote ended the laptop's session before its turn was over"
    return 1
  fi

  # The tool call returns and the agent's reply ends the turn.
  append_entry "$file" '{"type": "user", "message": {"role": "user", "content": [{"type": "tool_result",
    "tool_use_id": "toolu_e2e_move", "content": "moving"}]}}'
  append_entry "$file" '{"type": "assistant", "message": {"id": "msg_e2e_moved", "type": "message", "role": "assistant",
    "model": "claude-mock", "content": [{"type": "text", "text": "This session moves when this reply ends."}],
    "stop_reason": "end_turn", "stop_sequence": null, "usage": {"input_tokens": 1, "output_tokens": 1}}}'
  append_entry "$file" '{"type": "system", "subtype": "turn_duration", "durationMs": 1000, "isMeta": false}'

  if ! wait_for_file "${move_dir}/ended" 30; then
    log_error "go-remote did not end the laptop's session once its turn was over"
    return 1
  fi
  STAND_IN_PID=""
  log_success "Once the turn ended, go-remote closed the laptop's session"
  if ! wait_for_file "${LAPTOP_DIR}/state/go-remote/move-claude-${MOVE_ID}.log" 120 "resumed the session|move failed"; then
    log_error "The move did not finish"
    return 1
  fi
  if grep -q "move failed" "${LAPTOP_DIR}/state/go-remote/move-claude-${MOVE_ID}.log"; then
    log_error "$(grep "move failed" "${LAPTOP_DIR}/state/go-remote/move-claude-${MOVE_ID}.log")"
    return 1
  fi
  MOVED_PANE="$(docker exec "$cid" herdr agent list | jq -r --arg id "$MOVE_ID" \
    '[.result.agents[] | select((.agent_session.value // "") | contains($id)) | .pane_id][0] // empty')"
  if [ -z "$MOVED_PANE" ]; then
    MOVED_PANE="$(docker exec "$cid" herdr agent list | jq -r '[.result.agents[] | select(.name == "claude-2") | .pane_id][0] // empty')"
  fi
  if [ -z "$MOVED_PANE" ]; then
    log_error "No agent in the container has the moved session"
    return 1
  fi
  log_success "The same session resumed in the container, in pane ${MOVED_PANE}"
}

main() {
  local cid url code pane agent_pane="" agent_tab marker laptop_marker moved_marker base fragment status=0
  local -a shots=() chat=() moved=()

  trap cleanup EXIT
  if [ $# -gt 0 ]; then
    PROJECT="$1"
  else
    if [ ! -x "$GO_REMOTE" ]; then
      log_error "go-remote is not built: run make cli (or set GO_REMOTE)"
      exit 1
    fi
    start_throwaway
  fi

  cid="$(docker ps -q --filter "label=com.docker.compose.project=${PROJECT}" \
    --filter "label=com.docker.compose.service=workspace" | head -n 1)"
  if [ -z "$cid" ]; then
    log_error "No running workspace for ${PROJECT}"
    exit 1
  fi

  SECRET_DIR="$(mktemp -d "${TMPDIR:-/tmp}/go-remote-e2e-secrets.XXXXXX")"
  chmod 700 "$SECRET_DIR"

  url="$(docker exec "$cid" cat /tmp/bitbang/url)"
  code="$(docker exec "$cid" go-remote-pair | jq -r .code)"
  pane="$(docker exec "$cid" herdr pane list | jq -r '.result.panes[0].pane_id')"
  marker="go-remote-e2e-${RANDOM}${RANDOM}"
  laptop_marker="go-remote-e2e-${RANDOM}${RANDOM}"
  moved_marker="go-remote-e2e-${RANDOM}${RANDOM}"

  if [ -n "$THROWAWAY_REPO" ]; then
    start_mock_api "$cid"
    if [ "$(docker exec "$cid" go-remote-agent status | jq -r .state)" = running ]; then
      agent_pane="$(docker exec "$cid" go-remote-agent status | jq -r .pane)"
      log_success "The default agent started on its own, in pane ${agent_pane}"
      agent_tab="$(docker exec "$cid" herdr pane list | jq -r --arg pane "$agent_pane" \
        '.result.panes[] | select(.pane_id == $pane) | .tab_id')"
      if docker exec "$cid" herdr tab list | jq -e --arg tab "$agent_tab" \
        'any(.result.tabs[]; .tab_id == $tab and .label == "Claude")' >/dev/null; then
        log_success "Its tab is labelled Claude"
      else
        log_error "The default agent's tab is not labelled Claude"
        status=1
      fi
      chat=(-e GR_E2E_CHAT_MESSAGE="Reply to ${marker}" -e GR_E2E_CHAT_EXPECT="${marker}-reply")
    else
      log_error "The default agent did not start: $(docker exec "$cid" go-remote-agent status | jq -c .)"
      status=1
    fi
    if move_session "$cid" "$laptop_marker"; then
      moved=(-e GR_E2E_MOVED_HISTORY="${laptop_marker}-reply" -e GR_E2E_MOVED_MESSAGE="Reply to ${moved_marker}"
        -e GR_E2E_MOVED_EXPECT="${moved_marker}-reply")
    else
      status=1
    fi
  fi

  # BitBang's fragment is `<code>[!flags][/device URL]`; the device URL carries the pairing code.
  base="${url%%#*}"
  fragment=""
  if [ "$base" != "$url" ]; then
    fragment="${url#*#}"
    fragment="${fragment%%/*}"
  fi
  # The same path go-remote's own links take: BitBang's relay flag, unless the workspace has GR_RELAY=auto.
  if [ "$(docker exec "$cid" printenv GR_RELAY 2>/dev/null | tr '[:upper:]' '[:lower:]' || true)" != auto ]; then
    case "$fragment" in
      *!*) fragment="${fragment},relay" ;;
      *) fragment="${fragment}!relay" ;;
    esac
  fi
  (
    umask 077
    printf '%s\n' "$url" >"${SECRET_DIR}/url"
    printf '%s#%s/?pair=%s&pane=%s&view=terminal\n' "$base" "$fragment" "$code" "$pane" >"${SECRET_DIR}/link"
    if [ -n "$agent_pane" ]; then
      printf '%s#%s/?pane=%s&view=chat\n' "$base" "$fragment" "$agent_pane" >"${SECRET_DIR}/chat"
    fi
    if [ -n "$MOVED_PANE" ]; then
      printf '%s#%s/?pane=%s&view=chat\n' "$base" "$fragment" "$MOVED_PANE" >"${SECRET_DIR}/moved"
    fi
  )
  unset url code base fragment

  if [ -n "${E2E_SCREENSHOTS:-}" ]; then
    mkdir -p "$E2E_SCREENSHOTS"
    shots=(-v "$(cd "$E2E_SCREENSHOTS" && pwd -P):/shots" -e GR_E2E_SCREENSHOTS=/shots)
  fi

  log_info "Running the phone check through BitBang (this takes up to a few minutes)"
  # ${shots[@]+...}: bash 3.2 treats an empty array as unset under set -u.
  docker run --rm --ipc=host \
    -v "${SECRET_DIR}:/secrets:ro" \
    ${shots[@]+"${shots[@]}"} \
    ${chat[@]+"${chat[@]}"} \
    ${moved[@]+"${moved[@]}"} \
    -e GR_E2E_COMMAND="echo ${marker}-\$((6*7))" \
    -e GR_E2E_EXPECT="${marker}-42" \
    -e GR_E2E_TRACE -e GR_E2E_TIMEOUT_MS \
    "$E2E_IMAGE" || status=$?

  # The typed text holds $((6*7)); only the shell's output holds 42.
  if docker exec "$cid" herdr pane read "$pane" --source recent --lines 60 | grep -qF -- "${marker}-42"; then
    log_success "The command typed on the phone ran in the pane"
  else
    log_error "The command typed on the phone did not reach the pane"
    status=1
  fi
  if [ -n "$agent_pane" ]; then
    # Only Claude Code's request to the API carries the message on to the mock, which answers <marker>-reply.
    if docker exec "$cid" grep -qF -- "${marker}-reply" /tmp/go-remote/mock-anthropic.log &&
      docker exec "$cid" herdr pane read "$agent_pane" --source recent --lines 80 | grep -qF -- "${marker}-reply"; then
      log_success "The message sent from the phone's Chat reached Claude Code, and its reply came back"
    else
      log_error "The message sent from the phone's Chat did not reach Claude Code"
      status=1
    fi
  fi
  if [ -n "$MOVED_PANE" ]; then
    if docker exec "$cid" grep -qF -- "${moved_marker}-reply" \
      "/home/agent/.claude/projects/$(printf '%s' "$THROWAWAY_REPO" | sed 's/[^A-Za-z0-9]/-/g')/${MOVE_ID}.jsonl"; then
      log_success "The phone carried on the moved session itself: its reply is in that session's transcript"
    else
      log_error "The phone's message to the moved session is not in its transcript"
      status=1
    fi
  fi
  return "$status"
}

main "$@"
