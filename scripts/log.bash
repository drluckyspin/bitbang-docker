#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: log.bash
#
# Description: Colored, formatted console logging for bitbang-docker scripts, the Makefile, and the
#              container entrypoint. All output goes to stderr so scripts can keep stdout for data
#              (for example, `make url QR=false` prints only the URL).
#
# Functions:
#   get_terminal_width : Get current terminal width (max 120 chars, 80 when there is no TTY)
#   log                : Basic white text logging
#   log_dim            : Dimmed white text logging
#   log_info           : Blue text for info messages
#   log_info_dim       : Dimmed blue text for info messages
#   log_success        : Green checkmark with dimmed green text for success messages
#   log_error          : Red cross with dimmed red text for error messages
#   log_warning        : Yellow triangle with dimmed yellow text for warnings
#   log_indent         : Indent (2 spaces) and call any log function (usage: log_indent log_success "message")
#   log_separator      : Print a separator line across terminal width
#   log_centered       : Print centered text
#   log_verbose        : Log message only if VERBOSE environment variable is true
#   log_banner         : Display the bitbang-docker ASCII art banner
# -----------------------------------------------------------------------------------------------------------
# Usage Example: source scripts/log.bash
# -----------------------------------------------------------------------------------------------------------

# -----------------------------------------------------------------------------------------------------------
# Global variables
# -----------------------------------------------------------------------------------------------------------
: "${VERBOSE:=false}"

# -----------------------------------------------------------------------------------------------------------
# ANSI color codes
# -----------------------------------------------------------------------------------------------------------
RED='\033[91m'
GREEN='\033[92m'
YELLOW='\033[93m'
BLUE='\033[94m'
WHITE='\033[97m'
RESET='\033[0m'
DIM='\033[2m'

# -----------------------------------------------------------------------------------------------------------
# Function: get_terminal_width
# Description: Get current terminal width (max 120 chars). Falls back to 80 when there is no TTY,
#              which is always the case inside the container.
# -----------------------------------------------------------------------------------------------------------
get_terminal_width() {
  local width
  width=$(tput cols 2>/dev/null || echo 80)
  if [ "$width" -gt 120 ]; then
    width=120
  fi
  echo "$width"
}

# -----------------------------------------------------------------------------------------------------------
# Basic Logging functions for consistent console output
# -----------------------------------------------------------------------------------------------------------

log() {
  echo -e "${WHITE} $1${RESET}" >&2
}

log_dim() {
  echo -e "${DIM}${WHITE} $1${RESET}" >&2
}

log_info() {
  echo -e "${BLUE} $1${RESET}" >&2
}

log_info_dim() {
  echo -e "${DIM}${BLUE} $1${RESET}" >&2
}

log_success() {
  echo -e " ${GREEN}✔${RESET} ${DIM}${GREEN} $1${RESET}" >&2
}

log_error() {
  echo -e " ${RED}✖${RESET}  ${DIM}${RED}$1${RESET}" >&2
}

log_warning() {
  echo -e " ${YELLOW}▲${RESET}  ${DIM}${YELLOW}$1${RESET}" >&2
}

# -----------------------------------------------------------------------------------------------------------
# Function: log_separator
# Description: Print a separator line across terminal width
# -----------------------------------------------------------------------------------------------------------
log_separator() {
  local terminal_width
  terminal_width=$(get_terminal_width)
  printf "=-%.0s" $(seq 1 $((terminal_width / 2))) >&2
  echo "=" >&2
}

# -----------------------------------------------------------------------------------------------------------
# Function: log_indent
# Description: Indent (2 spaces) and call any log function (usage: log_indent log_success "message")
# -----------------------------------------------------------------------------------------------------------
log_indent() {
  local log_func=$1
  shift
  printf "  " >&2
  $log_func "$@"
}

# -----------------------------------------------------------------------------------------------------------
# Function: log_centered
# Description: Center a message in the terminal.
# -----------------------------------------------------------------------------------------------------------
log_centered() {
  local terminal_width
  local message="$1"
  terminal_width=$(get_terminal_width)

  local padding=$(((terminal_width - ${#message}) / 2))

  local pad_str
  pad_str=$(printf '%*s' "$padding" '')

  echo -e "${pad_str}${message}" >&2
}

# -----------------------------------------------------------------------------------------------------------
# Function: log_verbose
# Description: Log message only if VERBOSE environment variable is true
# -----------------------------------------------------------------------------------------------------------
log_verbose() {
  if [[ "${VERBOSE:-false}" == "true" ]]; then
    log_info_dim "$*"
  fi
}

# -----------------------------------------------------------------------------------------------------------
# Function: log_banner
# Description: Show the bitbang-docker banner.
# -----------------------------------------------------------------------------------------------------------
log_banner() {
  echo -e "
    ${WHITE}██████╗ ██╗████████╗██████╗  █████╗ ███╗   ██╗ ██████╗${RESET}
    ${WHITE}██╔══██╗██║╚══██╔══╝██╔══██╗██╔══██╗████╗  ██║██╔════╝${RESET}
    ${WHITE}██████╔╝██║   ██║   ██████╔╝███████║██╔██╗ ██║██║  ███╗${RESET}
    ${WHITE}██╔══██╗██║   ██║   ██╔══██╗██╔══██║██║╚██╗██║██║   ██║${RESET}
    ${WHITE}██████╔╝██║   ██║   ██████╔╝██║  ██║██║ ╚████║╚██████╔╝${RESET}
    ${WHITE}╚═════╝ ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝${RESET}
          ${BLUE}██████╗  ██████╗  ██████╗██╗  ██╗███████╗██████╗${RESET}
          ${BLUE}██╔══██╗██╔═══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗${RESET}
          ${BLUE}██║  ██║██║   ██║██║     █████╔╝ █████╗  ██████╔╝${RESET}
          ${BLUE}██║  ██║██║   ██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗${RESET}
          ${BLUE}██████╔╝╚██████╔╝╚██████╗██║  ██╗███████╗██║  ██║${RESET}
          ${BLUE}╚═════╝  ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝${RESET}
                  ${DIM}a hardened BitBang shell for your repo${RESET}
    " >&2
}

# -----------------------------------------------------------------------------------------------------------
# Example usage
# -----------------------------------------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  log_separator
  log_banner
  log "This is a normal message."
  log_dim "This is a dim message."
  log_info "This is an info message."
  log_info_dim "This is a dim info message."
  log_success "This is a success message."
  log_warning "This is a warning message."
  log_error "This is an error message."
  log_indent log_success "This is an indented message."
  log_centered "This is a centered message"
  log_separator
fi
