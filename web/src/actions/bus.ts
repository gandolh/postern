// How an action tells every screen holding messages what just changed, before
// and after the server agrees: the list (brief 06), the open conversation
// (brief 07), search results (brief 10).
//
//   subscribeMailChanges((change) => {
//     if (change.kind === "patch") ...apply change.update to the messages you hold
//     else ...settled: the server changed; refresh (Email/changes)
//   });
//
// "patch" is optimistic (or a rollback, or an undo): apply it at once with
// applyPatch from ./patches. "settled" follows every finished action.

import type { Id, PatchObject } from "@postern/jmap";

export type MailChange =
  | {
      kind: "patch";
      /** Message id → patch to apply locally (applyPatch). */
      update: Readonly<Record<Id, PatchObject>>;
    }
  | { kind: "settled" };

type Listener = (change: MailChange) => void;

const listeners = new Set<Listener>();

/** Hear every local change. Returns the unsubscribe. */
export function subscribeMailChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tell every subscriber. A throwing listener does not stop the others. */
export function publishMailChange(change: MailChange): void {
  for (const listener of [...listeners]) {
    try {
      listener(change);
    } catch (err) {
      console.error(err);
    }
  }
}
