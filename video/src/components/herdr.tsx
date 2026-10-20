/**
 * herdr-web-ui on the phone, rebuilt from the screenshots in docs/ and from its source at the pinned tag: the
 * header with the Chat and Terminal toggle, the tab row, the light chat with its composer, the card an agent's
 * approval becomes, and the dark terminal with its key row.
 */
import React from "react";
import { fonts, herdrDark, herdrLight } from "../theme";
import { ease, progress, streamedCount } from "../lib/anim";

export const HEADER_TOP = 104;

export const ClaudeMark: React.FC<{ size: number; bg?: string; fg?: string; radius?: number }> = ({
  size,
  bg = herdrLight.claude,
  fg = "#FFF",
  radius = 0.24,
}) => (
  <svg width={size} height={size} viewBox="0 0 20 20">
    <rect width={20} height={20} rx={20 * radius} fill={bg} />
    <g transform="translate(10 10)">
      {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((a, i) => (
        <rect key={a} x={-0.8} y={-6.8 + (i % 3) * 0.5} width={1.6} height={5.6 - (i % 3) * 0.5} rx={0.8} fill={fg} transform={`rotate(${a})`} />
      ))}
    </g>
  </svg>
);

export const CodexMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 20 20">
    <rect width={20} height={20} rx={5} fill="#101012" />
    <path d="M5.5 7.2 8.6 10l-3.1 2.8" stroke="#FFF" strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.4 13h4.2" stroke="#FFF" strokeWidth={1.7} strokeLinecap="round" />
  </svg>
);

export const CursorMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 20 20">
    <rect width={20} height={20} rx={5} fill="#17181C" />
    <path d="M10 3.6 15.6 6.8v6.4L10 16.4 4.4 13.2V6.8Z" fill="none" stroke="#E8E8EA" strokeWidth={1.2} />
    <path d="M10 3.6v6.4l5.6 3.2M10 10l-5.6 3.2" stroke="#E8E8EA" strokeWidth={0.9} opacity={0.55} />
    <path d="M10 10 15.6 6.8 10 3.6Z" fill="#E8E8EA" />
  </svg>
);

const Burger: React.FC<{ color: string }> = ({ color }) => (
  <svg width={18} height={14} viewBox="0 0 18 14">
    {[1, 7, 13].map((y) => (
      <rect key={y} x={0} y={y - 0.9} width={18} height={1.8} rx={0.9} fill={color} />
    ))}
  </svg>
);

const Dots: React.FC<{ color: string; size?: number }> = ({ color, size = 4 }) => (
  <svg width={size * 5} height={size} viewBox="0 0 20 4">
    {[2, 10, 18].map((x) => (
      <circle key={x} cx={x} cy={2} r={1.9} fill={color} />
    ))}
  </svg>
);

const ChatIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={17} height={16} viewBox="0 0 17 16">
    <path d="M2.5 1.5h12a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H7l-3.8 3v-3H2.5A1.5 1.5 0 0 1 1 10.5V3a1.5 1.5 0 0 1 1.5-1.5Z" stroke={color} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
  </svg>
);

const TermIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width={17} height={16} viewBox="0 0 17 16">
    <rect x={1} y={1.5} width={15} height={13} rx={2.5} stroke={color} strokeWidth={1.5} fill="none" />
    <path d="M4.6 5.6 7 8l-2.4 2.4M8.6 10.6h3.4" stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const HerdrHeader: React.FC<{
  theme: "light" | "dark";
  title: string;
  view: "chat" | "terminal";
  mark?: React.ReactNode;
}> = ({ theme, title, view, mark }) => {
  const light = theme === "light";
  const ink = light ? herdrLight.ink : "#F2EDE6";
  const frame = light ? herdrLight.toggle : herdrDark.toggle;
  const on = light ? herdrLight.toggleOn : herdrDark.toggleOn;
  const accent = light ? herdrLight.accent : herdrDark.accent;
  const idle = light ? herdrLight.muted : herdrDark.muted;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: HEADER_TOP,
        height: 48,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px 0 18px",
        background: light ? herdrLight.chrome : herdrDark.bg,
        color: ink,
      }}
    >
      <Burger color={ink} />
      {mark}
      <span
        style={{
          fontSize: 15.5,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </span>
      <span
        style={{
          display: "flex",
          padding: 3,
          gap: 2,
          borderRadius: 9,
          background: frame,
          border: `1px solid ${light ? herdrLight.line : herdrDark.line}`,
        }}
      >
        <span style={{ width: 38, height: 28, borderRadius: 7, display: "grid", placeItems: "center", background: view === "chat" ? on : "transparent" }}>
          <ChatIcon color={view === "chat" ? accent : idle} />
        </span>
        <span style={{ width: 38, height: 28, borderRadius: 7, display: "grid", placeItems: "center", background: view === "terminal" ? on : "transparent" }}>
          <TermIcon color={view === "terminal" ? accent : idle} />
        </span>
      </span>
      <Dots color={ink} />
    </div>
  );
};

export type Tab = { label: string; live?: boolean };

export const HerdrTabs: React.FC<{ theme: "light" | "dark"; tabs: Tab[]; active: number; underline?: { x: number; w: number } }> = ({
  theme,
  tabs,
  active,
  underline,
}) => {
  const light = theme === "light";
  const ink = light ? herdrLight.ink : "#F2EDE6";
  const muted = light ? herdrLight.muted : herdrDark.muted;
  const accent = light ? herdrLight.accent : herdrDark.accent;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: HEADER_TOP + 48,
        height: 42,
        display: "flex",
        alignItems: "center",
        padding: "0 6px",
        background: light ? herdrLight.chrome : herdrDark.bg,
        borderBottom: `1px solid ${light ? herdrLight.line : herdrDark.line}`,
        fontSize: 14.5,
      }}
    >
      {tabs.map((t, i) => (
        <span
          key={t.label}
          style={{
            position: "relative",
            height: "100%",
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: tabs.length > 3 ? "0 11px" : "0 14px",
            whiteSpace: "nowrap",
            flexShrink: 0,
            color: i === active ? ink : muted,
            fontWeight: i === active ? 600 : 500,
          }}
        >
          {t.live !== undefined ? (
            <span style={{ width: 7, height: 7, borderRadius: 4, background: t.live ? (light ? herdrLight.live : "#7DBE55") : muted }} />
          ) : null}
          {t.label}
          {i === active ? <Dots color={muted} size={3.4} /> : null}
          {i === active && !underline ? (
            <span style={{ position: "absolute", left: 4, right: 4, bottom: -1, height: 2.5, borderRadius: 2, background: accent }} />
          ) : null}
        </span>
      ))}
      <span style={{ padding: "0 12px", color: muted, fontSize: 20, fontWeight: 300 }}>+</span>
      {underline ? (
        <span style={{ position: "absolute", left: underline.x, width: underline.w, bottom: -1, height: 2.5, borderRadius: 2, background: accent }} />
      ) : null}
    </div>
  );
};

/** Text with `code` chips and **bold**, the way herdr renders an agent's markdown. */
export const Markdown: React.FC<{ text: string; shown?: number; codeBg?: string }> = ({ text, shown = Infinity, codeBg = herdrLight.bubble }) => {
  const parts: React.ReactNode[] = [];
  let budget = shown;
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  const push = (t: string, kind: "plain" | "code" | "bold") => {
    if (budget <= 0) return;
    const visible = t.slice(0, Math.max(0, budget));
    budget -= t.length;
    if (kind === "code")
      parts.push(
        <code
          key={key++}
          style={{
            fontFamily: fonts.mono,
            fontSize: "0.86em",
            padding: "1px 5px",
            borderRadius: 5,
            background: codeBg,
            border: `1px solid ${herdrLight.line}`,
          }}
        >
          {visible}
        </code>,
      );
    else if (kind === "bold") parts.push(<strong key={key++} style={{ fontWeight: 600 }}>{visible}</strong>);
    else parts.push(<React.Fragment key={key++}>{visible}</React.Fragment>);
  };
  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index), "plain");
    const token = m[0];
    if (token.startsWith("`")) push(token.slice(1, -1), "code");
    else push(token.slice(2, -2), "bold");
    last = m.index + token.length;
  }
  push(text.slice(last), "plain");
  return <>{parts}</>;
};

