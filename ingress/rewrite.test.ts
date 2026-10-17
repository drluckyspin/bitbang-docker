import { describe, expect, test } from "bun:test";
import {
  canMoveToMeta,
  COMPAT_PATH,
  downstreamResponseHeaders,
  metaPolicy,
  rewriteHtml,
  sendableCloseCode,
  shouldRewrite,
  upstreamRequestHeaders,
} from "./rewrite.ts";

// herdr-web-ui v0.4.11, server/static.ts
const APP_POLICY = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
  + "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self'; frame-src 'self'; "
  + "worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

// herdr-web-ui v0.4.11, server/file-view.ts: a file from the repository
const FILE_POLICY = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'";

/** What BitBang's Go proxy sends in fixed-target mode (internal/streamtype/http.go). */
function bitbangHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    host: "127.0.0.1:7300",
    "x-forwarded-host": "bitba.ng",
    "x-forwarded-proto": "https",
    "x-forwarded-for": "203.0.113.7",
    referer: "http://127.0.0.1:7300/",
    cookie: "herdr_web_device=abc",
    ...extra,
  });
}

describe("upstreamRequestHeaders", () => {
  test("restores Host from X-Forwarded-Host and keeps the forwarding headers", () => {
    const headers = upstreamRequestHeaders(bitbangHeaders());
    expect(headers.get("host")).toBe("bitba.ng");
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(headers.get("x-forwarded-proto")).toBe("https");
    expect(headers.get("cookie")).toBe("herdr_web_device=abc");
  });

  test("always states proxy evidence, even when BitBang sent no forwarding headers", () => {
    const headers = upstreamRequestHeaders(new Headers({ host: "127.0.0.1:7300" }));
    expect(headers.get("x-forwarded-proto")).toBe("https");
    expect(headers.has("host")).toBe(false);
  });

  test("drops Tailscale identity headers, which herdr-web-ui trusts", () => {
    const headers = upstreamRequestHeaders(
      bitbangHeaders({ "tailscale-user-login": "owner@example.com", "tailscale-funnel-request": "?1" }),
    );
    expect(headers.has("tailscale-user-login")).toBe(false);
    expect(headers.has("tailscale-funnel-request")).toBe(false);
  });

  test("drops hop-by-hop headers", () => {
    const headers = upstreamRequestHeaders(bitbangHeaders({ connection: "keep-alive", "transfer-encoding": "chunked" }));
    expect(headers.has("connection")).toBe(false);
    expect(headers.has("transfer-encoding")).toBe(false);
  });

  test("leaves the WebSocket handshake to each hop", () => {
    const headers = upstreamRequestHeaders(
      bitbangHeaders({ upgrade: "websocket", "sec-websocket-key": "x", "sec-websocket-version": "13" }),
      { websocket: true },
    );
    expect(headers.has("sec-websocket-key")).toBe(false);
    expect(headers.has("upgrade")).toBe(false);
    expect(headers.get("cookie")).toBe("herdr_web_device=abc");
  });
});

describe("metaPolicy", () => {
  test("keeps every directive a meta tag can carry", () => {
    const meta = metaPolicy(APP_POLICY);
    expect(meta).toContain("script-src 'self'");
    expect(meta).toContain("object-src 'none'");
    expect(meta).toContain("connect-src 'self'");
  });

  test("drops frame-ancestors and the reporting directives", () => {
    const meta = metaPolicy(`${APP_POLICY}; report-uri /csp; report-to csp`);
    expect(meta).not.toContain("frame-ancestors");
    expect(meta).not.toContain("report-uri");
    expect(meta).not.toContain("report-to");
  });

  test("a sandboxed policy never moves to a meta tag", () => {
    expect(canMoveToMeta(APP_POLICY)).toBe(true);
    expect(canMoveToMeta(FILE_POLICY)).toBe(false);
  });
});

