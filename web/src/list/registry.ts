// Reaching the mounted lists from outside them, without importing their
// components: brief 11's LiveHost passes push StateChanges in, brief 14's
// keyboard shortcuts drive the list that has the user's attention.
//
//   applyListStateChange(change)   every mounted list catches up (Email/changes, queryChanges)
//   getActiveList()                the list keys act on, or null (no list on screen)
//   subscribeActiveList(fn)        hear when that changes; useActiveList() in React

import type { StateChange } from "@postern/jmap";
import { useSyncExternalStore } from "react";
import type { ListController } from "./controller";
import type { ListStore } from "./listStore";

const stores = new Set<ListStore>();

/** Called by useListStore while a list is mounted. Returns the unregister. */
export function registerListStore(store: ListStore): () => void {
  stores.add(store);
  return () => {
    stores.delete(store);
  };
}

/** The lists on screen now. */
export function mountedListStores(): readonly ListStore[] {
  return [...stores];
}

/**
 * Brief 11's entry point: pass every push StateChange. Each mounted list
 * refreshes if the Email state moved, keeping scroll position and selection.
 */
export function applyListStateChange(change: StateChange): Promise<void> {
  return Promise.all([...stores].map((s) => s.applyStateChange(change))).then(() => undefined);
}

// ---- The active list (keyboard) ----------------------------------------------

let active: ListController | null = null;
const listeners = new Set<() => void>();

/** The list mounts itself here; the newest mounted list wins. Returns the unset. */
export function setActiveList(controller: ListController): () => void {
  active = controller;
  for (const listener of [...listeners]) listener();
  return () => {
    if (active !== controller) return;
    active = null;
    for (const listener of [...listeners]) listener();
  };
}

/** The list keyboard shortcuts act on (brief 14), or null when no list is on screen. */
export function getActiveList(): ListController | null {
  return active;
}

export function subscribeActiveList(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The active list controller, re-rendering when it changes. */
export function useActiveList(): ListController | null {
  return useSyncExternalStore(subscribeActiveList, getActiveList, getActiveList);
}
