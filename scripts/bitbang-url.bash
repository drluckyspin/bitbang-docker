#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: bitbang-url.bash
#
# Description: Waits for a workspace container's BitBang listener to register, then prints a QR code
#              (rendered inside the container, so the host needs no qrencode) followed by the URL.
#              Logs go to stderr; the QR code and URL go to stdout, so QR=0 leaves only the URL.
#
# Usage: ./scripts/bitbang-url.bash <compose_project>
#
# Environment:
#   QR       1 (default) prints the QR code; 0 prints only the URL
#   TIMEOUT  Seconds to wait for the listener to register (default 90)
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

# shellcheck source=scripts/log.bash
# shellcheck disable=SC1091
source "$(dirname "$0")/log.bash"

PROJECT="${1:?usage: bitbang-url.bash <compose_project>}"
QR="${QR:-1}"
TIMEOUT="${TIMEOUT:-90}"

container_id() {
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJECT}" \
    --filter "label=com.docker.compose.service=workspace" | head -n 1
}

fail_with_logs() {
  local cid="$1" message="$2"
  log_error "$message"
  log_dim "Last container log lines:"
  docker logs --tail 20 "$cid" 2>&1 | sed 's/^/    /' >&2
  exit 1
}

main() {
  local cid url="" waited=0

  cid="$(container_id)"
  if [ -z "$cid" ]; then
    log_error "No container for ${PROJECT}. Start one with: make run-detached REPO=/path/to/repo"
    exit 1
  fi

  while [ -z "$url" ]; do
    if [ "$(docker inspect -f '{{.State.Running}}' "$cid")" != "true" ]; then
      fail_with_logs "$cid" "The container for ${PROJECT} is not running"
    fi
    url="$(docker exec "$cid" cat /tmp/bitbang/url 2>/dev/null || true)"
    if [ -z "$url" ]; then
      if [ "$waited" -ge "$TIMEOUT" ]; then
        fail_with_logs "$cid" "BitBang did not register within ${TIMEOUT}s"
      fi
      sleep 1
      waited=$((waited + 1))
    fi
  done

  if [ "$QR" != "0" ]; then
    echo ""
    docker exec "$cid" qrencode -t ANSIUTF8 -m 2 "$url"
    echo ""
  fi
  echo "$url"

  if [ "$QR" != "0" ]; then
    echo "" >&2
    if docker exec "$cid" sh -c '[ -n "$BITBANG_PIN" ]'; then
      log_warning "This listener asks for the PIN from .env before opening a shell"
    fi
    log_warning "The URL and QR code grant a shell in this container. Share them like a password."
  fi
}

main "$@"
