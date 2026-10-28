// Reaching the open conversation from outside it, without importing its
// components (the list's registry.ts, for the conversation):
//
//   applyConversationStateChange(change)   brief 11: every open conversation
//                                          catches up when the Email state moved
//   getActiveConversation()                brief 14: what n / p / u / r / a / f
//                                          act on, or null (none open)
//   subscribeActiveConversation(fn)        hear when that changes; useActiveConversation() in React

import type { Id, StateChange } from "@postern/jmap";
import { useSyncExternalStore } from "react";
import type { ConversationStore } from "./conversationStore";

const stores = new Set<ConversationStore>();

/** Called by useConversationStore while a conversation is open. Returns the unregister. */
export function registerConversationStore(store: ConversationStore): () => void {
  stores.add(store);
  return () => {
    stores.delete(store);
  };
}

/** Brief 11's entry point, next to applyListStateChange: pass every push StateChange. */
export function applyConversationStateChange(change: StateChange): Promise<void> {
  return Promise.all([...stores].map((s) => s.applyStateChange(change))).then(() => undefined);
}

/** The open conversations' stores (one, or none). */
export function mountedConversationStores(): readonly ConversationStore[] {
  return [...stores];
}

// ---- The active conversation (keyboard) ------------------------------------------

/** What brief 14's keys can do to the open conversation. */
export interface ConversationController {
  conversationId: Id;
  /**
   * Brief 26: the one message shown alone (a message row opened with
   * conversation view off), else undefined. The label keys act on it, by this
   * id (labels/conversations.ts lendConversation).
   */
  messageId?: Id;
  /** Brief 26, with one message shown: `j` / `k` open the next / previous message row of the list it came from. */
  openRow?(delta: 1 | -1): void;
  /** The messages shown, oldest first. */
  messageIds(): Id[];
  /** The message the cursor is on (the last focused card), or null. */
  focusedMessageId(): Id | null;
  /** Put the cursor on a message and focus its card. */
  focusMessage(id: Id): void;
  /** `n`: the next message (newer). */
  nextMessage(): void;
  /** `p`: the previous message (older). */
  previousMessage(): void;
  /** Enter / `o` on a message: open or close it. */
  toggleMessage(id?: Id): void;
  /** `u`: back to the list. */
  back(): void;
  /** `r` / `a` / `f`: on the focused message, else the last one. */
  reply(id?: Id): void;
  replyAll(id?: Id): void;
  forward(id?: Id): void;
  /** `e`, `#`, `!`, Shift+u: as the toolbar does, then back to the list. */
  archive(): void;
  trash(): void;
  reportSpam(): void;
  markUnread(): void;
}

let active: ConversationController | null = null;
const listeners = new Set<() => void>();

/** The open conversation mounts itself here. Returns the unset. */
export function setActiveConversation(controller: ConversationController): () => void {
  active = controller;
  for (const listener of [...listeners]) listener();
  return () => {
    if (active !== controller) return;
    active = null;
    for (const listener of [...listeners]) listener();
  };
}

export function getActiveConversation(): ConversationController | null {
  return active;
}

export function subscribeActiveConversation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActiveConversation(): ConversationController | null {
  return useSyncExternalStore(subscribeActiveConversation, getActiveConversation, getActiveConversation);
}

/** The DOM id of a message's card (brief 08 scrolls to it; brief 14 focuses it). */
export function messageCardId(emailId: Id): string {
  return `conv-message-${emailId}`;
}
