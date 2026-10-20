// One ConversationStore per open conversation: created for the id, loaded on
// mount, refreshed when the window regains focus or comes back online,
// registered for brief 11's push, disposed on unmount.

import type { Id, JmapClient } from "@postern/jmap";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ConversationStore, type ConversationSnapshot } from "./conversationStore";
import { registerConversationStore } from "./registry";

export function useConversationStore(client: JmapClient, conversationId: Id): { store: ConversationStore; snapshot: ConversationSnapshot } {
  const store = useMemo(
    () =>
      new ConversationStore(client, conversationId, {
        accountId: () => (client.hasSession ? client.accountId : undefined),
        fetchBlob: async (params, signal) => (await client.blob.download(params, { signal })).blob(),
      }),
    [client, conversationId],
  );

  useEffect(() => {
    store.activate();
    const unregister = registerConversationStore(store);
    const refresh = () => void store.refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      unregister();
      store.dispose();
    };
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { store, snapshot };
}
