#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: pair.bash
#
# Description: Asks herdr-web-ui for a one-time device pairing code and prints its JSON answer,
#              {"code": "123456", "expires_at": ...}. The code is valid for 10 minutes and for one device;
#              a new one replaces the last. Runs inside the container only (the host CLI calls it through
#              docker exec), because it holds the app's access token.
#
# Usage: go-remote-pair
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

TOKEN_FILE=/tmp/bbd/web-token
WEB_UI="http://127.0.0.1:${GR_WEB_PORT:-7317}"

if [ ! -s "$TOKEN_FILE" ]; then
  echo "herdr-web-ui is not running in this workspace (GR_UI=shell, or still starting)" >&2
  exit 1
fi

# The token goes in a header file, never on a command line where ps would show it.
header_file="$(mktemp /tmp/bbd/pair-headers.XXXXXX)"
trap 'rm -f "$header_file"' EXIT
printf 'Authorization: Bearer %s\n' "$(cat "$TOKEN_FILE")" >"$header_file"

curl -fsS -X POST \
  -H "@${header_file}" \
  -H "x-herdr-machine: 1" \
  -H "content-type: application/json" \
  --data '{}' \
  "${WEB_UI}/api/devices/pair/start"
echo
