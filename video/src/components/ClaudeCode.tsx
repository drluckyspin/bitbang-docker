/**
 * Claude Code's terminal UI, driven by a timed script: prompts typed into the input box, replies that stream
 * in, tool calls that run and then show their results, a todo list, the spinner, the slash-command menu, and
 * the shell it leaves behind when it exits. The transcript scrolls like a terminal once it outgrows the window,
 * gliding up under an input box that holds still. A `focus` puts the camera's attention on the input box: the
 * rest dims, and Enter sends a ring out of it. A `sent` command rises out of the box into the transcript and
 * stays lit there.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { brand, claude, fonts } from "../theme";
import { ease, mix, progress, streamedCount, typedCount } from "../lib/anim";
import { TermLine, icon, line, span, type Line, type Span } from "./term";

export type Block =
  | { kind: "welcome"; at: number; cwd: string }
  /** `sent` is the command the video is about: it rises out of the input box and stays lit while it runs. */
  | { kind: "user"; at: number; text: string; sent?: boolean }
  | { kind: "say"; at: number; text: string; duration: number }
  | {
      kind: "tool";
      at: number;
      name: string;
      args?: string;
      doneAt: number;
      result: Line[];
      running?: string;
    }
  | { kind: "todos"; at: number; items: { text: string; activeAt?: number; doneAt?: number }[] }
  | { kind: "raw"; at: number; lines: Line[] };

export type Prompt = { text: string; start: number; cps: number; submit: number };
export type Busy = { from: number; to: number; verb: string; tokens: number };
export type MenuItem = { name: string; desc: string };

export type ClaudeScript = {
  blocks: Block[];
  prompts: Prompt[];
  busy: Busy[];
  menu?: MenuItem[];
  exitAt?: number;
  after?: { at: number; lines: Line[] }[];
};

/** `dim` and `glow` run from 0 to 1; `pulse` is the ring's progress after Enter. */
export type Focus = { dim: number; glow: number; pulse: number; text: string };

type Role = "input" | "sent";
type Item = { kind: "line"; line: Line; role?: Role } | { kind: "box"; lines: Line[]; color: string; cols?: number; role?: Role };
type UserBlock = Extract<Block, { kind: "user" }>;

const blank: Line = { spans: [] };
const RESULT = 5;
/** Rows kept under the input box for the slash menu, so the box doesn't jump when the menu opens. */
const MENU_ROWS = 3;
const SCROLL_WEIGHTS = [0.36, 0.24, 0.16, 0.11, 0.08, 0.05];
/** Frames the sent command takes to rise from the input box to its line in the transcript. */
const RISE = 10;

const AQUA = (a: number) => `rgba(${brand.aquaRgb},${Math.max(0, a).toFixed(3)})`;
const aquaGlow = (a: number) => `0 0 ${(10 * a).toFixed(1)}px ${AQUA(0.9 * a)}`;
/** The sent command leaves the box as bright as it was typed, then settles to a tint it keeps. */
const sentLight = (frame: number, at: number) => 1 - 0.5 * progress(frame, at + RISE, 30, ease.inOut);

/** Wraps text, keeping each line's offset into the original so styles and streaming can follow it. */
const wrapOffsets = (text: string, width: number) => {
  const out: { start: number; len: number }[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.length - i <= width) {
      out.push({ start: i, len: text.length - i });
      break;
    }
    let cut = text.lastIndexOf(" ", i + width);
    if (cut <= i) cut = i + width;
    out.push({ start: i, len: cut - i });
    i = cut + (text[cut] === " " ? 1 : 0);
  }
  return out.length ? out : [{ start: 0, len: 0 }];
};

/** Markdown-ish text: `code` spans are coloured, **bold** is bold. Returns the plain text and a style per char. */
const parseInline = (text: string, base: string) => {
  let plain = "";
  const styles: { c: string; b: boolean }[] = [];
  let code = false;
  let bold = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "`") {
      code = !code;
      continue;
    }
    if (text.startsWith("**", i)) {
      bold = !bold;
      i++;
      continue;
    }
    plain += text[i];
    styles.push({ c: code ? claude.blue : base, b: bold });
  }
  return { plain, styles };
};

