# syntax=docker/dockerfile:1

FROM ghcr.io/astral-sh/uv:0.13.1 AS uv

FROM node:24-trixie-slim

ARG USER_UID=1000
ARG USER_GID=1000
ARG BITBANG_VERSION=0.5.1
ARG CLAUDE_CODE_VERSION=2.1.302
ARG CODEX_VERSION=0.163.0
ARG TARGETARCH

ENV LANG=C.UTF-8 \
    TERM=xterm-256color \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    DISABLE_AUTOUPDATER=1

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
  gh git jq less make procps python3 qrencode ripgrep tmux unzip vim-tiny; \
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

# The stock node user would hold UID 1000; replace it with agent at the host's UID/GID.
RUN set -eux; \
  userdel -r node; \
  getent group "${USER_GID}" >/dev/null || groupadd -g "${USER_GID}" agent; \
  useradd -l -m -u "${USER_UID}" -g "${USER_GID}" -s /bin/bash agent; \
  install -d -o agent -g "${USER_GID}" /workspace

COPY scripts/log.bash /usr/local/lib/bitbang-docker/log.bash
COPY docker/tmux.conf /etc/tmux.conf
COPY docker/entrypoint.bash /usr/local/bin/bitbang-docker-entrypoint
COPY docker/session.bash /usr/local/bin/bitbang-docker-session

USER agent
WORKDIR /workspace
ENTRYPOINT ["bitbang-docker-entrypoint"]