export const plainLength = (text: string) => text.replace(/`|\*\*/g, "").length;

/**
 * `at` is when an item starts arriving. `reveal` is for one that flies in from outside the phone: its room is
 * made from `at`, and it shows from `reveal`, when it lands. An assistant item with `duration: 0` arrives
 * whole instead of streaming.
 */
export type ChatItem =
  | { kind: "user"; text: string; time: string; at?: number; reveal?: number }
  | { kind: "assistant"; text: string; at?: number; duration?: number; reveal?: number }
  | { kind: "tools"; items: { verb: string; target: string }[]; at?: number; step?: number; reveal?: number }
  | { kind: "meta"; time: string; at?: number };

const ToolRow: React.FC<{ verb: string; target: string; opacity: number }> = ({ verb, target, opacity }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      opacity,
      translate: `0 ${(1 - opacity) * 6}px`,
      fontSize: 13,
      color: herdrLight.muted,
      padding: "5px 10px",
      borderRadius: 9,
      border: `1px solid ${herdrLight.line}`,
      background: "rgba(250,248,243,0.6)",
      width: "fit-content",
      maxWidth: "100%",
    }}
  >
    <svg width={12} height={12} viewBox="0 0 12 12">
      <circle cx={6} cy={6} r={5} fill="none" stroke={herdrLight.live} strokeWidth={1.3} />
      <path d="M3.6 6.2 5.2 7.7 8.4 4.4" stroke={herdrLight.live} strokeWidth={1.3} fill="none" strokeLinecap="round" />
    </svg>
    <span style={{ fontWeight: 600, color: herdrLight.body }}>{verb}</span>
    <span style={{ fontFamily: fonts.mono, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{target}</span>
  </div>
);

const CopyIcon: React.FC = () => (
  <svg width={12} height={12} viewBox="0 0 12 12">
    <rect x={3.5} y={3.5} width={7.5} height={7.5} rx={1.5} stroke={herdrLight.muted} strokeWidth={1.1} fill="none" />
    <path d="M8 2V1.8A1 1 0 0 0 7 .8H1.8a1 1 0 0 0-1 1V7a1 1 0 0 0 1 1H2" stroke={herdrLight.muted} strokeWidth={1.1} fill="none" />
  </svg>
);

/**
 * Something arriving in the chat: it grows from nothing, so what is above it is pushed up the way a chat
 * makes room, instead of jumping. `grow` runs from 0 to 1; `gap` is the space it keeps above itself.
 */
const Arrival: React.FC<{ grow: number; gap: number; children: React.ReactNode }> = ({ grow, gap, children }) =>
  grow >= 1 ? (
    <div style={{ marginTop: gap }}>{children}</div>
  ) : (
    <div style={{ display: "grid", gridTemplateRows: `${grow}fr`, marginTop: gap * grow }}>
      <div style={{ minHeight: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );

const arrivalAt = (frame: number, at: number | undefined, length = 9) => (at === undefined ? 1 : progress(frame, at, length, ease.out));

/** The amber ring herdr's accent draws around a message the scene points at; past 1 it flares. */
const ringOf = (glow: number): React.CSSProperties =>
  glow
    ? {
        boxShadow: `0 0 0 ${(2 * Math.min(glow, 1.4)).toFixed(2)}px rgba(210,158,81,${Math.min(1, 0.9 * glow).toFixed(3)}), 0 0 ${(26 * glow).toFixed(1)}px rgba(232,170,80,${Math.min(0.8, 0.45 * glow).toFixed(3)})`,
      }
    : {};

/** `glows` rings items by index, as `highlight` rings one. */
export const ChatMessages: React.FC<{ items: ChatItem[]; frame: number; highlight?: { index: number; amount: number }; glows?: number[] }> = ({
  items,
  frame,
  highlight,
  glows,
}) => {
  const shown = items.map((it, i) => ({ it, i })).filter(({ it }) => it.at === undefined || frame >= it.at);
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: "14px 16px 18px" }}>
      {shown.map(({ it, i }, n) => {
        const ring = ringOf(Math.max(highlight && highlight.index === i ? highlight.amount : 0, glows?.[i] ?? 0));
        const gap = n === 0 ? 0 : 14;
        const reveal = it.kind === "meta" ? undefined : it.reveal;
        const flown = reveal !== undefined;
        const landed = reveal === undefined ? 1 : progress(frame, reveal, 5);
        const hidden = landed <= 0;
        switch (it.kind) {
          case "user": {
            const enter = arrivalAt(frame, it.at, flown ? 10 : 9);
            return (
              <Arrival key={i} grow={enter} gap={gap}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 6,
                    opacity: flown ? landed : Math.min(1, enter * 1.4),
                    translate: flown ? undefined : `0 ${(1 - enter) * 14}px`,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "84%",
                      padding: "11px 16px",
                      borderRadius: 18,
                      background: herdrLight.bubble,
                      border: `1px solid ${herdrLight.line}`,
                      fontSize: 15.5,
                      lineHeight: 1.4,
                      color: herdrLight.ink,
                      ...ring,
                    }}
                  >
                    <Markdown text={it.text} />
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11.5, color: herdrLight.muted }}>
                    {it.time}
                    <CopyIcon />
                  </div>
                </div>
              </Arrival>
            );
          }
          case "assistant": {
            const enter = arrivalAt(frame, it.at, flown ? 10 : 7);
            const total = plainLength(it.text);
            const count = it.at === undefined || it.duration === 0 ? total : streamedCount(it.text.replace(/`|\*\*/g, ""), frame, it.at, it.duration ?? 20);
            return (
              <Arrival key={i} grow={enter} gap={gap}>
                <div
                  style={{
                    fontSize: 15.5,
                    lineHeight: 1.55,
                    color: herdrLight.body,
                    borderRadius: 12,
                    padding: "6px 8px",
                    margin: "-6px -8px",
                    opacity: flown ? landed : Math.min(1, enter * 1.4),
                    ...ring,
                  }}
                >
                  <Markdown text={it.text} shown={count} />
                </div>
              </Arrival>
            );
          }
          case "tools": {
            const top = it.at !== undefined && frame < it.at + 10 ? gap * arrivalAt(frame, it.at, flown ? 10 : 9) : gap;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  opacity: hidden ? 0 : landed,
                  borderRadius: 12,
                  ...(flown
                    ? { marginTop: top - 6, marginLeft: -8, marginRight: -8, marginBottom: -6, padding: "6px 8px", ...ring }
                    : { marginTop: top }),
                }}
              >
                {it.items.map((t, k) => {
                  const at = (it.at ?? -100) + k * (it.step ?? 6);
                  if (frame < at) return null;
                  const enter = arrivalAt(frame, at, flown ? 10 : 7);
                  return (
                    <Arrival key={t.verb + t.target} grow={enter} gap={k === 0 ? 0 : 6}>
                      <ToolRow verb={t.verb} target={t.target} opacity={flown ? 1 : Math.min(1, enter * 1.3)} />
                    </Arrival>
                  );
                })}
              </div>
            );
          }
          case "meta":
            return (
              <div key={i} style={{ marginTop: gap, display: "flex", gap: 12, alignItems: "center", fontSize: 11.5, color: herdrLight.muted, fontWeight: 600 }}>
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <CopyIcon /> MD
                </span>
                <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <CopyIcon /> TXT
                </span>
                <span style={{ fontWeight: 400 }}>{it.time}</span>
              </div>
            );
        }
      })}
    </div>
  );
};