const styledLines = (text: string, width: number, base: string, shown = Infinity): Span[][] => {
  const { plain, styles } = parseInline(text, base);
  return wrapOffsets(plain, width).map(({ start, len }) => {
    const visible = Math.max(0, Math.min(len, shown - start));
    const spans: Span[] = [];
    for (let k = 0; k < visible; k++) {
      const st = styles[start + k] ?? { c: base, b: false };
      const ch = plain[start + k] ?? "";
      const last = spans[spans.length - 1];
      if (last && last.c === st.c && Boolean(last.b) === st.b) last.t = `${last.t ?? ""}${ch}`;
      else spans.push({ t: ch, c: st.c, b: st.b });
    }
    return spans;
  });
};

const bullet = (color: string, o = 1): Span => icon("dot", color, { o });
const elbow: Span = icon("elbow", claude.faint);

const resultLines = (lines: Line[]): Line[] =>
  lines.map((l, i) => ({
    ...l,
    bgFrom: RESULT,
    spans: [...(i === 0 ? [span("  "), elbow, span(" ")] : [span(" ".repeat(RESULT))]), ...l.spans],
  }));

const blockItems = (b: Block, frame: number, cols: number): Item[] => {
  switch (b.kind) {
    case "welcome":
      return [
        {
          kind: "box",
          color: claude.orange,
          cols: 58,
          lines: [
            line(icon("spark", claude.orange), span("Welcome to Claude Code!", claude.fg, { b: true })),
            blank,
            line(span("  /help for help, /status for your current setup", claude.dim)),
            blank,
            line(span(`  cwd: ${b.cwd}`, claude.dim)),
          ],
        },
      ];
    case "user": {
      const lit = b.sent ? sentLight(frame, b.at) : 0;
      const glow = lit > 0 ? aquaGlow(lit) : undefined;
      return styledLines(b.text, cols - 2, lit > 0 ? mixHex(claude.dim, brand.ice, lit) : claude.dim).map((spans, i) => ({
        kind: "line",
        role: b.sent ? "sent" : undefined,
        line: { spans: [span(i === 0 ? "> " : "  ", claude.dim), ...spans.map((s) => (glow ? { ...s, glow } : s))] },
      }));
    }
    case "say": {
      const shown = streamedCount(b.text.replace(/`|\*\*/g, ""), frame, b.at, b.duration);
      const rows = styledLines(b.text, cols - 2, claude.fg, shown).filter((spans, i) => i === 0 || spans.length > 0);
      return rows.map((spans, i) => ({
        kind: "line",
        line: { spans: [i === 0 ? bullet(claude.fg) : span("  "), ...spans] },
      }));
    }
    case "tool": {
      const running = frame < b.doneAt;
      const blink = running ? (Math.floor((frame - b.at) / 8) % 2 === 0 ? 1 : 0.35) : 1;
      const head = `${b.name}${b.args === undefined ? "" : `(${b.args})`}`;
      const headRows = wrapOffsets(head, cols - 2).map(({ start, len }, i) => {
        const text = head.slice(start, start + len);
        const nameEnd = Math.max(0, Math.min(len, b.name.length - start));
        const spans: Span[] = [
          i === 0 ? bullet(running ? claude.fg : claude.green, blink) : span("  "),
          span(text.slice(0, nameEnd), claude.fg, { b: true }),
          span(text.slice(nameEnd), claude.fg),
        ];
        return { kind: "line", line: { spans } } as Item;
      });
      const body = running ? [line(span(b.running ?? "Running…", claude.dim))] : b.result;
      return [...headRows, ...resultLines(body).map((l) => ({ kind: "line", line: l }) as Item)];
    }
    case "todos": {
      const doneAll = b.items.every((it) => it.doneAt !== undefined && frame >= it.doneAt);
      const head: Item = {
        kind: "line",
        line: line(bullet(doneAll || frame > b.at + 4 ? claude.green : claude.fg), span("Update Todos", claude.fg, { b: true })),
      };
      const rows = b.items.map((it) => {
        const done = it.doneAt !== undefined && frame >= it.doneAt;
        const active = !done && it.activeAt !== undefined && frame >= it.activeAt;
        return line(
          icon(done ? "boxDone" : "box", done ? claude.faint : active ? claude.fg : claude.dim),
          span(it.text, done ? claude.faint : claude.fg, { st: done, b: active }),
        );
      });
      return [head, ...resultLines(rows).map((l) => ({ kind: "line", line: l }) as Item)];
    }
    case "raw":
      return b.lines.map((l) => ({ kind: "line", line: l }));
  }
};

const statusLine = (busy: Busy, frame: number, fps: number): Line => {
  const t = frame - busy.from;
  const seconds = Math.floor((t / fps) * 3) + 1;
  const tokens = (busy.tokens + t * 23) / 1000;
  const verb = `${busy.verb}…`;
  const hi = (t * 0.55) % (verb.length + 8);
  const shimmer: Span[] = verb.split("").map((ch, i) => {
    const d = Math.abs(i - hi + 2);
    return span(ch, d < 1.6 ? "#F5B49A" : d < 3 ? "#E8956F" : claude.orange);
  });
  const phase = Math.floor(t / 4) % 6;
  return line(
    icon("spark", claude.orange, { r: phase * 22, o: 0.65 + 0.35 * Math.sin(t / 3) ** 2 }),
    ...shimmer,
    span(` (${seconds}s · `, claude.dim),
    span(`↑ ${tokens.toFixed(1)}k tokens`, claude.dim),
    span(" · esc to interrupt)", claude.dim),
  );
};

const inputItems = (script: ClaudeScript, frame: number, cols: number, focus?: Focus): Item[] => {
  const typing = script.prompts.find((p) => frame >= p.start && frame < p.submit);
  const untouched = script.prompts.every((p) => frame < p.start);
  const typed = typing ? typing.text.slice(0, typedCount(frame, typing.start, typing.text.length, typing.cps)) : "";
  /** The caret waits until the sent command has lifted clear of the box's first cell. */
  const lifting = script.blocks.some((b) => b.kind === "user" && b.sent && frame >= b.at && frame < b.at + 3);
  const cursor = lifting ? span(" ", claude.fg) : span(" ", claude.bg, { bg: claude.fg });
  const glow = focus && typed ? focus.glow : 0;
  const typedSpan = span(typed, glow > 0 ? brand.ice : claude.fg, { glow: glow > 0 ? aquaGlow(glow) : undefined });
  const content = untouched
    ? line(span("> ", claude.fg), cursor, span('Try "write a test for upload.ts"', claude.faint))
    : line(span("> ", claude.fg), typedSpan, cursor);
  const items: Item[] = [{ kind: "box", color: claude.border, lines: [content], role: "input" }];
  const below: Line[] = [];
  if (typed.startsWith("/") && script.menu) {
    const query = typed.slice(1);
    const matches = script.menu.filter((m) => m.name.slice(1).startsWith(query)).slice(0, MENU_ROWS);
    matches.forEach((m, i) => {
      const color = i === 0 ? "#B1B9F9" : claude.dim;
      below.push(line(span(`  ${m.name.padEnd(22)}`, color, { b: i === 0 }), span(m.desc.slice(0, cols - 26), color)));
    });
  } else {
    below.push(line(span("  ? for shortcuts", claude.faint)));
  }
  while (script.menu && below.length < MENU_ROWS) below.push(blank);
  items.push(...below.map((l) => ({ kind: "line", line: l, role: "input" }) as Item));
  return items;
};

const layout = (script: ClaudeScript, frame: number, fps: number, cols: number, focus?: Focus): Item[] => {
  const items: Item[] = [];
  for (const b of script.blocks) {
    if (frame < b.at) continue;
    if (items.length) items.push({ kind: "line", line: blank });
    items.push(...blockItems(b, frame, cols));
  }
  const exited = script.exitAt !== undefined && frame >= script.exitAt;
  if (!exited) {
    const busy = script.busy.find((b) => frame >= b.from && frame < b.to);
    items.push({ kind: "line", line: blank });
    if (busy) {
      items.push({ kind: "line", line: statusLine(busy, frame, fps) });
      items.push({ kind: "line", line: blank });
    }
    items.push(...inputItems(script, frame, cols, focus));
  } else {
    items.push({ kind: "line", line: blank });
    for (const a of script.after ?? []) if (frame >= a.at) items.push(...a.lines.map((l) => ({ kind: "line", line: l }) as Item));
  }
  return items;
};

const rowsOf = (items: Item[]) => items.reduce((n, it) => n + (it.kind === "box" ? it.lines.length + 2 : 1), 0);

const PAD_Y = 14;
const MARGIN = 1;
const rowsIn = (height: number, lineHeight: number, padY: number, margin: number) => Math.floor((height - padY * 2) / lineHeight) - margin;

/**
 * How far the window has scrolled, in rows: `target` is where it is headed at a frame, `at` where the glide
 * has got to. A terminal never scrolls back down: when Claude Code exits, the shell prompt takes the place of
 * the box.
 */
const scrolling = (script: ClaudeScript, fps: number, cols: number, rows: number) => {
  const scrollTo = (f: number) => Math.max(0, rowsOf(layout(script, f, fps, cols)) - rows);
  const exitAt = script.exitAt ?? -1;
  const target = (f: number) => (exitAt > 0 && f >= exitAt ? Math.max(scrollTo(f), scrollTo(exitAt - 1)) : scrollTo(f));
  return { target, at: (f: number) => SCROLL_WEIGHTS.reduce((sum, w, k) => sum + w * target(f - k), 0) };
};

const sentBlock = (script: ClaudeScript) => script.blocks.find((b): b is UserBlock => b.kind === "user" && b.sent === true);

/**
 * Where the middle of the sent command's line is at `frame`, in pixels from the top of a ClaudeCode of this
 * size, or undefined before it is sent: what a camera follows it by. It is where the line settles, so the
 * rise out of the input box still plays against the camera.
 */
export const sentLineY = (script: ClaudeScript, frame: number, fps: number, size: { cols: number; lineHeight: number; height: number }) => {
  const sent = sentBlock(script);
  if (!sent || frame < sent.at) return undefined;
  const items = layout(script, frame, fps, size.cols);
  const row = rowsOf(items.slice(0, items.findIndex((it) => it.role === "sent")));
  const scroll = scrolling(script, fps, size.cols, rowsIn(size.height, size.lineHeight, PAD_Y, MARGIN)).at(frame);
  return PAD_Y + (row - scroll + 0.5) * size.lineHeight;
};

/** The transcript as rows, as it stands at `frame`: what the session scene lifts off the laptop, row by row. */
export const transcriptRows = (script: ClaudeScript, frame: number, fps: number, cols: number): Line[] =>
  layout(script, frame, fps, cols).flatMap((it) => (it.kind === "line" ? [it.line] : [blank, ...it.lines, blank]));

/**
 * What Enter sets off: a soft flash on the command and one ring that leaves it, drawn around the typed text,
 * which starts 3ch into the box and sits on its middle row.
 */
const Pulse: React.FC<{ focus: Focus; lineHeight: number }> = ({ focus, lineHeight }) => {
  const top = lineHeight - 1.5;
  const pill = (grow: number): React.CSSProperties => ({
    position: "absolute",
    left: `calc(2.4ch - ${grow}px)`,
    width: `calc(${focus.text.length + 1.2}ch + ${grow * 2}px)`,
    top: top - 5 - grow,
    height: lineHeight + 10 + grow * 2,
    borderRadius: lineHeight / 2 + 5 + grow,
    pointerEvents: "none",
  });
  const flash = focus.pulse > 0 ? Math.max(0, 1 - focus.pulse * 3) : 0;
  const ring = focus.pulse;
  return (
    <>
      {flash > 0 ? <div style={{ ...pill(0), background: AQUA(0.14 * flash), boxShadow: `0 0 ${(14 * flash).toFixed(1)}px ${AQUA(0.35 * flash)}` }} /> : null}
      {ring > 0 && ring < 1 ? (
        <div
          style={{
            ...pill(ease.out(ring) * 22),
            border: `1.5px solid ${AQUA(0.5 * (1 - ring))}`,
            boxShadow: `0 0 ${(8 * (1 - ring)).toFixed(1)}px ${AQUA(0.22 * (1 - ring))}`,
          }}
        />
      ) : null}
    </>
  );
};

export const ClaudeCode: React.FC<{
  script: ClaudeScript;
  cols: number;
  fontSize: number;
  lineHeight: number;
  height: number;
  padX?: number;
  padY?: number;
  /** Extra rows kept clear below the input box, so it does not sit on the window's edge. */
  margin?: number;
  focus?: Focus;
}> = ({ script, cols, fontSize, lineHeight, height, padX = 22, padY = PAD_Y, margin = MARGIN, focus }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { target, at: scrollAt } = scrolling(script, fps, cols, rowsIn(height, lineHeight, padY, margin));
  const { transcript, input } = split(layout(script, frame, fps, cols, focus));
  const scroll = scrollAt(frame);
  /** The input box goes where the scroll is headed rather than gliding with it, so it holds still. */
  const inputTop = rowsOf(transcript) - target(frame);
  const glow = focus?.glow ?? 0;

  const sent = sentBlock(script);
  const rising = sent !== undefined && frame >= sent.at && frame < sent.at + RISE;
  let riser: { row: number; across: number; lines: Line[] } | undefined;
  if (sent && rising) {
    const before = split(layout(script, sent.at - 1, fps, cols));
    const from = rowsOf(before.transcript) - target(sent.at - 1) + 1;
    const k = transcript.findIndex((it) => it.role === "sent");
    const row = rowsOf(transcript.slice(0, k));
    const t = progress(frame, sent.at, RISE, ease.inOut);
    riser = {
      row: row - scroll + (from - (row - scrollAt(sent.at))) * (1 - t),
      across: 1 - t,
      lines: transcript.flatMap((it) => (it.kind === "line" && it.role === "sent" ? [it.line] : [])),
    };
  }

  const draw = (it: Item, i: number) => {
    const dim = focus && it.role === undefined ? focus.dim : 0;
    const dimmed: React.CSSProperties | undefined =
      dim > 0.001 ? { opacity: 1 - 0.66 * dim, filter: `blur(${(dim * 1.1).toFixed(2)}px)` } : undefined;
    if (it.kind === "line") {
      const style = it.role === "sent" && riser ? { opacity: 0 } : dimmed;
      return style ? (
        <div key={i} style={style}>
          <TermLine l={it.line} height={lineHeight} />
        </div>
      ) : (
        <TermLine key={i} l={it.line} height={lineHeight} />
      );
    }
    const lit = it.role === "input" ? glow : 0;
    return (
      <div
        key={i}
        style={{
          position: "relative",
          height: (it.lines.length + 2) * lineHeight,
          width: it.cols ? `${it.cols}ch` : "100%",
          boxSizing: "border-box",
          border: `1.5px solid ${lit > 0 ? mixHex(it.color, brand.aqua, Math.min(1, lit)) : it.color}`,
          borderRadius: 8,
          padding: `${lineHeight / 2}px 1ch`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          boxShadow: lit > 0 ? `0 0 ${(26 * lit).toFixed(1)}px ${AQUA(0.5 * lit)}, inset 0 0 ${(16 * lit).toFixed(1)}px ${AQUA(0.16 * lit)}` : undefined,
          ...dimmed,
        }}
      >
        {it.lines.map((l, k) => (
          <TermLine key={k} l={l} height={lineHeight} />
        ))}
        {focus && it.role === "input" ? <Pulse focus={focus} lineHeight={lineHeight} /> : null}
      </div>
    );
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: claude.bg,
        color: claude.fg,
        fontFamily: fonts.mono,
        fontSize,
        overflow: "hidden",
        fontVariantLigatures: "none",
      }}
    >
      <div style={{ position: "absolute", left: padX, right: padX, top: 0, overflow: "hidden", ...(input.length ? { height: padY + inputTop * lineHeight } : { bottom: 0 }) }}>
        <div style={{ translate: `0 ${(padY - scroll * lineHeight).toFixed(2)}px` }}>{transcript.map(draw)}</div>
      </div>
      {input.length ? <div style={{ position: "absolute", left: padX, right: padX, top: padY + inputTop * lineHeight }}>{input.map(draw)}</div> : null}
      {riser ? (
        <div
          style={{
            position: "absolute",
            left: padX,
            right: padX,
            top: padY + riser.row * lineHeight,
            translate: `calc((1ch + 1.5px) * ${riser.across.toFixed(3)}) 0`,
          }}
        >
          {riser.lines.map((l, i) => (
            <TermLine key={i} l={l} height={lineHeight} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

/** The transcript, and the live input box with the rows under it, which stay at the bottom of the window. */
const split = (items: Item[]) => {
  const k = items.findIndex((it) => it.role === "input");
  return k < 0 ? { transcript: items, input: [] as Item[] } : { transcript: items.slice(0, k), input: items.slice(k) };
};

/** Mixes two #RRGGBB colours. */
const mixHex = (a: string, b: string, t: number) => {
  const channel = (hex: string, k: number) => parseInt(hex.slice(1 + k * 2, 3 + k * 2), 16);
  const out = [0, 1, 2].map((k) => Math.round(mix(channel(a, k), channel(b, k), t)));
  return `rgb(${out.join(",")})`;
};
