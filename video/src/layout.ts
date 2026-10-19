/**
 * Framing shared across scene boundaries, so a cut lands with the phone and the laptop exactly where the
 * previous scene left them. A 9:16 version replaces this file and keeps the scenes.
 */
import type { Cam } from "./lib/anim";
import { PHONE, SCREEN, type PhonePose } from "./components/Phone";
import { WS } from "./components/Workspace";

export const FRAME = { w: 1920, h: 1080 };

/** The laptop's camera when the pairing scene settles, and where the phone rests for the chat. */
export const PAIR_CAMERA: Cam = { x: 1270, y: 600, s: 0.76 };
export const HERO_PHONE: PhonePose = { x: 1400, y: 612, s: 0.96, r: 0 };
/**
 * Close on the phone, for reading: the chat and the composer fill the frame's height, so its text is about
 * 28 px, and still about 12 px where a README shows the video 830 px wide.
 */
export const ZOOM_PHONE: PhonePose = { x: 1330, y: 320, s: 1.8, r: 0 };

/** Where the laptop's display content lives in world space: the laptop is centred at (960, 632). */
export const DISPLAY_ORIGIN = { x: 376, y: 248 };

export const toScreen = (cam: Cam, wx: number, wy: number): [number, number] => [
  (wx - cam.x) * cam.s + FRAME.w / 2,
  (wy - cam.y) * cam.s + FRAME.h / 2,
];

/** A point on the phone's screen, in points from its top left, where the frame shows it. */
export const onPhone = (pose: PhonePose, px: number, py: number): [number, number] => {
  const rim = (PHONE.w - SCREEN.w) / 2;
  return [pose.x + (rim + px - PHONE.w / 2) * pose.s, pose.y + (rim + py - PHONE.h / 2) * pose.s];
};

/** The phone pose that shows screen point (px, py) at frame point (fx, fy), at zoom s. */
export const phoneShowing = (px: number, py: number, fx: number, fy: number, s: number): PhonePose => {
  const rim = (PHONE.w - SCREEN.w) / 2;
  return { x: fx - (rim + px - PHONE.w / 2) * s, y: fy - (rim + py - PHONE.h / 2) * s, s, r: 0 };
};

/** Where the montage ends, close on the phone's header and tabs; the local scene pulls back from here. */
export const MONTAGE_PHONE = phoneShowing(196.5, 412, 1380, 540, 1.75);

/** The two ends of the link: the container on the laptop's screen, and the phone's left edge. */
export const containerOnScreen = (cam: Cam) => toScreen(cam, DISPLAY_ORIGIN.x + WS.settled.x, DISPLAY_ORIGIN.y + WS.settled.y - 40);
export const phoneLinkPoint = (pose: PhonePose): [number, number] => [pose.x - (PHONE.w / 2) * pose.s - 6, pose.y - PHONE.h * 0.18 * pose.s];
