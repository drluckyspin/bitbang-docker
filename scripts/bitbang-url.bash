#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: bitbang-url.bash
#
# Description: Waits for a workspace container's BitBang listener to register, then prints a QR code
#              (rendered inside the container, so the host needs no qrencode) followed by the URL.
#              Logs go to stderr; the QR code and URL go to stdout, so QR=false leaves only the URL.
#
# Usage: ./scripts/bitbang-url.bash <compose_project>
#
# Environment:
#   QR       true (default) prints the QR code; false prints only the URL (no, off and 0 work too, in any case)
#   TIMEOUT  Seconds to wait for the listener to register (default 90)
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

# shellcheck source=scripts/log.bash
# shellcheck disable=SC1091
source "$(dirname "$0")/log.bash"

PROJECT="${1:?usage: bitbang-url.bash <compose_project>}"
TIMEOUT="${TIMEOUT:-90}"

# tr rather than ${QR,,}: macOS ships bash 3.2.
case "$(printf '%s' "${QR:-true}" | tr '[:upper:]' '[:lower:]')" in
  false | no | off | 0) SHOW_QR=false ;;
  *) SHOW_QR=true ;;
esac

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

  if [ "$SHOW_QR" = true ]; then
    echo ""
    docker exec "$cid" qrencode -t ANSIUTF8 -m 2 "$url"
    echo ""
  fi
  echo "$url"

  if [ "$SHOW_QR" = true ]; then
    echo "" >&2
    if docker exec "$cid" sh -c '[ -n "$BITBANG_PIN" ]'; then
      log_warning "This listener asks for the PIN from .env before opening a shell"
    fi
    log_warning "The URL and QR code grant a shell in this container. Share them like a password."
  fi
}

main "$@"
