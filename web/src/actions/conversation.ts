// A conversation as the actions see it: its messages with the few properties
// that labels, stars and unread need, and which of them a view shows.
//
// Gmail hides a conversation's trashed and spam messages everywhere except in
// Trash and Spam, where only those show. That "conversation as shown" is what
// unread, the star, mark read and delete act on. Pure.

import type { EmailAddress, Id, MailboxRole } from "@postern/jmap";
import type { MessageState } from "./patches";

/** A message of a conversation: enough for the list row and every action. */
export interface ConversationMessage extends MessageState {
  threadId: Id;
  receivedAt: string;
  from?: EmailAddress[] | null;
  to?: EmailAddress[] | null;
}

/** A conversation (JMAP Thread) and its messages, oldest first. */
export interface Conversation<M extends ConversationMessage = ConversationMessage> {
  id: Id;
  messages: readonly M[];
}

/** The account's system labels, by role. Any may be missing (All Mail until Postern creates it). */
export interface MailboxRoles {
  inbox?: Id;
  archive?: Id;
  trash?: Id;
  junk?: Id;
  sent?: Id;
  drafts?: Id;
}

export const ROLE_NAMES: readonly (keyof MailboxRoles & MailboxRole)[] = ["inbox", "archive", "trash", "junk", "sent", "drafts"];

/** Which messages of a conversation a view shows: the usual ones, or only those in Trash or Spam. */
export type ScopeKind = "normal" | "trash" | "spam";

export interface ConversationScope {
  kind: ScopeKind;
  roles: MailboxRoles;
}

/** Is the message part of the conversation as this view shows it? */
export function inScope(message: Pick<MessageState, "mailboxIds">, scope: ConversationScope): boolean {
  const { trash, junk } = scope.roles;
  switch (scope.kind) {
    case "trash":
      return trash !== undefined && message.mailboxIds[trash] === true;
    case "spam":
      return junk !== undefined && message.mailboxIds[junk] === true;
    default:
      // In some label other than Trash and Spam: JMAP's inMailboxOtherThan [junk, trash].
      return Object.keys(message.mailboxIds).some((id) => id !== trash && id !== junk);
  }
}

/**
 * The messages a view shows of a conversation, oldest first. When none fit
 * the scope (a search hit in Trash, say), all of them: the row is there, so
 * something of it is shown.
 */
export function shownMessages<M extends ConversationMessage>(conversation: Conversation<M>, scope: ConversationScope): readonly M[] {
  const shown = conversation.messages.filter((m) => inScope(m, scope));
  return shown.length > 0 ? shown : conversation.messages;
}

/** The newest of some messages (latest `receivedAt`; the later one in thread order on a tie). */
export function latest<M extends ConversationMessage>(messages: readonly M[]): M | undefined {
  let best: M | undefined;
  for (const m of messages) if (!best || m.receivedAt >= best.receivedAt) best = m;
  return best;
}

export const SEEN = "$seen";
export const FLAGGED = "$flagged";
export const IMPORTANT = "$important";
export const DRAFT = "$draft";
export const JUNK = "$junk";
export const NOT_JUNK = "$notjunk";

/** Unread when any message shown lacks `$seen`. */
export function isUnread(conversation: Conversation, scope: ConversationScope): boolean {
  return shownMessages(conversation, scope).some((m) => m.keywords[SEEN] !== true);
}

/** Starred when any message shown has `$flagged`. */
export function isStarred(conversation: Conversation, scope: ConversationScope): boolean {
  return shownMessages(conversation, scope).some((m) => m.keywords[FLAGGED] === true);
}

/** Important when any message shown has the client-side `$important`. */
export function isImportant(conversation: Conversation, scope: ConversationScope): boolean {
  return shownMessages(conversation, scope).some((m) => m.keywords[IMPORTANT] === true);
}

/** The labels (mailbox ids) of the messages shown, in first-seen order. */
export function labelIdsOf(conversation: Conversation, scope: ConversationScope): Id[] {
  const ids = new Set<Id>();
  for (const m of shownMessages(conversation, scope)) for (const id of Object.keys(m.mailboxIds)) ids.add(id);
  return [...ids];
}
