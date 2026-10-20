// Where brief 08's inline reply renders: a slot below the last message of the
// open conversation. Brief 08 registers a renderer once (from its provider);
// the conversation view calls it with the context below.
//
//   useEffect(() => setInlineReplyRenderer((ctx) => <InlineReply {...ctx} />), []);
//
// The renderer returns null when there is no reply in progress for
// ctx.threadId. The slot's element has id inlineReplySlotId(threadId), for
// scrolling to it.

import type { Id } from "@postern/jmap";
import { useSyncExternalStore, type ReactNode } from "react";

export interface InlineReplyContext {
  /** The conversation (JMAP Thread id). */
  threadId: Id;
  /** The newest message shown: what Reply answers by default. */
  lastMessageId: Id;
  /** Every message shown, oldest first. */
  messageIds: readonly Id[];
  subject: string;
}

export type InlineReplyRenderer = (context: InlineReplyContext) => ReactNode;

let renderer: InlineReplyRenderer | null = null;
const listeners = new Set<() => void>();

/** Install the inline reply. Returns the uninstall. */
export function setInlineReplyRenderer(next: InlineReplyRenderer): () => void {
  renderer = next;
  for (const l of [...listeners]) l();
  return () => {
    if (renderer !== next) return;
    renderer = null;
    for (const l of [...listeners]) l();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const get = () => renderer;

export function useInlineReplyRenderer(): InlineReplyRenderer | null {
  return useSyncExternalStore(subscribe, get, get);
}

export function inlineReplySlotId(threadId: Id): string {
  return `conv-reply-${threadId}`;
}
