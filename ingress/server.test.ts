import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startIngress } from "./server.ts";

const APP_POLICY = "default-src 'self'; script-src 'self'; frame-ancestors 'none'";
const FILE_POLICY = "sandbox; default-src 'none'";
const PAGE = "<!doctype html><html><head><title>herdr</title></head><body><div id=root></div></body></html>";

/** Requests the fake app saw, for asserting on what the ingress forwarded. */
const seen: Array<{ path: string; headers: Headers; body: string }> = [];

let upstream: ReturnType<typeof Bun.serve>;
let ingress: ReturnType<typeof startIngress>;
let base: string;

/** A stand-in for herdr-web-ui: its CSP, gzip for browsers that take it, a sandboxed file view, a stream and /ws. */
beforeAll(() => {
  upstream = Bun.serve<{ cookie: string | null }, never>({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request, server) {
      const url = new URL(request.url);
      seen.push({ path: url.pathname + url.search, headers: request.headers, body: await request.text() });
      if (url.pathname === "/ws") {
        if (!request.headers.get("cookie")?.includes("herdr_web_device=")) {
          return new Response("unauthorized", { status: 401 });
        }
        return server.upgrade(request, { data: { cookie: request.headers.get("cookie") } })
          ? undefined
          : new Response("no upgrade", { status: 400 });
      }
      if (url.pathname === "/") {
        const gzip = request.headers.get("accept-encoding")?.includes("gzip");
        return new Response(gzip ? Bun.gzipSync(new TextEncoder().encode(PAGE)) : PAGE, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": APP_POLICY,
            "x-frame-options": "DENY",
            ...(gzip ? { "content-encoding": "gzip" } : {}),
          },
        });
      }
      if (url.pathname === "/api/fs/file") {
        return new Response("<html><body>repo file</body></html>", {
          headers: { "content-type": "text/html", "content-security-policy": FILE_POLICY },
        });
      }
      if (url.pathname === "/api/stream") {
        const stream = new ReadableStream({
          async start(controller) {
            controller.enqueue(new TextEncoder().encode("data: one\n\n"));
            await Bun.sleep(50);
            controller.enqueue(new TextEncoder().encode("data: two\n\n"));
            controller.close();
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream" } });
      }
      if (url.pathname === "/moved") return Response.redirect("/elsewhere", 302);
      return Response.json({ path: url.pathname, method: request.method });
    },
    websocket: {
      message(ws, message) {
        ws.send(typeof message === "string" ? `echo:${message}` : message);
      },
    },
  });
  ingress = startIngress({ port: 0, upstream: `127.0.0.1:${upstream.port}`, compatScript: "/* compat */" });
  base = `http://127.0.0.1:${ingress.port}`;
});

afterAll(() => {
  ingress.stop(true);
  upstream.stop(true);
});

/** BitBang's fixed-target headers, as its Go proxy sends them. */
const bitbang = {
  "x-forwarded-host": "bitba.ng",
  "x-forwarded-proto": "https",
  "x-forwarded-for": "203.0.113.7",
  cookie: "herdr_web_device=abc",
};

describe("pages", () => {
  test("the app's page is rewritten: meta policy, compat script, frameable by its own origin", async () => {
    const response = await fetch(`${base}/`, { headers: bitbang });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(response.headers.has("x-frame-options")).toBe(false);
    expect(html).toContain("<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'self'\">");
    expect(html).toContain("<script src=\"/__go-remote/compat.js\"></script>");
  });

  test("a gzipped page is decoded before it is rewritten", async () => {
    const response = await fetch(`${base}/`, {
      headers: { ...bitbang, "accept-encoding": "gzip" },
      decompress: false,
    });
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(await response.text()).toContain("/__go-remote/compat.js");
  });

  test("a sandboxed file preview keeps its policy", async () => {
    const response = await fetch(`${base}/api/fs/file`, { headers: bitbang });
    expect(response.headers.get("content-security-policy")).toBe(FILE_POLICY);
    expect(await response.text()).not.toContain("compat.js");
  });

  test("the compat script and health check are served by the ingress itself", async () => {
    const before = seen.length;
    const compat = await fetch(`${base}/__go-remote/compat.js`);
    expect(compat.headers.get("content-type")).toContain("text/javascript");
    expect(await compat.text()).toBe("/* compat */");
    expect(await (await fetch(`${base}/__go-remote/health`)).text()).toBe("ok\n");
    expect(seen.length).toBe(before);
  });
});

describe("requests", () => {
  test("forwards Host, proxy evidence and the body, and drops Tailscale identity", async () => {
    const response = await fetch(`${base}/api/pane/send?x=1`, {
      method: "POST",
      headers: { ...bitbang, "tailscale-user-login": "owner@example.com", "content-type": "application/json" },
      body: JSON.stringify({ text: "ls" }),
    });
    expect(await response.json()).toEqual({ path: "/api/pane/send", method: "POST" });
    const request = seen.at(-1)!;
    expect(request.path).toBe("/api/pane/send?x=1");
    expect(request.headers.get("host")).toBe("bitba.ng");
    expect(request.headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(request.headers.has("tailscale-user-login")).toBe(false);
    expect(request.body).toBe("{\"text\":\"ls\"}");
  });

  test("redirects pass through for BitBang to re-anchor", async () => {
    const response = await fetch(`${base}/moved`, { headers: bitbang, redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/elsewhere");
  });

  test("event streams arrive as they are written", async () => {
    const response = await fetch(`${base}/api/stream`, { headers: bitbang });
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toBe("data: one\n\n");
    let rest = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      rest += new TextDecoder().decode(chunk.value);
    }
    expect(rest).toBe("data: two\n\n");
  });
});

describe("websocket", () => {
  test("bridges text and binary frames with the device cookie", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${ingress.port}/ws`, { headers: bitbang } as unknown as string[]);
    socket.binaryType = "arraybuffer";
    const messages: Array<string | ArrayBuffer> = [];
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => {
        socket.send("hello");
        socket.send(new Uint8Array([1, 2, 3]));
      });
      socket.addEventListener("message", (event) => {
        messages.push(event.data);
        if (messages.length === 2) resolve();
      });
      socket.addEventListener("error", () => reject(new Error("socket error")));
    });
    socket.close();
    expect(messages[0]).toBe("echo:hello");
    expect([...new Uint8Array(messages[1] as ArrayBuffer)]).toEqual([1, 2, 3]);
    expect(seen.findLast((request) => request.path === "/ws")!.headers.get("x-forwarded-host")).toBe("bitba.ng");
  });

  test("a refused upstream handshake refuses the browser's", async () => {
    const response = await fetch(`${base}/ws`, {
      headers: {
        "x-forwarded-host": "bitba.ng",
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
      },
    });
    expect(response.status).toBe(502);
  });
});
