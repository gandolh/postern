// Brief 26: with conversation view off a row is one message, and it opens
// alone, as Gmail's does: `#inbox/<conversationId>/<messageId>` (router.ts),
// so a reload or Back / Forward shows the same message. The reader then shows
// that message by itself (conversation/ConversationView.tsx).
//
// `j` / `k` in that reader open the next and previous message rows. The list
// is not on screen there when the reading pane is off (the default), so the
// list keeps its message rows here, in order, while it is mounted; what it
// held when it unmounted stays for the reader. With nothing held (the reader
// reached by a reload or a link) the keys do nothing until the list has been
// shown once.
//
// (Brief 22's version opened the whole conversation and scrolled to the
// message; that went with this brief.)

import type { Id } from "@postern/jmap";
import { formatRoute, navigate, withConversation, withoutConversation, type MailRoute } from "../shell/router";
import { rememberOpened } from "./returnFocus";
import type { ConversationRow } from "./types";

/** What a message row needs to open. */
export type MessageRowRef = Pick<ConversationRow, "id" | "conversationId" | "emailId">;

/** Ask the mounted list for more rows this many before the end of what it holds. */
const LOAD_AHEAD = 10;

interface Held {
  /** The list the rows came from: its route, without an open conversation. */
  list: string;
  rows: readonly MessageRowRef[];
  /** While the list is mounted: load at least this many rows. */
  loadMore: ((count: number) => void) | null;
}

let held: Held | null = null;

/** The route that opens a message row alone, on the same list. */
export function messageRowRoute<R extends MailRoute>(route: R, row: MessageRowRef): R {
  return withConversation(route, row.conversationId, row.emailId);
}

/**
 * The list (conversation view off) hands over its rows after every render.
 * Returns the release, for its unmount: the rows stay, the loader goes.
 */
export function holdMessageRows(route: MailRoute, rows: readonly MessageRowRef[], loadMore: (count: number) => void): () => void {
  const mine: Held = { list: formatRoute(withoutConversation(route)), rows, loadMore };
  held = mine;
  return () => {
    if (held === mine) held = { ...mine, loadMore: null };
  };
}

/** A list of conversations holds no message rows: forget any (the pref was switched back on). */
export function forgetMessageRows(): void {
  held = null;
}

/**
 * `j` (1) / `k` (-1) in the reader: open the message row after or before the
 * one `route` shows, on the list it came from. False when there is none held.
 */
export function openNeighbourRow(route: MailRoute, delta: 1 | -1): boolean {
  const messageId = route.messageId;
  if (!held || !messageId || held.list !== formatRoute(withoutConversation(route))) return false;
  const at = held.rows.findIndex((r) => r.id === messageId);
  if (at < 0) return false;
  const index = at + delta;
  if (delta > 0 && index >= held.rows.length - LOAD_AHEAD) held.loadMore?.(index + LOAD_AHEAD * 2);
  const next = held.rows[index];
  if (!next) return false;
  rememberOpened(next.id, index);
  navigate(messageRowRoute(route, next));
  return true;
}

/** For tests. */
export function heldMessageRows(): readonly Id[] | null {
  return held ? held.rows.map((r) => r.id) : null;
}
