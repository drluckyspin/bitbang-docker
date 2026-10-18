#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: attach.bash
#
# Description: What `make attach` and `bbd attach` open: the Herdr TUI on the same panes the phone sees
#              (GR_UI=web), or the shared tmux session (GR_UI=shell).
#
# Usage: bitbang-docker-attach
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

case "$(printf '%s' "${GR_UI:-web}" | tr '[:upper:]' '[:lower:]')" in
  shell) exec bitbang-docker-session ;;
  *) exec bitbang-docker-herdr ;;
esac
