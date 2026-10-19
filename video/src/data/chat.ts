/**
 * The laptop session as herdr's chat shows it on the phone, and what happens next on the phone. The session
 * scene flies the history in from the laptop, one item for each part of the transcript.
 */
import type { ChatItem } from "../components/herdr";
import { says, toolSummary } from "./session";

/** How long the chat takes to make room for an item that is flying in. */
export const ROOM = 10;

/** The conversation so far. `land` is the frame each item lands on the phone; without it, they are just there. */
export const historyItems = (land?: readonly number[]): ChatItem[] => {
  const arrives = (k: number) => {
    const at = land?.[k];
    return at === undefined ? {} : { at: at - ROOM, reveal: at };
  };
  return [
    { kind: "user", text: says.prompt, time: "9:36 AM", ...arrives(0) },
    { kind: "assistant", text: says.plan, duration: 0, ...arrives(1) },
    { kind: "tools", items: toolSummary, step: 0, ...arrives(2) },
    { kind: "assistant", text: says.done, duration: 0, ...arrives(3) },
  ];
};

/** Index of the "Done." reply, Claude's last message on the laptop. */
export const DONE_INDEX = 3;

/** The answer typed on the phone, the work it sets off, and Claude's reply. */
export const followUp = (sendAt: number, workAt: number, replyAt: number): ChatItem[] => [
  { kind: "user", text: says.phoneAsk, time: "9:42 AM", at: sendAt },
  {
    kind: "tools",
    at: workAt,
    step: 9,
    items: [
      { verb: "Edited", target: "src/middleware/rate-limit.ts" },
      { verb: "Edited", target: "test/upload.test.ts" },
      { verb: "Ran", target: "npm test -- upload" },
    ],
  },
  { kind: "assistant", text: says.phoneReply, at: replyAt, duration: 30 },
];

/** The whole chat, as later scenes find it. */
export const phoneItems = (sendAt: number, workAt: number, replyAt: number): ChatItem[] => [
  ...historyItems(),
  ...followUp(sendAt, workAt, replyAt),
];
