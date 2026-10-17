#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: herdr.bash
#
# Description: Runs herdr with the same clean environment the tmux shell gets. Panes inherit the server's
#              environment, so the entrypoint starts `herdr server` through here, and `make attach` opens
#              the Herdr TUI through here too.
#
# Usage: bitbang-docker-herdr [herdr arguments]   (no arguments opens the TUI)
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

# compose passes unset .env values as empty strings, and an empty ANTHROPIC_API_KEY would override a
# subscription login.
for var in ANTHROPIC_API_KEY OPENAI_API_KEY GH_TOKEN \
  GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL; do
  if [ -z "${!var:-}" ]; then
    unset "$var"
  fi
done
unset BITBANG_PIN BITBANG_MAX_SESSIONS BBD_WATCHDOG_INTERVAL BBD_NTFY_TOPIC BBD_NTFY_SERVER BBD_NTFY_TOKEN

export HOME=/home/agent
cd "${BBD_REPO:-/workspace}"
exec herdr "$@"
