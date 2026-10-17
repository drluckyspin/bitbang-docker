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
#
# Usage: ./scripts/e2e.bash [compose_project]
#
# Environment:
#   BBD                 bbd command (default: dist/bbd-<os>-<arch>, built by make cli)
#   E2E_IMAGE           Test image (default bitbang-docker-e2e:latest, built by make e2e)
#   E2E_SCREENSHOTS     Directory for screenshots of each step (default: none)
#   BBD_E2E_TRACE       Set to print frame navigations and pairing requests (paths and parameter names only)
#   BBD_E2E_TIMEOUT_MS  How long each step may take (default 120000)
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

# shellcheck source=scripts/log.bash
# shellcheck disable=SC1091
source "$(dirname "$0")/log.bash"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
E2E_IMAGE="${E2E_IMAGE:-bitbang-docker-e2e:latest}"
PROJECT=""
SECRET_DIR=""
ENV_DIR=""
THROWAWAY_REPO=""
THROWAWAY_VOLUME=""
MOCK_PORT=8099

host_bbd() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in
    arm64 | aarch64) arch=arm64 ;;
    *) arch=x64 ;;
  esac
  echo "${ROOT_DIR}/dist/bbd-${os}-${arch}"
}

BBD="${BBD:-$(host_bbd)}"

cleanup() {
  local dir
  for dir in "$SECRET_DIR" "$ENV_DIR"; do
    if [ -n "$dir" ]; then
      rm -rf "$dir"
    fi
  done
  if [ -n "$THROWAWAY_REPO" ]; then
    log_info_dim "Removing the throwaway workspace, its home volume and repo"
    BBD_ROOT="$ROOT_DIR" BBD_HOME_VOLUME="$THROWAWAY_VOLUME" "$BBD" stop "$THROWAWAY_REPO" >/dev/null 2>&1 || true
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
  THROWAWAY_REPO="$(mktemp -d "${TMPDIR:-/tmp}/bbd-e2e.XXXXXX")"
  THROWAWAY_REPO="$(cd "$THROWAWAY_REPO" && pwd -P)"
  THROWAWAY_VOLUME="bbd-e2e-home-${RANDOM}${RANDOM}"
  git -C "$THROWAWAY_REPO" init -q
  echo "e2e" >"${THROWAWAY_REPO}/README.md"

  ENV_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bbd-e2e-env.XXXXXX")"
  chmod 700 "$ENV_DIR"
  cp "${ROOT_DIR}/.env.example" "${ENV_DIR}/env.example"
  (
    umask 077
    sed -e "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=sk-ant-api03-e2e-mock-${RANDOM}${RANDOM}${RANDOM}|" \
      "${ROOT_DIR}/.env.example" >"${ENV_DIR}/env"
    printf 'ANTHROPIC_BASE_URL=http://127.0.0.1:%s\nCLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1\n' "$MOCK_PORT" >>"${ENV_DIR}/env"
  )

  log_info "Starting a throwaway workspace"
  result="$(BBD_ROOT="$ROOT_DIR" BBD_ENV_FILE="${ENV_DIR}/env" BBD_HOME_VOLUME="$THROWAWAY_VOLUME" \
    "$BBD" start "$THROWAWAY_REPO" --json --no-window)"
  PROJECT="$(jq -r .project <<<"$result")"
}

# -----------------------------------------------------------------------------------------------------------
# Function: start_mock_api
# Description: Run the stand-in Anthropic API on the container's loopback, where ANTHROPIC_BASE_URL points.
# -----------------------------------------------------------------------------------------------------------
start_mock_api() {
  local cid="$1" waited=0
  docker exec -i "$cid" sh -c 'cat >/tmp/bbd/mock-anthropic.ts' <"${ROOT_DIR}/e2e/mock-anthropic.ts"
  docker exec -d "$cid" sh -c "exec bun /tmp/bbd/mock-anthropic.ts ${MOCK_PORT} >/tmp/bbd/mock-anthropic.log 2>&1"
  until docker exec "$cid" curl -fsS -o /dev/null -X POST "http://127.0.0.1:${MOCK_PORT}/v1/messages/count_tokens" -d '{}'; do
    if [ "$waited" -ge 20 ]; then
      log_error "The mock Anthropic API did not start"
      return 1
    fi
    sleep 0.5
    waited=$((waited + 1))
  done
}

main() {
  local cid url code pane agent_pane="" marker base fragment status=0
  local -a shots=() chat=()

  trap cleanup EXIT
  if [ $# -gt 0 ]; then
    PROJECT="$1"
  else
    if [ ! -x "$BBD" ]; then
      log_error "bbd is not built: run make cli (or set BBD)"
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

  SECRET_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bbd-e2e-secrets.XXXXXX")"
  chmod 700 "$SECRET_DIR"

  url="$(docker exec "$cid" cat /tmp/bitbang/url)"
  code="$(docker exec "$cid" bitbang-docker-pair | jq -r .code)"
  pane="$(docker exec "$cid" herdr pane list | jq -r '.result.panes[0].pane_id')"
  marker="bbd-e2e-${RANDOM}${RANDOM}"

  if [ -n "$THROWAWAY_REPO" ]; then
    start_mock_api "$cid"
    if [ "$(docker exec "$cid" bitbang-docker-agent status | jq -r .state)" = running ]; then
      agent_pane="$(docker exec "$cid" bitbang-docker-agent status | jq -r .pane)"
      log_success "The default agent started on its own, in pane ${agent_pane}"
      chat=(-e BBD_E2E_CHAT_MESSAGE="Reply to ${marker}" -e BBD_E2E_CHAT_EXPECT="${marker}-reply")
    else
      log_error "The default agent did not start: $(docker exec "$cid" bitbang-docker-agent status | jq -c .)"
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
  (
    umask 077
    printf '%s\n' "$url" >"${SECRET_DIR}/url"
    printf '%s#%s/?pair=%s&pane=%s&view=terminal\n' "$base" "$fragment" "$code" "$pane" >"${SECRET_DIR}/link"
    if [ -n "$agent_pane" ]; then
      printf '%s#%s/?pane=%s&view=chat\n' "$base" "$fragment" "$agent_pane" >"${SECRET_DIR}/chat"
    fi
  )
  unset url code base fragment

  if [ -n "${E2E_SCREENSHOTS:-}" ]; then
    mkdir -p "$E2E_SCREENSHOTS"
    shots=(-v "$(cd "$E2E_SCREENSHOTS" && pwd -P):/shots" -e BBD_E2E_SCREENSHOTS=/shots)
  fi

  log_info "Running the phone check through BitBang (this takes up to a few minutes)"
  # ${shots[@]+...}: bash 3.2 treats an empty array as unset under set -u.
  docker run --rm --ipc=host \
    -v "${SECRET_DIR}:/secrets:ro" \
    ${shots[@]+"${shots[@]}"} \
    ${chat[@]+"${chat[@]}"} \
    -e BBD_E2E_COMMAND="echo ${marker}-\$((6*7))" \
    -e BBD_E2E_EXPECT="${marker}-42" \
    -e BBD_E2E_TRACE -e BBD_E2E_TIMEOUT_MS \
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
    if docker exec "$cid" grep -qF -- "${marker}-reply" /tmp/bbd/mock-anthropic.log &&
      docker exec "$cid" herdr pane read "$agent_pane" --source recent --lines 80 | grep -qF -- "${marker}-reply"; then
      log_success "The message sent from the phone's Chat reached Claude Code, and its reply came back"
    else
      log_error "The message sent from the phone's Chat did not reach Claude Code"
      status=1
    fi
  fi
  return "$status"
}

main "$@"
