# syntax=docker/dockerfile:1
#
# The repo's TypeScript (bbd and bbd-ingress), built and tested with nothing on the host but Docker. make unit
# builds the test stage; make cli exports the dist stage, which holds only the bbd-<os>-<arch> executables and
# builds after the tests pass.

ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION} AS deps
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Corporate TLS-inspection roots (exported into certs/ by make) must be trusted before any HTTPS fetch.
COPY certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates
WORKDIR /src
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY skills/create-remote-session/SKILL.md skills/create-remote-session/
COPY ingress/ ingress/
COPY cli/src/ cli/src/

FROM deps AS test
RUN ./node_modules/.bin/tsc --noEmit && bun test && touch /passed

FROM deps AS build
COPY --from=test /passed /passed
ARG BBD_TARGETS="darwin-arm64 darwin-x64 linux-arm64 linux-x64"
RUN mkdir /dist \
  && for target in ${BBD_TARGETS}; do \
    bun build --compile --target="bun-${target}" cli/src/main.ts --outfile "/dist/bbd-${target}" || exit 1; \
  done

FROM scratch AS dist
COPY --from=build /dist/ /
