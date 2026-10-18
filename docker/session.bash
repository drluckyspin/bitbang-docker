#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: session.bash
#
# Description: Opens, or attaches to, the shared tmux session in the repo (BBD_UI=shell). Both the BitBang
#              shell and `make attach` go through here, so every shell starts from the same clean environment.
#
# Usage: bitbang-docker-session [extra tmux new-session flags]
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
unset BITBANG_PIN BITBANG_MAX_SESSIONS BBD_WATCHDOG_INTERVAL BBD_NTFY_TOPIC BBD_NTFY_SERVER BBD_NTFY_TOKEN

export HOME=/home/agent
export SHELL=/bin/bash
repo="${BBD_REPO:-/workspace}"
cd "$repo"
exec tmux new-session -A -s main -c "$repo" "$@"
