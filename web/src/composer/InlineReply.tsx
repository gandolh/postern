// The reply under the last message of the open conversation (Gmail's inline
// reply). Brief 07's view calls the renderer registered by ComposerHost with
// the conversation; this shows the inline composer for it, if one is open.
// When the conversation holds a draft reply that no window has, the draft
// opens here, as Gmail shows it; a draft the user closed is offered instead.

import type { Id } from "@postern/jmap";
import { FilePen } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { InlineReplyContext } from "../conversation/inlineReply";
import { useComposerStore } from "./compose";
import { ComposeForm } from "./ComposeForm";
import { COMPOSER_ATTR } from "./shortcuts";

export function InlineReplySlot({ context }: { context: InlineReplyContext }) {
  const store = useComposerStore();
  const sessions = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const state = sessions.find((s) => s.placement === "inline" && s.threadId === context.threadId && !s.sending);
  const busy = sessions.some((s) => s.threadId === context.threadId && s.placement === "inline");
  const [offered, setOffered] = useState<{ threadId: Id; draftId: Id } | null>(null);
  const messageKey = context.messageIds.join(",");

  // Drafts in this conversation that no composer holds: open the newest here, or offer one closed earlier.
  useEffect(() => {
    if (busy) return;
    const ac = new AbortController();
    store
      .threadDrafts(context.threadId, ac.signal)
      .then(({ messages }) => {
        if (ac.signal.aborted) return;
        const free = messages.filter((m) => m.draft && !store.isGone(m.id) && !store.forDraft(m.id));
        const fresh = free.filter((m) => !store.wasClosed(m.id));
        const newest = fresh[fresh.length - 1];
        if (newest) {
          store.open({ draftId: newest.id, threadId: context.threadId, display: "inline" });
          return;
        }
        const closed = free[free.length - 1];
        setOffered(closed ? { threadId: context.threadId, draftId: closed.id } : null);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [store, context.threadId, messageKey, busy]);

  if (state) {
    const session = store.get(state.key);
    if (!session) return null;
    return (
      <section className="compose-inline" aria-label={state.mode === "forward" ? "Forward" : "Reply"} {...{ [COMPOSER_ATTR]: state.key }}>
        <ComposeForm session={session} state={state} variant="inline" onPopOut={() => store.setPlacement(state.key, "docked")} />
      </section>
    );
  }
  if (offered && offered.threadId === context.threadId && !busy) {
    return (
      <button type="button" className="btn compose-draft-offer" onClick={() => store.open({ draftId: offered.draftId, threadId: context.threadId, display: "inline" })}>
        <FilePen aria-hidden="true" /> Continue the draft
      </button>
    );
  }
  return null;
}
