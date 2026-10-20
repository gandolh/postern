// The list's data: what a page fetch returns per conversation, and what a
// list shows. Brief 10 (search) builds a ListQuery of its own; brief 07 and
// brief 14 read rows.

import type { EmailComparator, EmailFilter, Id, SearchSnippet } from "@postern/jmap";
import type { Conversation, ConversationMessage, ConversationScope } from "../actions/conversation";
import type { SenderMode } from "./format";

/** A message as the list holds it (fetched with MESSAGE_PROPERTIES). */
export type RowMessage = ConversationMessage;

/** One row: a conversation, with the message the query returned for it. */
export interface ConversationRow extends Conversation<RowMessage> {
  /** The conversation: a JMAP Thread id. Row key, selection key, `withConversation(route, id)`. */
  id: Id;
  /** The message the query returned for it (the newest that matches the list). */
  emailId: Id;
  subject: string;
  preview: string;
  /** When `emailId` arrived: the row's date. */
  receivedAt: string;
  hasAttachment: boolean;
  /** Every message of the conversation, oldest first (Thread order). */
  messages: readonly RowMessage[];
  /** Search highlights (HTML with <mark>), when the query asked for them. */
  snippet?: SearchSnippet;
}

/** What a list shows. Labels build one in view.ts; brief 10 builds one per search. */
export interface ListQuery {
  /** The `Email/query` filter (null: every message). */
  filter: EmailFilter | null;
  /** Default: newest first (`receivedAt` descending). */
  sort?: EmailComparator[];
  /** Which of a conversation's messages the list shows (Trash and Spam show only theirs). */
  scope: ConversationScope;
  /**
   * The filter, decided on the client for one message, so a row can leave
   * at once when an action takes it out of the list (archive in the Inbox).
   * Leave it out when it cannot be decided locally (full-text search): rows
   * then leave when the server says so, a moment later.
   */
  matches?: (message: RowMessage) => boolean;
  /** Fetch `SearchSnippet/get` highlights with each page (brief 10). */
  searchSnippets?: boolean;
}

/** One list's state, immutable; a new object on every change. */
export interface ListSnapshot {
  /** `loading` until the first page lands; `error` if it failed (later failures keep `ready`). */
  status: "loading" | "ready" | "error";
  error: unknown;
  /** The loaded rows still in the list, in order. */
  rows: readonly ConversationRow[];
  /** How many conversations the list has on the server, less rows an action just took out. */
  total: number;
  /** Every conversation is loaded. */
  complete: boolean;
}

/** How the list presents itself in a view (chips, senders, toolbar). */
export interface ListPresentation {
  /** The label being viewed: chips leave it out, "Move to" takes conversations out of it. */
  currentLabelId: Id | undefined;
  /** Senders, or recipients ("To: Bob") in Sent and Drafts. */
  senderMode: SenderMode;
  /** Gmail hides Archive in Trash and Spam. */
  canArchive: boolean;
  /** Delete is "Delete forever" in Trash and Spam. */
  deleteForever: boolean;
  /** In Spam the button is "Not spam". */
  notSpam: boolean;
}
