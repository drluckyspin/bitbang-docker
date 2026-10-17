#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: dprint-mbake.bash
# Version: 1.0.0
#
# Description: Formats a Makefile through mbake using dprint's Exec plugin.
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

# shellcheck source=scripts/log.bash
# shellcheck disable=SC1091
source "$(dirname "$0")/log.bash"

if [ "$#" -ne 0 ]; then
  log_error "Expected Makefile content on standard input"
  exit 1
fi

temporary_file="$(mktemp "${TMPDIR:-/tmp}/dprint-mbake.XXXXXX")"

cleanup() {
  rm -f "$temporary_file"
}
trap cleanup EXIT

cat >"$temporary_file"
mbake format "$temporary_file" >/dev/null
cat "$temporary_file"
