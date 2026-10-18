/**
 * The link a phone opens. A BitBang URL is https://bitba.ng/<id>#<code>[!flags][/device URL]: everything after
 * the first / in the fragment is the address BitBang opens inside the container, and a fragment never reaches
 * the signalling server. herdr-web-ui's own pairing code and deep link ride there, so one scan connects, pairs
 * and opens the pane.
 */

export type View = "chat" | "terminal";

export interface DeepLink {
  /** herdr-web-ui's one-time pairing code */
  pair?: string;
  pane?: string;
  view?: View;
}

export function deviceLink(url: string, link: DeepLink): string {
  const hash = url.indexOf("#");
  const base = hash === -1 ? url : url.slice(0, hash);
  const fragment = hash === -1 ? "" : url.slice(hash + 1);
  const code = fragment.split("/")[0] ?? "";
  const query = new URLSearchParams();
  if (link.pair) query.set("pair", link.pair);
  if (link.pane) query.set("pane", link.pane);
  if (link.pane && link.view) query.set("view", link.view);
  const search = query.toString();
  return search ? `${base}#${code}/?${search}` : `${base}#${code}`;
}

/**
 * Strips what grants access from text that may end up in a log or an agent's context: BitBang URLs, and the
 * device id BitBang prints for each connection (it is the URL's path).
 */
export function redact(text: string): string {
  return text
    .replace(/https:\/\/bitba\.ng\/\S*/g, "https://bitba.ng/<redacted>")
    // No word boundaries: an id may start with "-", where \b never matches, and redacting a little more is harmless.
    .replace(/[A-Za-z0-9_-]{22}_[0-9a-f]{8}/g, "<connection>");
}