/** An agent's approval as herdr-web-ui's prompt card draws it (PromptCard.tsx and .css), in the light theme. */
export type Approval = { title: string; question: string; body: string; options: string[] };

const card = {
  border: "#C5BAA8",
  elevated: "#F2EEE6",
  hover: "#E8E2D6",
  blocked: "#A82323",
  strong: "#16120D",
};

export const PromptCard: React.FC<{ approval: Approval; picked?: number; press?: number; busy?: boolean }> = ({
  approval,
  picked,
  press = 0,
  busy = false,
}) => (
  <section
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 8,
      padding: 12,
      border: `1px solid ${card.border}`,
      borderRadius: 16,
      background: card.elevated,
      boxShadow: "0 8px 28px rgba(60,40,20,0.12)",
    }}
  >
    <div style={{ color: card.blocked, fontSize: 13, fontWeight: 600 }}>{approval.title}</div>
    <div style={{ color: card.strong, fontSize: 14, lineHeight: 1.5 }}>{approval.question}</div>
    <div
      style={{
        padding: "8px 12px",
        border: `1px solid ${herdrLight.line}`,
        borderRadius: 8,
        background: herdrLight.bg,
        color: herdrLight.body,
        fontFamily: fonts.mono,
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
      }}
    >
      {approval.body}
    </div>
    <div style={{ display: "flex", flexDirection: "column" }}>
      {approval.options.map((label, i) => {
        const on = picked === i ? press : 0;
        return (
          <div
            key={label}
            style={{
              minHeight: 40,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${on ? `rgba(140,80,0,${0.9 * on})` : "transparent"}`,
              background: on ? `rgba(232,226,214,${on})` : "transparent",
              color: card.strong,
              fontSize: 13,
              lineHeight: 1.5,
              opacity: busy ? 0.55 : 1,
              scale: String(1 - on * 0.015),
            }}
          >
            <span
              style={{
                flex: "none",
                minWidth: 20,
                border: `1px solid ${on ? herdrLight.accent : card.border}`,
                borderRadius: 6,
                color: on ? herdrLight.accent : herdrLight.muted,
                fontFamily: fonts.mono,
                fontSize: 11,
                textAlign: "center",
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontWeight: 500 }}>{label}</span>
          </div>
        );
      })}
    </div>
  </section>
);

/** A touch on the glass, the way a screen recording shows one: a soft disc that presses in and lets go. */
export const Touch: React.FC<{ x: number; y: number; frame: number; at: number }> = ({ x, y, frame, at }) => {
  const t = frame - at;
  if (t < -4 || t > 16) return null;
  const down = progress(frame, at - 4, 4, ease.out);
  const up = progress(frame, at + 4, 12, ease.out);
  return (
    <div
      style={{
        position: "absolute",
        left: x - 26,
        top: y - 26,
        width: 52,
        height: 52,
        borderRadius: 26,
        background: "rgba(40,32,24,0.22)",
        border: "2px solid rgba(255,255,255,0.75)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
        opacity: down * (1 - up),
        scale: String((1.25 - 0.25 * down) * (1 + 0.5 * up)),
        zIndex: 40,
        pointerEvents: "none",
      }}
    />
  );
};

/** Over an empty field, iOS puts the caret at the start of the placeholder without moving it. */
const ComposerCaret: React.FC<{ placeholder?: boolean }> = ({ placeholder = false }) => (
  <span
    style={{
      display: "inline-block",
      width: 2,
      height: 19,
      marginLeft: placeholder ? -1 : 1,
      marginRight: placeholder ? -1 : 0,
      verticalAlign: "-3px",
      background: herdrLight.accent,
    }}
  />
);

export const Composer: React.FC<{ text: string; caret: boolean; agent?: string; model?: string; sendPressed?: number }> = ({
  text,
  caret,
  agent = "Claude",
  model = "Opus 5.5",
  sendPressed = 0,
}) => (
  <div
    style={{
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 26,
      borderRadius: 22,
      background: herdrLight.composer,
      border: `1px solid ${herdrLight.line}`,
      boxShadow: "0 6px 24px rgba(60,40,20,0.10)",
      padding: "14px 14px 12px 16px",
      zIndex: 10,
    }}
  >
    <div style={{ position: "absolute", top: -9, left: "50%", marginLeft: -18, width: 36, height: 4, borderRadius: 2, background: "#CFC6B7" }} />
    <div style={{ fontSize: 15.5, lineHeight: 1.4, minHeight: 44, color: text ? herdrLight.ink : "#9A8F80" }}>
      {caret && !text ? <ComposerCaret placeholder /> : null}
      {text || `Message ${agent}…`}
      {caret && text ? <ComposerCaret /> : null}
    </div>
    <div style={{ display: "flex", alignItems: "center", marginTop: 6 }}>
      <span style={{ fontSize: 24, fontWeight: 300, color: herdrLight.muted, lineHeight: 1 }}>+</span>
      <span
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 12px",
          borderRadius: 16,
          background: herdrLight.pill,
          fontSize: 13,
          color: herdrLight.body,
        }}
      >
        {agent === "Codex" ? <CodexMark size={14} /> : <ClaudeMark size={14} radius={0.2} />}
        <span style={{ fontWeight: 500 }}>{model}</span>
        <span style={{ color: herdrLight.muted }}>·</span>
        <span style={{ color: herdrLight.muted }}>Medium</span>
      </span>
      <span
        style={{
          marginLeft: 10,
          width: 34,
          height: 34,
          borderRadius: 17,
          display: "grid",
          placeItems: "center",
          background: herdrLight.send,
          scale: String(1 - sendPressed * 0.12),
          boxShadow: sendPressed ? `0 0 0 ${8 * sendPressed}px rgba(210,158,81,${0.25 * sendPressed})` : undefined,
        }}
      >
        <svg width={14} height={15} viewBox="0 0 14 15">
          <path d="M7 13.5V2M2.2 6.6 7 1.8l4.8 4.8" stroke={herdrLight.sendIcon} strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  </div>
);

export const KEYS = ["⌨", "Esc", "Tab", "^C", "Ctrl", "Alt", "Shift", "Enter", "^"];

export const KeyRow: React.FC<{ pressed?: string; amount?: number }> = ({ pressed, amount = 0 }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 34,
      display: "flex",
      gap: 5,
      padding: "8px 8px",
      background: herdrDark.bg,
      borderTop: `1px solid ${herdrDark.line}`,
    }}
  >
    {KEYS.map((k) => {
      const on = pressed === k ? amount : 0;
      return (
        <span
          key={k}
          style={{
            flex: k.length > 3 ? 1.35 : 1,
            height: 36,
            display: "grid",
            placeItems: "center",
            borderRadius: 7,
            border: `1px solid ${on ? herdrDark.accent : herdrDark.keyLine}`,
            background: on ? `rgba(240,168,48,${0.28 * on})` : "#1D1A16",
            color: on ? "#FFE2B0" : herdrDark.key,
            fontFamily: fonts.mono,
            fontSize: 12,
            scale: String(1 - on * 0.06),
          }}
        >
          {k === "⌨" ? (
            <svg width={18} height={12} viewBox="0 0 18 12">
              <rect x={0.7} y={0.7} width={16.6} height={10.6} rx={2} stroke={herdrDark.key} strokeWidth={1.1} fill="none" />
              {[3.5, 6.5, 9.5, 12.5].map((x) => (
                <rect key={x} x={x} y={3.4} width={1.6} height={1.6} rx={0.4} fill={herdrDark.key} />
              ))}
              <rect x={5} y={7.2} width={8} height={1.6} rx={0.6} fill={herdrDark.key} />
            </svg>
          ) : (
            k
          )}
        </span>
      );
    })}
  </div>
);
