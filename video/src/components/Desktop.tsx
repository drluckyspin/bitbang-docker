/**
 * What the laptop's display shows: the macOS menu bar, the wallpaper, and the terminal window that Claude
 * Code runs in. The window's frame can animate from maximised to a smaller window on the desktop.
 */
import React from "react";
import { claude } from "../theme";
import { laptopScript } from "../data/session";
import { ClaudeCode, type Focus } from "./ClaudeCode";
import { LAPTOP, MacWindow, MenuBar } from "./Laptop";

export const MENU_H = 28;
export const TERM = { fontSize: 16, lineHeight: 24, cols: 112, title: 34 };

export type Rect = { x: number; y: number; w: number; h: number };

export const MAXIMISED: Rect = { x: 0, y: MENU_H, w: LAPTOP.displayW, h: LAPTOP.displayH - MENU_H };

export const Wallpaper: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background:
        "radial-gradient(80% 90% at 20% 15%, #2B2F45 0%, rgba(43,47,69,0) 60%), radial-gradient(70% 80% at 85% 90%, #3A2A2E 0%, rgba(58,42,46,0) 60%), linear-gradient(160deg, #15171F 0%, #0E0F14 100%)",
    }}
  />
);

export const TerminalWindow: React.FC<{
  rect: Rect;
  title?: string;
  radius?: number;
  fontSize?: number;
  lineHeight?: number;
  cols?: number;
  focus?: Focus;
}> = ({ rect, title = "acme-api — claude — 116×26", radius = 0, fontSize = TERM.fontSize, lineHeight = TERM.lineHeight, cols = TERM.cols, focus }) => (
  <MacWindow
    title={title}
    style={{
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      borderRadius: radius,
      background: claude.bg,
    }}
  >
    <ClaudeCode script={laptopScript} cols={cols} fontSize={fontSize} lineHeight={lineHeight} height={rect.h - TERM.title} focus={focus} />
  </MacWindow>
);

export const DesktopFrame: React.FC<{ children: React.ReactNode; app?: string; time?: string }> = ({ children, app = "Terminal", time = "9:41" }) => (
  <div style={{ position: "absolute", inset: 0 }}>
    <Wallpaper />
    {children}
    <MenuBar app={app} time={`Mon 19 Oct  ${time}`} />
  </div>
);
