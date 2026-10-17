import { describe, expect, test } from "bun:test";
import { deviceLink, redact } from "./link.ts";

const URL = "https://bitba.ng/AbCdEfGhIjKlMnOpQrStUv#k3y-C0de_x";

describe("deviceLink", () => {
  test("carries the pairing code and the pane after the fragment's code", () => {
    expect(deviceLink(URL, { pair: "042137", pane: "w1:p2", view: "chat" })).toBe(
      "https://bitba.ng/AbCdEfGhIjKlMnOpQrStUv#k3y-C0de_x/?pair=042137&pane=w1%3Ap2&view=chat",
    );
  });

  test("keeps BitBang's flags and replaces any device path already there", () => {
    expect(deviceLink(`${URL}!nocode/old/path?x=1`, { pair: "000001" })).toBe(
      "https://bitba.ng/AbCdEfGhIjKlMnOpQrStUv#k3y-C0de_x!nocode/?pair=000001",
    );
  });

  test("a view without a pane is left out, and nothing to add leaves the URL as it was", () => {
    expect(deviceLink(URL, { view: "terminal" })).toBe(URL);
  });

  test("a URL without a fragment still gets a device path", () => {
    expect(deviceLink("https://bitba.ng/AbCdEfGhIjKlMnOpQrStUv", { pane: "w1:p1", view: "terminal" })).toBe(
      "https://bitba.ng/AbCdEfGhIjKlMnOpQrStUv#/?pane=w1%3Ap1&view=terminal",
    );
  });
});

describe("redact", () => {
  test("removes BitBang URLs and the connection ids BitBang logs", () => {
    const line = `Listening at ${URL}/?pair=123456 and Connection request from AbCdEfGhIjKlMnOpQrStUv_c765a861 (browser_ip=1.2.3.4)`;
    const out = redact(line);
    expect(out).not.toContain("AbCdEfGhIjKlMnOpQrStUv");
    expect(out).not.toContain("123456");
    expect(out).toBe("Listening at https://bitba.ng/<redacted> and Connection request from <connection> (browser_ip=1.2.3.4)");
  });
});
