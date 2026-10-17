# syntax=docker/dockerfile:1

# Playwright with the browsers it was released with, trusting the same corporate roots as the workspace image.
# Chromium on Linux takes added roots from NSS, not the system store, and BitBang's service worker will not
# register on a page with a certificate error, so the roots go into the NSS database too.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

ARG PLAYWRIGHT_VERSION=1.63.0

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libnss3-tools \
  && rm -rf /var/lib/apt/lists/*
COPY certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

WORKDIR /e2e
RUN npm init -y >/dev/null \
  && npm install --no-audit --no-fund "playwright@${PLAYWRIGHT_VERSION}" \
  && npm cache clean --force

USER pwuser
RUN set -eux; \
  db=sql:/home/pwuser/.pki/nssdb; \
  mkdir -p /home/pwuser/.pki/nssdb; \
  certutil -d "$db" -N --empty-password; \
  for cert in /usr/local/share/ca-certificates/*.crt; do \
  [ -e "$cert" ] || continue; \
  certutil -d "$db" -A -t "C,," -n "$(basename "$cert")" -i "$cert"; \
  done

COPY e2e/phone.mjs /e2e/phone.mjs
ENTRYPOINT ["node", "/e2e/phone.mjs"]
