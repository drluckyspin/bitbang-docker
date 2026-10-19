/**
 * The story's captions. Each word blurs and rises in on a spring, and the line lifts away before it ends, so
 * the video reads with the sound off. A "\n" in the text starts a new line.
 */
import React from "react";
import { Interactive, useCurrentFrame, useVideoConfig, type InteractivitySchema } from "remotion";
import { fonts, stage } from "../theme";
import { progress, springAt } from "../lib/anim";

type CaptionProps = {
  readonly text: string;
  readonly exitAt: number;
  readonly fontSize: number;
  readonly color: string;
  readonly align?: "center" | "left";
  readonly style?: React.CSSProperties;
};

const CaptionText: React.FC<CaptionProps> = ({ text, exitAt, fontSize, color, align = "center", style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exit = progress(frame, exitAt, 14);
  let index = 0;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 64,
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        fontFamily: fonts.display,
        fontWeight: 900,
        fontSize,
        lineHeight: 1,
        letterSpacing: "-0.055em",
        color,
        opacity: 1 - exit,
        translate: `0 ${-exit * 26}px`,
        filter: exit > 0 ? `blur(${exit * 10}px)` : undefined,
        textShadow: "0 6px 48px rgba(0,0,0,0.7)",
        ...style,
      }}
    >
      {text.split("\n").map((row, r) => (
        <div key={r} style={{ display: "flex", gap: "0.26em", whiteSpace: "pre" }}>
          {row.split(" ").map((word, w) => {
            const p = springAt(frame, fps, index++ * 3, { damping: 20, stiffness: 120 });
            return (
              <span
                key={w}
                style={{
                  display: "inline-block",
                  opacity: Math.min(1, p * 1.3),
                  translate: `0 ${(1 - p) * 34}px`,
                  filter: p < 0.98 ? `blur(${(1 - p) * 14}px)` : undefined,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const captionSchema = {
  text: { type: "text-content", default: "You're in the flow.", description: "Text" },
  exitAt: { type: "number", default: 140, min: 0, step: 1, description: "Exit at frame", keyframable: false, hiddenFromList: false },
  fontSize: { type: "number", default: 104, min: 20, max: 240, step: 1, description: "Font size", hiddenFromList: false },
  color: { type: "color", default: stage.ink, description: "Color" },
} as const satisfies InteractivitySchema;

export const Caption = Interactive.create({
  Component: CaptionText,
  componentName: "<Caption>",
  schema: captionSchema,
});
