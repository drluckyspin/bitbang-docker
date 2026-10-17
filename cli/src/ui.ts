/**
 * Messages for people, in the style of scripts/log.bash: all on stderr, so stdout carries only what a
 * command produces (a QR code, a table, JSON).
 */

const colour = process.stderr.isTTY === true && !process.env.NO_COLOR;

function paint(codes: string, text: string): string {
  return colour ? `\x1b[${codes}m${text}\x1b[0m` : text;
}

function write(line: string): void {
  process.stderr.write(`${line}\n`);
}

export const ui = {
  log: (message: string) => write(paint("97", ` ${message}`)),
  dim: (message: string) => write(paint("2;97", ` ${message}`)),
  info: (message: string) => write(paint("94", ` ${message}`)),
  infoDim: (message: string) => write(paint("2;94", ` ${message}`)),
  success: (message: string) => write(` ${paint("92", "✔")} ${paint("2;92", ` ${message}`)}`),
  warn: (message: string) => write(` ${paint("93", "▲")}  ${paint("2;93", message)}`),
  error: (message: string) => write(` ${paint("91", "✖")}  ${paint("2;91", message)}`),
};

/** Control characters in text from a transcript or the container could drive the terminal it is printed on. */
export function hasControl(text: string): boolean {
  return /[\u0000-\u001f\u007f-\u009f]/.test(text);
}

export function printable(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

/** One word of a command line for the user to paste, quoted when a shell would read it differently. */
export function shellQuote(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

/** A failure the user can act on: printed as one line, without a stack trace. */
export class UserError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
  }
}

/** Asks a yes/no question on the terminal, where an empty answer is `yes`; false without a terminal. */
export async function confirm(question: string, yes = false): Promise<boolean> {
  if (process.stdin.isTTY !== true || process.stderr.isTTY !== true) return false;
  process.stderr.write(paint("97", ` ${question} ${yes ? "[Y/n]" : "[y/N]"} `));
  for await (const line of console) return line.trim() === "" ? yes : /^y(es)?$/i.test(line.trim());
  return false;
}