describe("rewriteHtml", () => {
  const page = "<!doctype html><html><head><meta charset=\"utf-8\"><title>herdr</title></head><body></body></html>";

  test("puts the policy and compat script at the top of <head>", () => {
    const html = rewriteHtml(page, APP_POLICY);
    const head = html.indexOf("<head>") + "<head>".length;
    expect(html.indexOf("<meta http-equiv=\"Content-Security-Policy\"")).toBe(head);
    expect(html.indexOf(`<script src="${COMPAT_PATH}"></script>`)).toBeLessThan(html.indexOf("<meta charset"));
    expect(html).not.toContain("frame-ancestors");
  });

  test("handles <head> with attributes", () => {
    const html = rewriteHtml("<html><head lang=\"en\"><title>x</title></head></html>", APP_POLICY);
    expect(html).toMatch(/^<html><head lang="en"><meta http-equiv/);
  });

  test("inserts after the doctype when there is no <head>", () => {
    const html = rewriteHtml("<!DOCTYPE html><p>hi</p>", null);
    expect(html).toBe(`<!DOCTYPE html><script src="${COMPAT_PATH}"></script><p>hi</p>`);
  });

  test("escapes the policy for an attribute", () => {
    const html = rewriteHtml(page, "default-src 'self' \"x\" <y>");
    expect(html).toContain("content=\"default-src 'self' &quot;x&quot; &lt;y&gt;\"");
  });
});

describe("downstreamResponseHeaders", () => {
  test("a rewritten page loses its length, encoding and CSP header, and may be framed by its own origin", () => {
    const headers = downstreamResponseHeaders(
      new Headers({
        "content-type": "text/html; charset=utf-8",
        "content-length": "100",
        "content-encoding": "gzip",
        "content-security-policy": APP_POLICY,
        etag: "\"abc\"",
        "cache-control": "no-cache",
      }),
      { rewritten: true },
    );
    expect(headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(headers.has("content-length")).toBe(false);
    expect(headers.has("content-encoding")).toBe(false);
    expect(headers.has("etag")).toBe(false);
    expect(headers.get("cache-control")).toBe("no-cache");
  });

  test("other responses pass through, minus X-Frame-Options", () => {
    const headers = downstreamResponseHeaders(
      new Headers({ "content-encoding": "gzip", "x-frame-options": "DENY", "set-cookie": "a=b; HttpOnly" }),
      { rewritten: false },
    );
    expect(headers.get("content-encoding")).toBe("gzip");
    expect(headers.has("x-frame-options")).toBe(false);
    expect(headers.get("set-cookie")).toBe("a=b; HttpOnly");
  });
});

describe("shouldRewrite", () => {
  const html = (policy?: string) =>
    new Headers({ "content-type": "text/html; charset=utf-8", ...(policy ? { "content-security-policy": policy } : {}) });

  test("rewrites the app's pages", () => {
    expect(shouldRewrite("/", 200, html(APP_POLICY))).toBe(true);
    expect(shouldRewrite("/some/client/route", 200, html(APP_POLICY))).toBe(true);
  });

  test("leaves API answers, file previews, errors and other types alone", () => {
    expect(shouldRewrite("/api/fs/file", 200, html(APP_POLICY))).toBe(false);
    expect(shouldRewrite("/preview.html", 200, html(FILE_POLICY))).toBe(false);
    expect(shouldRewrite("/", 304, html(APP_POLICY))).toBe(false);
    expect(shouldRewrite("/app.js", 200, new Headers({ "content-type": "text/javascript" }))).toBe(false);
  });
});

test("sendableCloseCode maps reserved codes", () => {
  expect(sendableCloseCode(1000)).toBe(1000);
  expect(sendableCloseCode(4001)).toBe(4001);
  expect(sendableCloseCode(1005)).toBe(1000);
  expect(sendableCloseCode(1006)).toBe(1000);
  expect(sendableCloseCode(undefined)).toBe(1000);
  expect(sendableCloseCode(2000)).toBe(1011);
});
