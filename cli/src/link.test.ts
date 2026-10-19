import { describe, expect, test } from "bun:test";
import { deviceLink, forceRelay, redact } from "./link.ts";

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

describe("forceRelay", () => {
  test("adds the flag after the code and keeps the device path", () => {
    expect(forceRelay(`${URL}/?pair=042137&pane=w1%3Ap2&view=chat`)).toBe(
      "https://bitba.ng/AbCdEfGhIjKlMnOpQrStUv#k3y-C0de_x!relay/?pair=042137&pane=w1%3Ap2&view=chat",
    );
    expect(forceRelay(URL)).toBe(`${URL}!relay`);
  });

  test("joins flags already there", () => {
    expect(forceRelay(`${URL}!nocode/?pane=w1%3Ap1`)).toBe(
      "https://bitba.ng/AbCdEfGhIjKlMnOpQrStUv#k3y-C0de_x!nocode,relay/?pane=w1%3Ap1",
    );
  });

  test("leaves a link that already chooses its path", () => {
    expect(forceRelay(`${URL}!relay/?pane=w1%3Ap1`)).toBe(`${URL}!relay/?pane=w1%3Ap1`);
    expect(forceRelay(`${URL}!debug,norelay`)).toBe(`${URL}!debug,norelay`);
  });

  test("a URL without a fragment gets one", () => {
    expect(forceRelay("https://bitba.ng/AbCdEfGhIjKlMnOpQrStUv")).toBe("https://bitba.ng/AbCdEfGhIjKlMnOpQrStUv#!relay");
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

  test("removes a connection id that starts or ends with a hyphen", () => {
    expect(redact("Connection request from -AAAAAAAAAAAAAAAAAAAAA_c765a861")).toBe("Connection request from <connection>");
    expect(redact("from AAAAAAAAAAAAAAAAAAAAA-_c765a861, again")).toBe("from <connection>, again");
  });
});
