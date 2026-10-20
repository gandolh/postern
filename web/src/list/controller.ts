// What brief 14's keyboard shortcuts drive: the list on screen, through
// getActiveList() / useActiveList() from ./registry.
//
//   j / k        moveFocus(1) / moveFocus(-1)
//   x            toggleSelect()
//   o, Enter     open()
//   e            archive()           # trash()          ! reportSpam()
//   s            toggleStar()        Shift+i markRead()  Shift+u markUnread()
//   + / -        markImportant() / markNotImportant()
//   z            undoLast()
//   * a, * n...  select("all" | "none" | "read" | "unread" | "starred" | "unstarred")
//
// The actions act on the selection when there is one, else on the focused
// conversation, as Gmail's do.

import type { Id } from "@postern/jmap";
import type { ConversationRow } from "./types";

/** Gmail's select menu. */
export type SelectKind = "all" | "none" | "read" | "unread" | "starred" | "unstarred";

export interface ListController {
  /** The conversation with the list's focus (a row id), or null before any. */
  readonly focusedId: Id | null;
  /** The selected conversations' ids (loaded rows). */
  readonly selectedIds: ReadonlySet<Id>;
  /** Every conversation in the list is selected ("Select all N conversations"). */
  readonly allSelected: boolean;
  /** The loaded rows, in order. */
  readonly rows: readonly ConversationRow[];

  /** Focus a row (scrolls it into view, moves DOM focus to it). */
  focusRow(id: Id): void;
  /** Move the focus by `delta` rows, loading more if needed. */
  moveFocus(delta: number): void;
  /** Select or deselect a row (default: the focused one). */
  toggleSelect(id?: Id): void;
  select(kind: SelectKind): void;
  /** Open a conversation (default: the focused one). */
  open(id?: Id): void;

  /** The conversations an action would act on now: the selection (all of it, fetched, for "Select all N"), else the focused row. */
  targets(): Promise<ConversationRow[]>;
  archive(): Promise<void>;
  /** Delete: to Trash, or Delete forever in Trash and Spam (asks first). */
  trash(): Promise<void>;
  /** Report spam, or Not spam in Spam. */
  reportSpam(): Promise<void>;
  toggleStar(): Promise<void>;
  markRead(): Promise<void>;
  markUnread(): Promise<void>;
  markImportant(): Promise<void>;
  markNotImportant(): Promise<void>;
  refresh(): Promise<void>;
  /** Undo the last action (any list's, or the conversation view's). */
  undoLast(): Promise<boolean>;
}
