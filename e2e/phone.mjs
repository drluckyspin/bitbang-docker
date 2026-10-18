// End-to-end check of a workspace through a real BitBang URL, as a phone (Chromium, Pixel 7 emulation).
//
// Reads two links from /secrets: `url` (the bare BitBang URL) and `link` (the same URL carrying a one-time
// pairing code and a deep link to the terminal). Neither is ever printed: every line this script writes
// passes through redact(). Prints one JSON object with the results; exits 1 if any check failed.
//
// BBD_E2E_COMMAND is typed into the terminal and BBD_E2E_EXPECT must then appear in it. The caller checks
// in the container that the command really ran in the pane.
//
// With /secrets/chat (the URL deep-linked to an agent's chat, no pairing code: the phone is paired by then),
// BBD_E2E_CHAT_MESSAGE is sent from the chat's composer and BBD_E2E_CHAT_EXPECT must come back as the
// agent's turn. With /secrets/moved (the chat of a session moved in from the laptop), BBD_E2E_MOVED_HISTORY
// must be among its earlier turns, and BBD_E2E_MOVED_MESSAGE must be answered with BBD_E2E_MOVED_EXPECT.
import { existsSync, readFileSync } from "node:fs";
import { chromium, devices } from "playwright";

const secret = (name) => (existsSync(`/secrets/${name}`) ? readFileSync(`/secrets/${name}`, "utf8").trim() : "");
const url = secret("url");
const link = secret("link");
const chatLink = secret("chat");
const movedLink = secret("moved");
const command = process.env.BBD_E2E_COMMAND ?? "";
const expected = process.env.BBD_E2E_EXPECT ?? "";
const chatMessage = process.env.BBD_E2E_CHAT_MESSAGE ?? "";
const chatExpected = process.env.BBD_E2E_CHAT_EXPECT ?? "";
const movedHistory = process.env.BBD_E2E_MOVED_HISTORY ?? "";
const movedMessage = process.env.BBD_E2E_MOVED_MESSAGE ?? "";
const movedExpected = process.env.BBD_E2E_MOVED_EXPECT ?? "";
const timeout = Number(process.env.BBD_E2E_TIMEOUT_MS ?? 120_000);
const shots = process.env.BBD_E2E_SCREENSHOTS ?? "";

const secrets = [link, chatLink, movedLink, url, ...[...link.matchAll(/pair=(\d+)/g)].map((match) => match[1])];
function redact(text) {
  let out = String(text);
  for (const secret of secrets) if (secret) out = out.replaceAll(secret, "<redacted>");
  return out.replace(/https:\/\/bitba\.ng\/\S*/g, "https://bitba.ng/<redacted>");
}

const results = {};
/** anything that fails the run: page errors, refused or failed requests, a step that timed out */
const problems = [];
/** every 4xx and 5xx answer, counted; most are expected (an unpaired phone is refused) */
const responses = new Map();
/** frame navigations and pairing requests, by path and parameter names only */
const trace = [];

/** An address reduced to its path and parameter names, with BitBang's session and device ids removed. */
function shape(address) {
  const parsed = new URL(address);
  const path = parsed.pathname.replace(/\/__device__\/[^/]+/, "").replace(/^\/[A-Za-z0-9_-]{22}$/, "/<id>") || "/";
  const names = [...parsed.searchParams.keys()];
  return `${parsed.origin === "https://bitba.ng" ? "" : "(elsewhere)"}${path}${names.length ? `?${names.join("&")}` : ""}`;
}

/**
 * BitBang shows the device's page in its #device-frame iframe. The frame's address loses the
 * /__device__/<session> prefix as soon as the page starts, so it cannot be found by URL.
 */
function deviceFrame(page) {
  return page.frameLocator("#device-frame");
}

async function deviceAddress(page) {
  const frame = await (await page.locator("#device-frame").elementHandle({ timeout }))?.contentFrame();
  return frame ? frame.url() : "";
}

