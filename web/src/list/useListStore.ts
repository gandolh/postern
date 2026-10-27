// One ListStore per mounted list: created for the query, loaded on mount,
// refreshed when the window regains focus, registered for brief 11's push,
// disposed on unmount.

import { QueryStore, type JmapClient } from "@postern/jmap";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ListStore, NEWEST_FIRST } from "./listStore";
import { registerListStore } from "./registry";
import type { ListQuery, ListSnapshot } from "./types";

/** The list's identity: the query, and whether rows are conversations or messages (brief 22), so one mode's pages never show in the other. */
export function queryKey(query: ListQuery, conversationView = true): string {
  return `${QueryStore.keyOf({ filter: query.filter, sort: query.sort ?? NEWEST_FIRST, collapseThreads: conversationView })}|${query.scope.kind}|${query.searchSnippets ? 1 : 0}`;
}

export interface UseListStoreOptions {
  /** Brief 22: false lists one row per message. Default true. */
  conversationView?: boolean;
}

/** The store for `query` (a new one when the query's key changes) and its snapshot. */
export function useListStore(client: JmapClient, query: ListQuery, options: UseListStoreOptions = {}): { store: ListStore; snapshot: ListSnapshot } {
  const conversationView = options.conversationView ?? true;
  const key = queryKey(query, conversationView);
  const store = useMemo(
    () => new ListStore(client, query, { accountId: () => (client.hasSession ? client.accountId : undefined), conversationView }),
    // The query object may be rebuilt each render; the key (which carries the mode) decides when the list is a different list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, key],
  );

  useEffect(() => {
    // StrictMode's development re-run disposes and activates the same store again.
    store.activate();
    store.start();
    const unregister = registerListStore(store);
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
