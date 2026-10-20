// Focus coming back to the list after a conversation closes (brief 14).
//
// `u`, the back button and the conversation's own archive / delete / spam all
// return to the list, which mounts afresh. The list remembers which row it
// opened (and where), the conversation says it is leaving, and the list puts
// focus on that row, or, when the conversation left the list, on the row that
// took its place (Gmail's behaviour).

import type { Id } from "@postern/jmap";

let opened: { id: Id; index: number } | null = null;
let pending: { removed: boolean } | null = null;

/** The list calls this when it opens a conversation. */
export function rememberOpened(id: Id, index: number): void {
  opened = { id, index };
}

/** The conversation calls this just before it navigates back to the list. */
export function requestReturnFocus(removed: boolean): void {
  pending = { removed };
}

/** The list asks, once its rows are loaded: the row to focus, or null (and the request is spent). */
export function takeReturnFocus(rows: readonly { id: Id }[]): Id | null {
  if (!pending) return null;
  const { removed } = pending;
  pending = null;
  if (!opened || rows.length === 0) return null;
  const at = rows.findIndex((r) => r.id === opened!.id);
  if (!removed && at >= 0) return rows[at]!.id;
  const rest = rows.filter((r) => r.id !== opened!.id);
  return rest[Math.min(removed && at >= 0 ? at : opened.index, rest.length - 1)]?.id ?? null;
}
