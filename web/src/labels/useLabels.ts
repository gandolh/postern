// React access to the label list (labelsStore.ts).
//
//   <LabelsProvider>        one LabelsStore per signed-in session; the shell renders it
//   <LabelsStoreProvider store>  the same with a given store (tests)
//   useLabels()             LabelsSnapshot & { store }: status, labels, byId, system, tree, hidden, ...
//   useLabelsStore()        the LabelsStore: sync(), applyStateChange(change), mailboxIdForRole(role)
//   useResolvedLabel(route) the label a LabelRoute shows (or null while loading / not found)
//
// The provider loads the labels on mount and syncs again when the window
// regains focus or the browser comes back online. Brief 11 adds push:
// `useLabelsStore().applyStateChange(change)` for every StateChange.

import { createContext, createElement, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useJmap } from "../auth";
import type { LabelRoute } from "../shell/router";
import { LabelsStore, resolveLabelRoute, type LabelsSnapshot, type ResolvedLabel } from "./labelsStore";

const LabelsContext = createContext<LabelsStore | null>(null);

/** The labels of the signed-in session: one LabelsStore over `useJmap()`. The shell renders it. */
export function LabelsProvider({ children }: { children: ReactNode }) {
  const client = useJmap();
  // One store per client; the client is new for each sign-in, and sign-out unmounts this.
  const [store] = useState(() => new LabelsStore(client, () => client.accountId));
  return createElement(LabelsStoreProvider, { store, children });
}

export interface LabelsStoreProviderProps {
  store: LabelsStore;
  children: ReactNode;
}

/** Provides a given store, loads it, and syncs on focus and on reconnect. LabelsProvider uses it; tests use it directly. */
export function LabelsStoreProvider({ store, children }: LabelsStoreProviderProps) {
  useEffect(() => {
    // StrictMode's dev re-run disposes and activates again; a real unmount leaves it disposed.
    store.activate();
    void store.sync();
    const refresh = () => void store.sync();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      store.dispose();
    };
  }, [store]);

  return createElement(LabelsContext.Provider, { value: store }, children);
}

/** The LabelsStore of the signed-in session. */
export function useLabelsStore(): LabelsStore {
  const store = useContext(LabelsContext);
  if (!store) throw new Error("useLabelsStore must be used inside <LabelsProvider> (the shell renders it)");
  return store;
}

export interface LabelsView extends LabelsSnapshot {
  store: LabelsStore;
}

/** The labels with their counts, re-rendering when they change. */
export function useLabels(): LabelsView {
  const store = useLabelsStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => ({ ...snapshot, store }), [snapshot, store]);
}

/** The label a route shows; null while the labels load, or for a user label the account does not have. */
export function useResolvedLabel(route: LabelRoute): ResolvedLabel | null {
  const labels = useLabels();
  return useMemo(() => (labels.status === "loading" ? null : resolveLabelRoute(route, labels)), [labels, route]);
}
