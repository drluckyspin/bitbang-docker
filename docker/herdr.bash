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
for var in ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN OPENAI_API_KEY CURSOR_API_KEY GH_TOKEN \
  GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL; do
  if [ -z "${!var:-}" ]; then
    unset "$var"
  fi
done
unset BITBANG_PIN BITBANG_MAX_SESSIONS GR_WATCHDOG_INTERVAL GR_NTFY_TOPIC GR_NTFY_SERVER GR_NTFY_TOKEN

export HOME=/home/agent
# Herdr opens panes in $SHELL, and Docker sets none: /bin/sh has no line editing and types out the
# bracketed paste the web UI's chat sends.
export SHELL=/bin/bash
cd "${GR_REPO:-/workspace}"
exec herdr "$@"
