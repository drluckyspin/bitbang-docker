/**
 * Terminal text: lines of styled spans on a fixed character grid. The symbols a TUI draws (Claude Code's
 * bullets, the result elbow, checkboxes, the spinner star) are SVG, because the dingbat code points fall back
 * to colour emoji in a headless browser.
 */
import React from "react";

export type Icon = "dot" | "elbow" | "box" | "boxDone" | "check" | "warn" | "chevron" | "spark" | "lock";

export type Span = {
  t?: string;
  c?: string;
  b?: boolean;
  st?: boolean;
  bg?: string;
  icon?: Icon;
  /** Opacity of an icon, for a blinking bullet. */
  o?: number;
  /** Rotation of an icon in degrees, for the spinner. */
  r?: number;
  /** A CSS text-shadow, for text the camera is pointing at. */
  glow?: string;
};

/** A line of spans. `bgFrom` starts the background that many cells in, past an indent. */
export type Line = { spans: Span[]; bg?: string; bgFrom?: number };

export const line = (...spans: Array<Span | string>): Line => ({
  spans: spans.map((s) => (typeof s === "string" ? { t: s } : s)),
});

export const span = (t: string, c?: string, extra: Omit<Span, "t" | "c"> = {}): Span => ({ t, c, ...extra });

export const icon = (name: Icon, c?: string, extra: Omit<Span, "icon" | "c"> = {}): Span => ({ icon: name, c, ...extra });

/**
 * A glyph two cells wide: the symbol in the first cell, a space in the second, the way Claude Code writes
 * "⏺ ". The viewBox is 12 by 10, so one cell is 6 units and the box is 1.2em by 1em, a monospace cell's shape.
 */
export const Glyph: React.FC<{ icon: Icon; color?: string; opacity?: number; rotate?: number }> = ({
  icon: name,
  color = "currentColor",
  opacity = 1,
  rotate = 0,
}) => {
  const style: React.CSSProperties = {
    display: "inline-block",
    width: "2ch",
    height: "1em",
    verticalAlign: "-0.2em",
    opacity,
    overflow: "visible",
  };
  const stroke = { stroke: color, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const body = (() => {
    switch (name) {
      case "dot":
        return <circle cx={3} cy={5.1} r={2.15} fill={color} />;
      case "elbow":
        return <path d="M2.4 -1.2V5.4H5.8" {...stroke} strokeLinecap="butt" strokeWidth={0.62} />;
      case "box":
      case "boxDone":
        return (
          <>
            <rect x={0.7} y={2.2} width={4.9} height={4.9} rx={0.7} {...stroke} strokeWidth={0.6} />
            {name === "boxDone" ? <path d="M1.8 4.7 2.8 5.8 4.6 3.4" {...stroke} strokeWidth={0.7} /> : null}
          </>
        );
      case "check":
        return <path d="M0.9 5.1 2.5 6.8 5.5 2.6" {...stroke} strokeWidth={0.95} />;
      case "warn":
        return <path d="M3 1.8 5.8 7.2H0.2Z" fill={color} />;
      case "chevron":
        return <path d="M1.4 2.1 4.4 4.9 1.4 7.7" {...stroke} strokeWidth={0.95} />;
      case "lock":
        return (
          <>
            <rect x={0.7} y={4} width={4.6} height={3.6} rx={0.6} fill={color} />
            <path d="M1.8 4.1V3a1.2 1.2 0 0 1 2.4 0v1.1" {...stroke} strokeWidth={0.7} />
          </>
        );
      case "spark":
        return (
          <g transform={`translate(3 4.9) rotate(${rotate})`}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <rect key={i} x={-0.38} y={-2.75} width={0.76} height={2.5} rx={0.38} fill={color} transform={`rotate(${i * 60})`} />
            ))}
          </g>
        );
    }
  })();
  return (
    <svg style={style} viewBox="0 0 12 10" aria-hidden>
      {body}
    </svg>
  );
};

export const TermLine: React.FC<{ l: Line; height: number }> = ({ l, height }) => (
  <div
    style={{
      height,
      lineHeight: `${height}px`,
      whiteSpace: "pre",
      fontVariantLigatures: "none",
      background: l.bg && l.bgFrom ? `linear-gradient(90deg, transparent ${l.bgFrom}ch, ${l.bg} ${l.bgFrom}ch)` : l.bg,
    }}
  >
    {l.spans.map((s, i) =>
      s.icon ? (
        <Glyph key={i} icon={s.icon} color={s.c} opacity={s.o} rotate={s.r} />
      ) : (
        <span
          key={i}
          style={{
            color: s.c,
            fontWeight: s.b ? 700 : undefined,
            textDecoration: s.st ? "line-through" : undefined,
            background: s.bg,
            textShadow: s.glow,
          }}
        >
          {s.t}
        </span>
      ),
    )}
  </div>
);

const syntax = {
  keyword: "#FF7B72",
  string: "#A5D6FF",
  fn: "#D2A8FF",
  number: "#79C0FF",
  type: "#FFA657",
  comment: "#8B949E",
  plain: "#E6EDF3",
};

const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "const",
  "let",
  "function",
  "return",
  "if",
  "new",
  "type",
  "await",
  "async",
  "true",
  "false",
]);

/** A tiny TypeScript highlighter: enough for the handful of lines the video shows. */
export const highlight = (code: string): Span[] => {
  const out: Span[] = [];
  const re = /(\/\/.*$)|("[^"]*"|'[^']*'|`[^`]*`)|(\b\d[\d_]*\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$\d"'`]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const [token] = m;
    if (m[1]) out.push({ t: token, c: syntax.comment });
    else if (m[2]) out.push({ t: token, c: syntax.string });
    else if (m[3]) out.push({ t: token, c: syntax.number });
    else if (m[4]) {
      const next = code[m.index + token.length];
      const color = KEYWORDS.has(token)
        ? syntax.keyword
        : /^[A-Z]/.test(token)
          ? syntax.type
          : next === "("
            ? syntax.fn
            : syntax.plain;
      out.push({ t: token, c: color });
    } else out.push({ t: token, c: syntax.plain });
  }
  return out;
};
