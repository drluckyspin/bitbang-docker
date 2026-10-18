#!/usr/bin/env bash

# -----------------------------------------------------------------------------------------------------------
# Script Name: bump-version.bash
#
# Description: Sets the project version in VERSION, its single source, and copies it into every file that
#              carries it. Today that is only package.json, which the CLI compiles in for go-remote --version.
#
# Usage: make bump-version X.Y.Z   (plain make bump-version copies the version already in VERSION)
# -----------------------------------------------------------------------------------------------------------

set -euo pipefail

# shellcheck source=scripts/log.bash
# shellcheck disable=SC1091
source "$(dirname "$0")/log.bash"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEMVER='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'

main() {
  if (($# > 1)); then
    log_error "Usage: make bump-version [X.Y.Z]"
    exit 1
  fi

  local version
  if (($# == 1)); then
    version="${1#v}"
  elif [ -f "${ROOT}/VERSION" ]; then
    version="$(tr -d ' \r\n' <"${ROOT}/VERSION")"
  else
    log_error "There is no VERSION file yet; give the version: make bump-version X.Y.Z"
    exit 1
  fi
  if [[ ! "$version" =~ $SEMVER ]]; then
    log_error "Not a semantic version: ${version} (for example, 0.2.0)"
    exit 1
  fi

  printf '%s\n' "$version" >"${ROOT}/VERSION"
  log_indent log_success "Wrote ${version} to VERSION"
  set_json_version "${ROOT}/package.json" "$version"
}

# Fails rather than guess when the file does not have exactly one top-level "version" line.
set_json_version() {
  local file="$1" version="$2" name count tmp
  name="${file#"${ROOT}"/}"
  count="$(grep -cE '^  "version": "[^"]*",?$' "$file" || true)"
  if [ "$count" != 1 ]; then
    log_error "Expected one top-level \"version\" line in ${name}, found ${count}"
    exit 1
  fi
  tmp="$(mktemp)"
  sed -E "s/^(  \"version\": \")[^\"]*(\",?)$/\1${version}\2/" "$file" >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
  if ! grep -qF "  \"version\": \"${version}\"" "$file"; then
    log_error "Could not set the version in ${name}"
    exit 1
  fi
  log_indent log_success "Updated ${name}"
}

main "$@"
