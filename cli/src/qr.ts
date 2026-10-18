/** QR codes for the terminal (half-block characters, dark on light) and as a PNG for a local window. */
import { generate } from "lean-qr";
import { toPngBuffer } from "lean-qr/extras/node_export";

const QUIET_ZONE = 2;

/**
 * Two module rows per text row: the upper half block draws the top module, the lower one the bottom. Colours
 * are explicit (black on white), so the code scans on dark terminals too.
 */
export function terminalQr(text: string): string {
  const code = generate(text);
  const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < code.size && y < code.size && code.get(x, y);
  const lines: string[] = [];
  for (let y = -QUIET_ZONE; y < code.size + QUIET_ZONE; y += 2) {
    let line = "";
    for (let x = -QUIET_ZONE; x < code.size + QUIET_ZONE; x++) {
      const top = dark(x, y);
      const bottom = dark(x, y + 1);
      line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    lines.push(`\x1b[30;47m${line}\x1b[0m`);
  }
  return lines.join("\n");
}

export function pngQr(text: string): Uint8Array {
  return toPngBuffer(generate(text), { scale: 10, pad: 4 });
}
