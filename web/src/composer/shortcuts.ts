// What brief 14's keyboard shortcuts call. Gmail's keys:
//
//   c            composeNew()                    a new message (Shift+c: composeNew({ display: "fullscreen" }))
//   r / a / f    composeFromConversation(mode)   reply / reply all / forward on the open conversation
//                (the conversation's own controller, getActiveConversation().reply(), does the same)
//   Ctrl+Enter   sendFocusedComposer()           send from the composer that has focus (the composer
//                handles Ctrl/Cmd+Enter itself; this is for a global key handler)
//   isTypingInComposer(target)                   true inside a composer: single-key shortcuts must not fire
//
// Each returns false when there is nothing to act on.

import { getActiveConversation } from "../conversation/registry";
import type { ComposeMode, ComposeOptions } from "./compose";
import { getComposer } from "./registry";

/** The attribute every composer window and inline reply carries (its session key). */
export const COMPOSER_ATTR = "data-compose-key";

/** `c`: open a new message. */
export function composeNew(options: ComposeOptions = {}): boolean {
  const store = getComposer();
  if (!store) return false;
  store.open({ ...options, mode: "new" });
  return true;
}

/** `r`, `a`, `f`: reply, reply all or forward on the open conversation (its focused message, else the newest). */
export function composeFromConversation(mode: Exclude<ComposeMode, "new">): boolean {
  const conversation = getActiveConversation();
  if (!conversation) return false;
  if (mode === "reply") conversation.reply();
  else if (mode === "replyAll") conversation.replyAll();
  else conversation.forward();
  return true;
}

/** The composer an element is in, by its session key. */
export function composerKeyOf(target: EventTarget | Element | null): string | null {
  const el = target instanceof Element ? target : null;
  return el?.closest(`[${COMPOSER_ATTR}]`)?.getAttribute(COMPOSER_ATTR) ?? null;
}

/** Ctrl+Enter: send the composer that has focus (with its checks: recipients, the "attached" warning). */
export function sendFocusedComposer(): boolean {
  const store = getComposer();
  const key = composerKeyOf(document.activeElement);
  if (!store || !key) return false;
  return store.get(key)?.requestSend() ?? false;
}

/** Inside a composer (fields, editor, buttons): single-letter shortcuts stay off. */
export function isTypingInComposer(target: EventTarget | null): boolean {
  return composerKeyOf(target) !== null;
}
