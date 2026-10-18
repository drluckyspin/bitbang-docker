/**
 * go-remote-ingress: the adapter between BitBang's HTTP proxy and herdr-web-ui, both on loopback.
 *
 *   bitbang serve -proxy-client-ip proxy 127.0.0.1:7300  ->  go-remote-ingress :7300  ->  herdr-web-ui :7317
 *
 * See rewrite.ts for what changes and why. Request URLs are never logged: a scanned QR code brings the one-time
 * pairing code in the query string.
 */
import type { ServerWebSocket } from "bun";
import {
  COMPAT_PATH,
  downstreamResponseHeaders,
  HEALTH_PATH,
  rewriteHtml,
  sendableCloseCode,
  shouldRewrite,
  upstreamRequestHeaders,
} from "./rewrite.ts";

interface Bridge {
  upstream: WebSocket;
  /** messages from the browser that arrive before the upstream socket opens */
  pending: Array<string | Uint8Array>;
}

export interface IngressOptions {
  hostname?: string;
  port?: number;
  /** herdr-web-ui's address, host:port */
  upstream: string;
  compatScript?: string;
}

function log(message: string): void {
  console.error(`${new Date().toISOString()} go-remote-ingress: ${message}`);
}

async function upstreamBody(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const encoding = response.headers.get("content-encoding")?.trim().toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") return new TextDecoder().decode(Bun.gunzipSync(bytes));
  if (encoding && encoding !== "identity") throw new Error(`cannot rewrite a ${encoding} body`);
  return new TextDecoder().decode(bytes);
}

async function proxyHttp(request: Request, upstream: string): Promise<Response> {
  const url = new URL(request.url);
  const target = `http://${upstream}${url.pathname}${url.search}`;
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const response = await fetch(target, {
    method: request.method,
    headers: upstreamRequestHeaders(request.headers),
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
    decompress: false,
  });

  if (!shouldRewrite(url.pathname, response.status, response.headers)) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: downstreamResponseHeaders(response.headers, { rewritten: false }),
    });
  }

  const html = rewriteHtml(await upstreamBody(response), response.headers.get("content-security-policy"));
  return new Response(request.method === "HEAD" ? null : html, {
    status: response.status,
    statusText: response.statusText,
    headers: downstreamResponseHeaders(response.headers, { rewritten: true }),
  });
}

/**
 * Open the upstream socket before upgrading the browser's, so a refusal (no device cookie, for one) answers the
 * handshake with an error instead of a socket that closes at once.
 */
function connectUpstream(request: Request, upstream: string): Promise<WebSocket> {
  const url = new URL(request.url);
  const socket = new WebSocket(`ws://${upstream}${url.pathname}${url.search}`, {
    headers: upstreamRequestHeaders(request.headers, { websocket: true }),
  } as unknown as string[]);
  socket.binaryType = "arraybuffer";
  return new Promise((resolve, reject) => {
    const failed = () => reject(new Error("upstream websocket refused"));
    socket.addEventListener("open", () => {
      socket.removeEventListener("error", failed);
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", failed, { once: true });
  });
}

export function startIngress(options: IngressOptions) {
  const compat = options.compatScript ?? "";

  return Bun.serve<Bridge, never>({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 7300,
    // The app holds event streams open; Bun's default would cut them after 10 idle seconds.
    idleTimeout: 0,

    async fetch(request, server) {
      const { pathname } = new URL(request.url);
      if (pathname === HEALTH_PATH) return new Response("ok\n", { headers: { "cache-control": "no-store" } });
      if (pathname === COMPAT_PATH) {
        return new Response(compat, {
          headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" },
        });
      }

      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        let upstream: WebSocket;
        try {
          upstream = await connectUpstream(request, options.upstream);
        } catch {
          return new Response("upstream refused the websocket\n", { status: 502 });
        }
        const bridge: Bridge = { upstream, pending: [] };
        if (server.upgrade(request, { data: bridge })) return undefined;
        upstream.close(1011);
        return new Response("websocket upgrade failed\n", { status: 400 });
      }

      try {
        return await proxyHttp(request, options.upstream);
      } catch (error) {
        log(`${request.method} ${pathname.startsWith("/api/") ? pathname : "(page)"} failed: ${String(error)}`);
        return new Response("herdr-web-ui is not answering\n", { status: 502 });
      }
    },

    websocket: {
      // A terminal frame can be large, and herdr-web-ui sets no lower limit of its own.
      maxPayloadLength: 64 * 1024 * 1024,
      idleTimeout: 0,
      open(ws: ServerWebSocket<Bridge>) {
        const { upstream } = ws.data;
        upstream.addEventListener("message", (event) => {
          const data = event.data;
          ws.send(typeof data === "string" ? data : new Uint8Array(data as ArrayBuffer));
        });
        upstream.addEventListener("close", (event) => ws.close(sendableCloseCode(event.code), event.reason));
        upstream.addEventListener("error", () => ws.close(1011));
        for (const message of ws.data.pending.splice(0)) upstream.send(message);
      },
      message(ws: ServerWebSocket<Bridge>, message: string | Buffer) {
        const data = typeof message === "string" ? message : new Uint8Array(message);
        if (ws.data.upstream.readyState === WebSocket.OPEN) ws.data.upstream.send(data);
        else ws.data.pending.push(data);
      },
      close(ws: ServerWebSocket<Bridge>, code: number, reason: string) {
        const { upstream } = ws.data;
        if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
          upstream.close(sendableCloseCode(code), reason);
        }
      },
    },
  });
}

if (import.meta.main) {
  const compatScript = await Bun.file(new URL("./compat.js", import.meta.url)).text();
  const server = startIngress({
    hostname: process.env["GR_INGRESS_HOST"] ?? "127.0.0.1",
    port: Number(process.env["GR_INGRESS_PORT"] ?? 7300),
    upstream: process.env["GR_INGRESS_UPSTREAM"] ?? "127.0.0.1:7317",
    compatScript,
  });
  log(`listening on ${server.hostname}:${server.port}`);
}
