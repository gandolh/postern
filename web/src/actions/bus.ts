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
//
// An optimistic patch whose server write is still out is also listed
// (publishPending) until the server answers. A store that reloads from the
// server meanwhile puts the listed patches back on top of the answer, which
// may predate the write (pendingPatches), so the screen does not flick back.

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

/** The optimistic patches whose server writes are still out, in publish order. */
const pending = new Set<{ update: Readonly<Record<Id, PatchObject>> }>();

/**
 * Publish an optimistic patch and list it as pending until `done()`. Call
 * `done()` once the server has answered, success or not, and before
 * publishing any rollback. Calling it again does nothing.
 */
export function publishPending(update: Readonly<Record<Id, PatchObject>>): () => void {
  const entry = { update };
  pending.add(entry);
  publishMailChange({ kind: "patch", update });
  return () => {
    pending.delete(entry);
  };
}

/** The pending optimistic patches, oldest first: re-apply them over data fresh from the server. */
export function pendingPatches(): Readonly<Record<Id, PatchObject>>[] {
  return [...pending].map((entry) => entry.update);
}

/** Sign-out: a write still out then (it may never answer) must not be re-applied in the next session. */
export function clearPendingPatches(): void {
  pending.clear();
}
