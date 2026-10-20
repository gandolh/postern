// Reaching the composer from outside React (brief 14's keys), the way the
// list and the conversation expose theirs.

import type { ComposerStore } from "./store";

let active: ComposerStore | null = null;

/** ComposerProvider registers its store while mounted. Returns the unset. */
export function setActiveComposer(store: ComposerStore): () => void {
  active = store;
  return () => {
    if (active === store) active = null;
  };
}

/** The signed-in session's composer store, or null (signed out). */
export function getComposer(): ComposerStore | null {
  return active;
}
