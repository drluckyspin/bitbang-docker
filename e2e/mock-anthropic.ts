// A stand-in for the Anthropic Messages API, so the e2e check can drive the real Claude Code without a
// login: the workspace's ANTHROPIC_BASE_URL points here, inside the container. Every request is answered
// with one text reply. A message carrying a go-remote-e2e marker is answered with `<marker>-reply`, which only
// the agent's turn can hold, so the check can tell the reply from the echo of what it typed.
//
// Usage: bun mock-anthropic.ts [port]   (default 8099; listens on loopback only)

const port = Number(process.argv[2] ?? 8099);

type Block = { type?: string; text?: string };
type Message = { role?: string; content?: string | Block[] };

function lastUserText(body: { messages?: Message[] }): string {
  const user = [...(body.messages ?? [])].reverse().find((message) => message.role === "user");
  if (!user) return "";
  if (typeof user.content === "string") return user.content;
  return (user.content ?? []).map((block) => block.text ?? "").join("\n");
}

function reply(body: { messages?: Message[] }): string {
  const marker = lastUserText(body).match(/go-remote-e2e-[0-9]+/)?.[0];
  return marker ? `${marker}-reply` : "ok";
}

function sse(model: string, text: string): string {
  const events: [string, unknown][] = [
    ["message_start", {
      type: "message_start",
      message: {
        id: `msg_mock_${Date.now()}`,
        type: "message",
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 5 },
    }],
    ["message_stop", { type: "message_stop" }],
  ];
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST") return Response.json({});
    const body = await request.json().catch(() => ({}));
    if (path.endsWith("/count_tokens")) return Response.json({ input_tokens: 10 });
    if (!path.endsWith("/v1/messages")) return Response.json({});
    const model = typeof body.model === "string" ? body.model : "claude-mock";
    const text = reply(body);
    console.log(`mock-anthropic: ${body.stream ? "stream" : "json"} reply ${JSON.stringify(text)}`);
    if (!body.stream) {
      return Response.json({
        id: `msg_mock_${Date.now()}`,
        type: "message",
        role: "assistant",
        model,
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      });
    }
    return new Response(sse(model, text), { headers: { "content-type": "text/event-stream" } });
  },
});
console.log(`mock-anthropic: listening on 127.0.0.1:${port}`);
