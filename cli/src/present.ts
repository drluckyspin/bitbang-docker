/**
 * Handing the link to the person holding the phone, and to nobody else. On an interactive terminal it is shown
 * there; otherwise (an agent ran go-remote, or stdout is a pipe) it never reaches stdout or stderr, and the QR code
 * opens in a window on this computer instead.
 */
import { openImage } from "./host.ts";
import { deviceLink, forceRelay, type View } from "./link.ts";
import { capture } from "./proc.ts";
import { pngQr, terminalQr } from "./qr.ts";
import { ui, UserError } from "./ui.ts";
import { exec, type Workspace } from "./workspace.ts";

export interface LinkOptions {
  json: boolean;
  /** draw the QR code on an interactive terminal (false prints the link alone) */
  qr: boolean;
  /** allow a window when the terminal cannot be used */
  window: boolean;
}

export interface Shown {
  /** where the QR code went */
  qr: "terminal" | "window" | "none";
  pairing_expires_at?: string;
}

/** A fresh one-time pairing code from herdr-web-ui, valid for ten minutes. */
export async function pairingCode(workspace: Workspace): Promise<{ code: string; expires_at: string }> {
  const answer = JSON.parse(await exec(workspace, ["go-remote-pair"]));
  if (typeof answer?.code !== "string" || !/^\d{6}$/.test(answer.code)) throw new UserError("herdr-web-ui did not issue a pairing code");
  return { code: answer.code, expires_at: String(answer.expires_at ?? "") };
}

export function interactive(options: LinkOptions): boolean {
  return !options.json && process.stdout.isTTY === true;
}

/** Shows the link for a workspace: BitBang's URL, plus pairing and the pane in web mode. */
export async function showLink(
  workspace: Workspace,
  url: string,
  target: { pane?: string; view?: View },
  options: LinkOptions,
): Promise<Shown> {
  let qr: Shown["qr"] = "none";
  if (!interactive(options) && !options.window) {
    ui.warn("The link was not shown: there is no terminal or window to show it in. Run go-remote qr in a terminal.");
    return { qr };
  }

  let link = url;
  let expires: string | undefined;
  if (workspace.ui === "web") {
    const pairing = await pairingCode(workspace);
    expires = pairing.expires_at;
    link = deviceLink(url, { pair: pairing.code, pane: target.pane, view: target.view });
  }
  if (workspace.relay) link = forceRelay(link);

  if (interactive(options)) {
    if (options.qr) {
      process.stdout.write(`\n${terminalQr(link)}\n\n`);
      qr = "terminal";
    }
    process.stdout.write(`${link}\n`);
  } else if (options.window && (await openImage(pngQr(link), workspace.project))) {
    qr = "window";
  }

  const pin = (await capture(["docker", "exec", workspace.id, "sh", "-c", '[ -n "$BITBANG_PIN" ]'])).code === 0;
  if (qr === "window") ui.info("The QR code is open in a window on this computer. Scan it with your phone's camera.");
  if (qr === "none" && !interactive(options)) {
    ui.warn("The link was not shown: there is no terminal or window to show it in. Run go-remote qr in a terminal.");
  }
  if (workspace.ui === "web" && (interactive(options) || qr === "window")) {
    ui.dim("It connects and pairs one phone in a single scan. The pairing code expires in 10 minutes; go-remote qr makes a new one.");
  }
  if (pin) ui.dim("BitBang asks for the PIN from .env before connecting.");
  if (interactive(options)) ui.warn("The link opens this workspace. Share it like a password.");
  return { qr, ...(expires ? { pairing_expires_at: expires } : {}) };
}
