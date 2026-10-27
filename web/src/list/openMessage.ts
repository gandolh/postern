// Brief 22: with conversation view off a row is one message, and opening it
// opens the whole conversation, as Gmail does, with that message open and
// scrolled into view. The conversation view itself is unchanged: this waits
// for it to mount and drives it from outside through its controller
// (conversation/registry.ts), as brief 14's keys do.
//
// A reply in progress in that conversation opens as the inline composer and
// takes focus a moment later, which scrolls to the bottom. For a short while
// after opening, until the reader scrolls, types or clicks, focus moving
// inside the page brings the message back into view.

import type { Id } from "@postern/jmap";
import { getActiveConversation, messageCardId, subscribeActiveConversation, type ConversationController } from "../conversation/registry";

/** Stop waiting for the conversation after this long (it failed to load, or the reader went elsewhere). */
const WAIT_MS = 15_000;
/** Frames to wait for the message's card to render open. */
const FRAMES = 30;
/** How long the message is kept in view against focus moves (the inline reply draft's). */
const HOLD_MS = 3000;

let pending: (() => void) | null = null;
let holding: (() => void) | null = null;

/**
 * Once the conversation `conversationId` is on screen (now, or when it has
 * loaded), open the message `emailId` in it and scroll it into view. A later
 * call replaces an earlier one still waiting.
 */
export function revealMessageOnOpen(conversationId: Id, emailId: Id): void {
  pending?.();
  holding?.();
  let done = false;
  const finish = () => {
    done = true;
    clearTimeout(timer);
    unsubscribe();
    if (pending === finish) pending = null;
  };
  const attempt = () => {
    const controller = getActiveConversation();
    if (done || !controller || controller.conversationId !== conversationId) return;
    finish();
    reveal(controller, emailId);
  };
  const timer = setTimeout(finish, WAIT_MS);
  const unsubscribe = subscribeActiveConversation(attempt);
  pending = finish;
  attempt();
}

/** For tests: stop waiting and holding. */
export function cancelRevealMessage(): void {
  pending?.();
  holding?.();
}

function reveal(controller: ConversationController, emailId: Id): void {
  // Not a card of this conversation (a reply draft shows as the inline composer instead).
  if (!controller.messageIds().includes(emailId)) return;
  const card = document.getElementById(messageCardId(emailId));
  // No card yet means it is folded away among older messages; opening it unfolds it.
  if (!card || card.dataset["expanded"] !== "true") controller.toggleMessage(emailId);
  scrollWhenOpen(emailId, FRAMES);
}

function scrollWhenOpen(emailId: Id, frames: number): void {
  requestAnimationFrame(() => {
    const card = document.getElementById(messageCardId(emailId));
    if (card?.dataset["expanded"] === "true") {
      card.scrollIntoView({ block: "start" });
      holdInView(emailId);
    } else if (frames > 0) scrollWhenOpen(emailId, frames - 1);
  });
}

/** Keep the card in view when focus moves within HOLD_MS, until the reader does anything. */
function holdInView(emailId: Id): void {
  const READER = ["wheel", "keydown", "pointerdown", "touchstart"] as const;
  const back = () =>
    requestAnimationFrame(() => {
      if (!stopped) document.getElementById(messageCardId(emailId))?.scrollIntoView({ block: "start" });
    });
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (holding === stop) holding = null;
    clearTimeout(timer);
    document.removeEventListener("focusin", back);
    for (const type of READER) document.removeEventListener(type, stop, true);
  };
  holding?.();
  holding = stop;
  const timer = setTimeout(stop, HOLD_MS);
  document.addEventListener("focusin", back);
  for (const type of READER) document.addEventListener(type, stop, true);
}
