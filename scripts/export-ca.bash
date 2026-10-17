#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: export-ca.bash
#
# Description: Exports the Zscaler root CA from the macOS System keychain into certs/ so the image trusts
#              TLS-inspected connections (Zscaler re-signs api.anthropic.com, among others). Any other
#              *.crt placed in certs/ by hand is trusted as well. Does nothing on hosts without Zscaler.
#
# Usage: ./scripts/export-ca.bash [certs_dir]
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

# shellcheck source=scripts/log.bash
# shellcheck disable=SC1091
source "$(dirname "$0")/log.bash"

CERTS_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)/certs}"
CA_NAME="Zscaler Root CA"
CA_FILE="${CERTS_DIR}/zscaler-root-ca.crt"
KEYCHAIN=/Library/Keychains/System.keychain

main() {
  mkdir -p "$CERTS_DIR"

  if [ "$(uname -s)" != "Darwin" ]; then
    log_info_dim "Not macOS; skipping keychain export"
  else
    local pem
    pem="$(security find-certificate -a -c "$CA_NAME" -p "$KEYCHAIN" 2>/dev/null || true)"
    if [ -z "$pem" ]; then
      log_info_dim "No '${CA_NAME}' in the System keychain; skipping"
    elif [ -f "$CA_FILE" ] && [ "$pem" = "$(cat "$CA_FILE")" ]; then
      log_info_dim "${CA_NAME} already exported to certs/"
    else
      printf '%s\n' "$pem" >"$CA_FILE"
      log_success "Exported ${CA_NAME} to certs/$(basename "$CA_FILE")"
    fi
  fi

  local count
  count="$(find "$CERTS_DIR" -maxdepth 1 -name '*.crt' | wc -l | tr -d '[:space:]')"
  log_info_dim "The image will trust ${count} extra root CA file(s) from certs/"
}

main "$@"
