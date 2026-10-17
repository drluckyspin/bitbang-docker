#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: session.bash
#
# Description: Opens, or attaches to, the shared tmux session in /workspace. Both the BitBang shell and
#              `make attach` go through here, so every shell starts from the same clean environment.
#
# Usage: bitbang-docker-session [extra tmux new-session flags]
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
unset BITBANG_PIN BITBANG_MAX_SESSIONS BBD_WATCHDOG_INTERVAL

export HOME=/home/agent
cd /workspace
exec tmux new-session -A -s main -c /workspace "$@"
