// The composer windows, docked bottom-right inside the shell's
// .shell-compose-layer (rendered once). It also:
//   - installs the inline reply under the open conversation (brief 07's slot);
//   - opens a draft in a window when a conversation that is only drafts is
//     opened from a list (Drafts, All Mail, search), as Gmail does, and goes
//     back to the list;
//   - warns before the tab closes while a message is held for Undo send or a
//     draft is not saved yet.

import { useEffect, useSyncExternalStore } from "react";
import { setInlineReplyRenderer } from "../conversation/inlineReply";
import { useLabelsStore } from "../labels/useLabels";
import { getRoute, isMailRoute, navigate, subscribeRoute, withoutConversation } from "../shell/router";
import "./composer.css";
import { useOptionalComposerStore } from "./compose";
import { ComposerWindow } from "./ComposerWindow";
import { InlineReplySlot } from "./InlineReply";
import type { LabelsStore } from "../labels/labelsStore";
import type { ComposerStore } from "./store";

export function ComposerHost() {
  const store = useOptionalComposerStore();
  return store ? <Host store={store} /> : null;
}

function Host({ store }: { store: ComposerStore }) {
  const sessions = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const outbox = useSyncExternalStore(store.outbox.subscribe, store.outbox.getSnapshot, store.outbox.getSnapshot);

  useEffect(() => setInlineReplyRenderer((context) => <InlineReplySlot context={context} />), []);
  useDraftConversations(store, useLabelsStore());

  const unsaved = sessions.some(
    (s) => s.save === "dirty" || s.save === "saving" || s.save === "error" || [...s.files, ...s.inline].some((f) => f.status === "uploading"),
  );
  const warn = outbox.length > 0 || unsaved;
  useEffect(() => {
    if (!warn) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [warn]);

  // Newest on the left, as Gmail stacks them.
  const windows = sessions.filter((s) => s.placement !== "inline" && !s.sending).reverse();
  return (
    <>
      {windows.map((s) => (
        <ComposerWindow key={s.key} state={s} />
      ))}
    </>
  );
}

/** A conversation that is only drafts opens as a composer, not as a conversation. */
function useDraftConversations(store: ComposerStore, labels: Pick<LabelsStore, "mailboxIdForRole" | "subscribe">): void {
  useEffect(() => {
    let checking: string | null = null;
    let ac: AbortController | null = null;
    const check = () => {
      const route = getRoute();
      const id = isMailRoute(route) ? route.conversationId : undefined;
      if (!id) {
        checking = null;
        return;
      }
      if (id === checking) return;
      // Which messages are drafts, and which are in Trash or Spam, needs the labels: wait for them.
      if (!labels.mailboxIdForRole("drafts")) return;
      checking = id;
      ac?.abort();
      const controller = new AbortController();
      ac = controller;
      const view = route.kind === "system" && (route.view === "trash" || route.view === "spam") ? route.view : null;
      store
        .draftOnlyConversation(id, view, controller.signal)
        .then((draftId) => {
          if (controller.signal.aborted || !draftId) return;
          const now = getRoute();
          if (!isMailRoute(now) || now.conversationId !== id) return;
          navigate(withoutConversation(now), { replace: true });
          store.open({ draftId, threadId: id, display: "docked" });
        })
        .catch(() => {});
    };
    check();
    const unsubscribe = subscribeRoute(check);
    const unsubscribeLabels = labels.subscribe(check);
    return () => {
      unsubscribe();
      unsubscribeLabels();
      ac?.abort();
    };
  }, [store, labels]);
}