function watch(page, label) {
  page.on("console", (message) => {
    // failed loads are counted from the responses themselves
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
      problems.push(`${label} console: ${redact(message.text()).slice(0, 300)}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`${label} page error: ${redact(error.message).slice(0, 300)}`));
  page.on("framenavigated", (frame) => trace.push(`${label} ${frame === page.mainFrame() ? "page" : "frame"} -> ${shape(frame.url())}`));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/api/devices")) trace.push(`${label} ${request.method()} ${shape(request.url())}`);
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const key = `${label} ${status} ${response.request().method()} ${shape(response.url())}`;
    responses.set(key, (responses.get(key) ?? 0) + 1);
    if (status === 403 || status >= 500) problems.push(key);
  });
}

/** What the device frame shows, for a failure report: its visible text, redacted and cut short. */
async function frameSummary(page) {
  const text = await deviceFrame(page).locator("body").innerText({ timeout: 5000 }).catch(() => null);
  if (text === null) return "no device frame";
  return redact(text.replace(/\s+/g, " ")).slice(0, 400);
}

async function shot(page, name) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

const browser = await chromium.launch();
let current = null;
try {
  const phone = devices["Pixel 7"];

  // A leaked URL alone: BitBang connects, and the app asks for a pairing code.
  {
    const context = await browser.newContext({ ...phone });
    const page = await context.newPage();
    current = page;
    watch(page, "unpaired");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    await deviceFrame(page).locator("[data-testid=token-gate]").waitFor({ timeout });
    results.unpairedSeesGate = true;
    await shot(page, "1-unpaired");
    await context.close();
  }

  // The one-scan link: connects, pairs and opens the terminal.
  const context = await browser.newContext({ ...phone });
  const page = await context.newPage();
  current = page;
  watch(page, "paired");
  await page.goto(link, { waitUntil: "domcontentloaded", timeout });
  const frame = deviceFrame(page);
  const terminal = frame.locator(".xterm").first();
  await terminal.waitFor({ timeout });
  results.pairedSeesTerminal = (await frame.locator("[data-testid=token-gate]").count()) === 0;
  results.pairCodeLeftAddress = !page.url().includes("pair=") && !(await deviceAddress(page)).includes("pair=");

  // Input typed before the terminal stream is attached is held back, so wait for the shell's prompt.
  const rows = frame.locator(".xterm-rows");
  await rows.filter({ hasText: /\S/ }).first().waitFor({ timeout });
  await frame.locator(".terminal-banner", { hasText: "Waiting for terminal input" }).waitFor({ state: "hidden", timeout });
  results.terminalReady = true;
  await shot(page, "2-terminal");

  if (command) {
    await terminal.click();
    await page.keyboard.type(command, { delay: 20 });
    await page.keyboard.press("Enter");
    if (expected) {
      await rows.filter({ hasText: expected }).first().waitFor({ timeout });
      results.outputSeen = true;
    }
    await shot(page, "3-typed");
  }

  // BitBang keeps the device cookie in its own jar, so a reload stays paired.
  await page.reload({ waitUntil: "domcontentloaded", timeout });
  await frame.locator(".xterm, [data-testid=token-gate]").first().waitFor({ timeout });
  results.reloadStaysPaired = (await frame.locator("[data-testid=token-gate]").count()) === 0;
  await shot(page, "4-reloaded");

  /** Opens an agent's chat, and returns its composer once the chat's socket is up. */
  async function openChat(address) {
    await page.goto(address, { waitUntil: "domcontentloaded", timeout });
    // Until then, the composer's placeholder says it is reconnecting.
    const composer = frame.locator("textarea.composer-text:not([placeholder^='Reconnecting'])");
    await composer.waitFor({ timeout });
    return composer;
  }

  async function send(composer, message) {
    await composer.fill(message);
    await frame.locator("button.composer-send").click();
  }

  const agentTurn = (text) => frame.locator("article.chat-turn-agent", { hasText: text }).first();

  // The agent's chat: what the phone's Chat button opens.
  if (chatLink && chatMessage) {
    const composer = await openChat(chatLink);
    results.chatReady = (await frame.locator("[data-testid=token-gate]").count()) === 0;
    await shot(page, "5-chat");
    await send(composer, chatMessage);
    if (chatExpected) {
      await agentTurn(chatExpected).waitFor({ timeout });
      results.chatReplied = true;
    }
    await shot(page, "6-chat-reply");
  }

  // A session moved in from the laptop, as /go-remote moves it: the same conversation, carried on.
  if (movedLink && movedMessage) {
    const composer = await openChat(movedLink);
    if (movedHistory) {
      await agentTurn(movedHistory).waitFor({ timeout });
      results.movedHistorySeen = true;
    }
    await shot(page, "7-moved");
    await send(composer, movedMessage);
    if (movedExpected) {
      await agentTurn(movedExpected).waitFor({ timeout });
      results.movedReplied = true;
    }
    await shot(page, "8-moved-reply");
  }
  await context.close();
} catch (error) {
  problems.push(`failed: ${redact(error.message).split("\n")[0]}`);
  if (current) {
    problems.push(`frame shows: ${await frameSummary(current)}`);
    await shot(current, "failure").catch(() => {});
  }
} finally {
  await browser.close();
}

const required = ["unpairedSeesGate", "pairedSeesTerminal", "pairCodeLeftAddress", "terminalReady", "reloadStaysPaired"];
if (expected) required.push("outputSeen");
if (chatLink && chatMessage) required.push("chatReady");
if (chatLink && chatMessage && chatExpected) required.push("chatReplied");
if (movedLink && movedMessage && movedHistory) required.push("movedHistorySeen");
if (movedLink && movedMessage && movedExpected) required.push("movedReplied");
const ok = required.every((key) => results[key] === true) && problems.length === 0;
console.log(JSON.stringify({
  ok,
  results,
  problems,
  responses: [...responses].map(([key, count]) => (count > 1 ? `${key} (x${count})` : key)),
  ...(process.env.BBD_E2E_TRACE ? { trace } : {}),
}, null, 2));
process.exit(ok ? 0 : 1);
