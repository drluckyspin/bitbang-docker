import { expect, test } from "bun:test";
import { generate } from "lean-qr";
import { pngQr, terminalQr } from "./qr.ts";

const LINK = "https://bitba.ng/AbCdEfGhIjKlMnOpQrStUv#k3y-C0de_x/?pair=042137&pane=w1%3Ap2&view=chat";

test("the terminal QR code packs two module rows into each line, inside a quiet zone", () => {
  const size = generate(LINK).size;
  const rows = terminalQr(LINK).split("\n");
  expect(rows).toHaveLength(Math.ceil((size + 4) / 2));
  for (const row of rows) {
    // eslint-disable-next-line no-control-regex
    const cells = row.replace(/\x1b\[[0-9;]*m/g, "");
    expect([...cells]).toHaveLength(size + 4);
  }
  // the top-left finder pattern: its first row is all dark, its second dark only at the edges
  // eslint-disable-next-line no-control-regex
  expect(rows[1]?.replace(/\x1b\[[0-9;]*m/g, "").startsWith("  █▀▀▀▀▀█")).toBe(true);
});

test("the window image is a PNG", () => {
  expect([...pngQr(LINK).slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});
