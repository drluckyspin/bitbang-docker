/**
 * The pure half of go-remote-ingress: what changes between BitBang's HTTP proxy and herdr-web-ui, and why.
 *
 * BitBang shows the device's page in a same-origin iframe on bitba.ng, and its service worker prepends an inline
 * bootstrap script to every HTML page. herdr-web-ui forbids both (`frame-ancestors 'none'`, `script-src 'self'`).
 * The app's policy therefore moves into a <meta> tag after BitBang's scripts, which keeps it in force for everything
 * the app loads, and only `frame-ancestors 'self'` stays a header, because browsers ignore it in a meta tag.
 */

export const COMPAT_PATH = "/__go-remote/compat.js";
export const HEALTH_PATH = "/__go-remote/health";

/** The placeholder in compat.js that stands for the project version. */
const VERSION_PLACEHOLDER = "__GO_REMOTE_VERSION__";

/** compat.js with the project version filled in. The page cannot read it itself, and its CSP forbids inline scripts. */
export function withVersion(script: string, version: string): string {
  return script.replaceAll(VERSION_PLACEHOLDER, version.trim().replace(/[^0-9A-Za-z.+-]/g, ""));
}

/** RFC 9110 hop-by-hop headers, plus the ones a proxy must recompute for the body it actually sends. */
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

/** WebSocket handshake headers belong to each hop's own handshake. */
const WEBSOCKET_HANDSHAKE = [
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-extensions",
  "sec-websocket-accept",
];

/**
 * Directives a <meta> policy cannot carry. Browsers ignore frame-ancestors, sandbox and the reporting directives
 * there, so they are dropped from the meta copy rather than left to look as if they applied.
 */
const HEADER_ONLY_DIRECTIVES = new Set(["frame-ancestors", "sandbox", "report-uri", "report-to"]);

/**
 * Headers for the request to herdr-web-ui.
 *
 * - Host comes back from X-Forwarded-Host: BitBang rewrites Host to its proxy target.
 * - X-Forwarded-Proto is always present, so the app always sees proxy evidence and never mistakes a phone for this
 *   machine. BitBang only reaches the device over HTTPS.
 * - Tailscale identity headers are dropped: only `tailscale serve` may state them, and herdr-web-ui trusts them.
 */
export function upstreamRequestHeaders(incoming: Headers, options: { websocket?: boolean } = {}): Headers {
  const headers = new Headers();
  for (const [name, value] of incoming) {
    const key = name.toLowerCase();
    if (HOP_BY_HOP.includes(key) || key === "host" || key.startsWith("tailscale-")) continue;
    if (options.websocket && (WEBSOCKET_HANDSHAKE.includes(key) || key === "sec-websocket-protocol")) continue;
    headers.append(name, value);
  }
  const forwardedHost = incoming.get("x-forwarded-host");
  if (forwardedHost) headers.set("host", forwardedHost);
  if (!headers.has("x-forwarded-proto")) headers.set("x-forwarded-proto", "https");
  return headers;
}

/** Split a Content-Security-Policy value into [directive name, full directive text] pairs, in order. */
function directives(policy: string): Array<[string, string]> {
  return policy
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => [part.split(/\s+/, 1)[0]!.toLowerCase(), part]);
}

/** The policy to restate in a <meta> tag: the original, minus what only a header can carry. */
export function metaPolicy(policy: string): string {
  return directives(policy)
    .filter(([name]) => !HEADER_ONLY_DIRECTIVES.has(name))
    .map(([, text]) => text)
    .join("; ");
}

/**
 * A policy can move to a <meta> tag only when nothing in it is header-only in effect. `sandbox` is the case that
 * matters: herdr-web-ui sends it for files from the repository, and dropping it would let such a page run scripts
 * with the app's own origin. Those pages stay as they are, unframeable inside BitBang but safe.
 */
export function canMoveToMeta(policy: string): boolean {
  return !directives(policy).some(([name]) => name === "sandbox");
}

export function isHtml(contentType: string | null): boolean {
  return contentType !== null && /^\s*text\/html\b/i.test(contentType);
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Insert the meta policy and the compat script at the top of <head>, or at the top of the document when there is
 * none. They go after BitBang's own prepended scripts (which arrive before the document), so those still run.
 */
export function rewriteHtml(html: string, policy: string | null): string {
  const tags = [
    policy ? `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(metaPolicy(policy))}">` : "",
    `<script src="${COMPAT_PATH}"></script>`,
  ].join("");
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (head) {
    const end = head.index + head[0].length;
    return html.slice(0, end) + tags + html.slice(end);
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  const at = doctype ? doctype[0].length : 0;
  return html.slice(0, at) + tags + html.slice(at);
}

/**
 * Headers for the response to BitBang. A rewritten page gets a body of its own, so its length and encoding go, and
 * its CSP header shrinks to `frame-ancestors 'self'`: the same-origin BitBang page may frame it, nothing else may.
 * X-Frame-Options would block the frame whatever the CSP says, so it goes from every response.
 */
export function downstreamResponseHeaders(upstream: Headers, options: { rewritten: boolean }): Headers {
  const headers = new Headers();
  for (const [name, value] of upstream) {
    const key = name.toLowerCase();
    if (HOP_BY_HOP.includes(key) || key === "x-frame-options") continue;
    if (options.rewritten && ["content-length", "content-encoding", "content-security-policy", "etag"].includes(key)) {
      continue;
    }
    headers.append(name, value);
  }
  if (options.rewritten) headers.set("content-security-policy", "frame-ancestors 'self'");
  return headers;
}

/**
 * Whether a response is the app's own page, to be rewritten for the BitBang frame. API answers are left alone:
 * file previews under /api/ carry their own sandboxed policies.
 */
export function shouldRewrite(pathname: string, status: number, headers: Headers): boolean {
  if (pathname.startsWith("/api/") || status < 200 || status >= 300 || !isHtml(headers.get("content-type"))) {
    return false;
  }
  const policy = headers.get("content-security-policy");
  return policy === null || canMoveToMeta(policy);
}

/** WebSocket close codes that may be sent in a close frame (1005 and 1006 are reserved for "none received"). */
export function sendableCloseCode(code: number | undefined): number {
  if (code === undefined || code === 1005 || code === 1006 || code === 1015) return 1000;
  if ((code >= 1000 && code <= 1014) || (code >= 3000 && code <= 4999)) return code;
  return 1011;
}
