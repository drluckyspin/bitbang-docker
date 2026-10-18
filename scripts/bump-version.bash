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
# Semantic Versioning 2.0.0: no leading zeroes in numbers, and no empty identifiers.
NUMBER='(0|[1-9][0-9]*)'
PRERELEASE_ID="(${NUMBER}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)"
BUILD_ID='[0-9A-Za-z-]+'
SEMVER="^${NUMBER}\\.${NUMBER}\\.${NUMBER}(-${PRERELEASE_ID}(\\.${PRERELEASE_ID})*)?(\\+${BUILD_ID}(\\.${BUILD_ID})*)?\$"

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

  # VERSION goes last, so a manifest that is refused leaves every file as it was.
  check_json_version "${ROOT}/package.json"
  set_json_version "${ROOT}/package.json" "$version"
  printf '%s\n' "$version" >"${ROOT}/VERSION"
  log_indent log_success "Wrote ${version} to VERSION"
}

# Fails rather than guess when the file does not have exactly one top-level "version" line.
check_json_version() {
  local file="$1" count
  count="$(grep -cE '^  "version": "[^"]*",?$' "$file" || true)"
  if [ "$count" != 1 ]; then
    log_error "Expected one top-level \"version\" line in ${file#"${ROOT}"/}, found ${count}"
    exit 1
  fi
}

set_json_version() {
  local file="$1" version="$2" name tmp
  name="${file#"${ROOT}"/}"
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
