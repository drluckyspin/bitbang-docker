# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.4.2
ARG HERDR_WEB_UI_VERSION=0.4.11
ARG HERDR_WEB_UI_COMMIT=6de77101b2fafda044054e8f7195f3573b624b72

FROM ghcr.io/astral-sh/uv:0.13.1 AS uv

FROM oven/bun:${BUN_VERSION} AS bun

# herdr-web-ui, built from a pinned tag whose commit is checked, with every dependency from its lockfile.
FROM oven/bun:${BUN_VERSION} AS web-ui

ARG HERDR_WEB_UI_VERSION
ARG HERDR_WEB_UI_COMMIT

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
COPY certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates

WORKDIR /opt/herdr-web-ui
RUN set -eux; \
  git clone --quiet --depth 1 --branch "v${HERDR_WEB_UI_VERSION}" https://github.com/devswha/herdr-web-ui.git .; \
  test "$(git rev-parse HEAD)" = "${HERDR_WEB_UI_COMMIT}"; \
  rm -rf .git
# The build needs the dev dependencies (Vite); the server runs on the production ones alone.
RUN set -eux; \
  bun install --frozen-lockfile; \
  bun run build; \
  rm -rf node_modules; \
  bun install --frozen-lockfile --production; \
  rm -rf /root/.bun/install/cache

FROM node:24-trixie-slim

ARG USER_UID=1000
ARG USER_GID=1000
ARG BITBANG_VERSION=0.5.1
ARG CLAUDE_CODE_VERSION=2.1.302
ARG CODEX_VERSION=0.163.0
ARG HERDR_VERSION=0.9.5
ARG HERDR_SHA256_AMD64=14d9e8bc8b4a9e0118d77c32266f76d461f09b40342eb23752960bd89f59929d
ARG HERDR_SHA256_ARM64=17d7536f2da50859523680ef279dffcac8e4a235f4e46fe8da6c2ec44141897c
ARG BUN_VERSION
ARG HERDR_WEB_UI_VERSION
ARG TARGETARCH

ENV LANG=C.UTF-8 \
    TERM=xterm-256color \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    DISABLE_AUTOUPDATER=1 \
    HERDR_CONFIG_PATH=/usr/local/share/bitbang-docker/herdr.toml

# Corporate TLS-inspection roots (exported into certs/ by `make build`) must be trusted before any HTTPS fetch.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
COPY certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates

RUN set -eux; \
  install -d -m 0755 /etc/apt/keyrings; \
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
  chmod 0644 /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  >/etc/apt/sources.list.d/github-cli.list; \
  apt-get update; \
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  gh git jq less make procps python3 ripgrep tmux unzip vim-tiny; \
  rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /usr/local/bin/

RUN npm install -g --omit=dev "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" "@openai/codex@${CODEX_VERSION}" \
  && npm cache clean --force

RUN set -eux; \
  base="https://github.com/richlegrand/bitbang-cli/releases/download/${BITBANG_VERSION}"; \
  asset="bitbang-linux-${TARGETARCH}"; \
  cd /tmp; \
  curl -fsSLO "${base}/${asset}"; \
  curl -fsSLO "${base}/checksums.txt"; \
  grep " ${asset}\$" checksums.txt | sha256sum -c -; \
  install -m 0755 "${asset}" /usr/local/bin/bitbang; \
  rm -f "${asset}" checksums.txt

# Herdr publishes no checksum file, so the digests GitHub reports for the release assets are pinned here.
RUN set -eux; \
  case "${TARGETARCH}" in \
  amd64) asset=herdr-linux-x86_64; sha256="${HERDR_SHA256_AMD64}" ;; \
  arm64) asset=herdr-linux-aarch64; sha256="${HERDR_SHA256_ARM64}" ;; \
  *) echo "Herdr has no Linux build for ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  curl -fsSL -o /tmp/herdr "https://github.com/herdrdev/herdr/releases/download/v${HERDR_VERSION}/${asset}"; \
  echo "${sha256}  /tmp/herdr" | sha256sum -c -; \
  install -m 0755 /tmp/herdr /usr/local/bin/herdr; \
  rm -f /tmp/herdr

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --from=web-ui /opt/herdr-web-ui /opt/herdr-web-ui

# The stock node user would hold UID 1000; replace it with agent at the host's UID/GID.
# /workspace points at the repo's host path, which the entrypoint links into tmpfs at start.
RUN set -eux; \
  userdel -r node; \
  getent group "${USER_GID}" >/dev/null || groupadd -g "${USER_GID}" agent; \
  useradd -l -m -u "${USER_UID}" -g "${USER_GID}" -s /bin/bash agent; \
  ln -s /tmp/bbd/workspace /workspace

COPY third_party/ /usr/local/share/doc/bitbang-docker/third_party/
COPY scripts/log.bash /usr/local/lib/bitbang-docker/log.bash
COPY ingress/server.ts ingress/rewrite.ts ingress/compat.js ingress/alerts.ts /opt/bitbang-docker/ingress/
COPY docker/herdr.toml /usr/local/share/bitbang-docker/herdr.toml
COPY docker/codex.toml /etc/codex/config.toml
COPY docker/tmux.conf /etc/tmux.conf
COPY docker/entrypoint.bash /usr/local/bin/bitbang-docker-entrypoint
COPY docker/session.bash /usr/local/bin/bitbang-docker-session
COPY docker/herdr.bash /usr/local/bin/bitbang-docker-herdr
COPY docker/attach.bash /usr/local/bin/bitbang-docker-attach
COPY docker/pair.bash /usr/local/bin/bitbang-docker-pair
COPY docker/agent.bash /usr/local/bin/bitbang-docker-agent
COPY docker/bashrc /usr/local/share/bitbang-docker/bashrc
RUN printf '\n. /usr/local/share/bitbang-docker/bashrc\n' >>/etc/bash.bashrc

# Read by bbd doctor and the session handoff, which warn when the laptop's agent CLIs differ.
LABEL bitbang-docker.version.bitbang="${BITBANG_VERSION}" \
      bitbang-docker.version.bun="${BUN_VERSION}" \
      bitbang-docker.version.claude-code="${CLAUDE_CODE_VERSION}" \
      bitbang-docker.version.codex="${CODEX_VERSION}" \
      bitbang-docker.version.herdr="${HERDR_VERSION}" \
      bitbang-docker.version.herdr-web-ui="${HERDR_WEB_UI_VERSION}"

USER agent
WORKDIR /home/agent
ENTRYPOINT ["bitbang-docker-entrypoint"]
