// Every mail action worked out as a plan of per-message patches, before
// anything is sent. Pure: brief 06's list and brief 07's conversation view
// plan the same way, and brief 09's label menu uses planLabels / planMove.
//
// Gmail's meanings (corpus/wiki/gmail-on-jmap.md, decisions.md):
//   archive   take the conversation out of the Inbox; a message left in no
//             label goes to All Mail (the archive-role mailbox)
//   trash     the conversation's messages move to Trash, out of every label
//             (Gmail hides trashed mail from labels); undo puts the labels back
//   star      stars the conversation's latest message; unstar clears every star
//   read      marks every message shown read (or unread)
//
// Archive, delete, move and report spam leave a reply draft alone (a `$draft`
// message in Drafts, inside a conversation with other messages): the open
// conversation shows it as the inline composer, not as a card, and moving it
// would only have the next autosave bring it back (ConversationView.tsx does
// the same). A conversation that is nothing but drafts is acted on whole.

import type { Id } from "@postern/jmap";
import {
  DRAFT,
  FLAGGED,
  IMPORTANT,
  SEEN,
  latest,
  shownMessages,
  type Conversation,
  type ConversationMessage,
  type ConversationScope,
  type MailboxRoles,
} from "./conversation";
import { planEdits, type MessageEdit, type MessagePlan, type MessageState } from "./patches";

/** A system label an action needs is missing from the account. */
export class MissingLabelError extends Error {
  readonly role: keyof MailboxRoles;
  constructor(role: keyof MailboxRoles) {
    super(`The account has no ${role}-role mailbox`);
    this.name = "MissingLabelError";
    this.role = role;
  }
}

function need(roles: MailboxRoles, role: keyof MailboxRoles): Id {
  const id = roles[role];
  if (id === undefined) throw new MissingLabelError(role);
  return id;
}

/** Remove one mailbox, falling back to All Mail when nothing would be left. */
function removeWithFallback(message: MessageState, mailboxId: Id, archiveId: Id | undefined): MessageEdit | null {
  if (message.mailboxIds[mailboxId] !== true) return null;
  const others = Object.keys(message.mailboxIds).filter((id) => id !== mailboxId);
  if (others.length > 0) return { mailboxIds: { [mailboxId]: false } };
  if (archiveId === undefined) throw new MissingLabelError("archive");
  return { mailboxIds: { [mailboxId]: false, [archiveId]: true } };
}

// ---- Archive ---------------------------------------------------------------

/** Would archiving these leave a message in no label, so that All Mail must exist? */
export function archiveNeedsAllMail(conversations: readonly Conversation[], scope: ConversationScope): boolean {
  const inbox = scope.roles.inbox;
  if (inbox === undefined) return false;
  return conversations.some((c) =>
    movedMessages(c, scope).some((m) => m.mailboxIds[inbox] === true && Object.keys(m.mailboxIds).length === 1),
  );
}

/**
 * Archive: every message shown that is in the Inbox leaves it; one in no
 * other label moves to All Mail. Messages not in the Inbox are untouched.
 * @throws MissingLabelError("archive") when All Mail is needed and missing (create it, then plan again).
 */
export function planArchive(conversations: readonly Conversation[], scope: ConversationScope): MessagePlan {
  const inbox = need(scope.roles, "inbox");
  return planEdits(conversations.map(asMoved(scope)), (m) => removeWithFallback(m, inbox, scope.roles.archive));
}

// ---- Trash ---------------------------------------------------------------

/**
 * Delete (to Trash): every message shown leaves all its labels for Trash.
 * The inverse restores each message's labels exactly.
 */
export function planTrash(conversations: readonly Conversation[], scope: ConversationScope): MessagePlan {
  const trash = need(scope.roles, "trash");
  return planEdits(conversations.map(asMoved(scope)), (m) => moveOnly(m, trash));
}

/** Every label off, `target` on. */
function moveOnly(message: MessageState, target: Id): MessageEdit {
  const mailboxIds: Record<Id, boolean> = { [target]: true };
  for (const id of Object.keys(message.mailboxIds)) if (id !== target) mailboxIds[id] = false;
  return { mailboxIds };
}

/** Delete forever (Trash and Spam only): the message ids to destroy, those shown in this view. */
export function destroyIds(conversations: readonly Conversation[], scope: ConversationScope): Id[] {
  const ids = new Set<Id>();
  for (const c of conversations) for (const m of shownMessages(c, scope)) ids.add(m.id);
  return [...ids];
}

// ---- Keywords --------------------------------------------------------------

/** Set or clear a keyword on every message shown. */
export function planKeyword(conversations: readonly Conversation[], scope: ConversationScope, keyword: string, on: boolean): MessagePlan {
  return planEdits(conversations.map(asShown(scope)), () => ({ keywords: { [keyword]: on } }));
}

/** Mark read (`$seen`) or unread, every message shown. */
export function planRead(conversations: readonly Conversation[], scope: ConversationScope, read: boolean): MessagePlan {
  return planKeyword(conversations, scope, SEEN, read);
}

/** Mark important or not (the client-side `$important`), every message shown. */
export function planImportant(conversations: readonly Conversation[], scope: ConversationScope, important: boolean): MessagePlan {
  return planKeyword(conversations, scope, IMPORTANT, important);
}

/**
 * Star: the latest message shown gets `$flagged` (a conversation with a star
 * already is left alone). Unstar: every message shown loses it.
 */
export function planStar(conversations: readonly Conversation[], scope: ConversationScope, on: boolean): MessagePlan {
  if (!on) return planKeyword(conversations, scope, FLAGGED, false);
  const groups = conversations.map((c) => {
    const shown = shownMessages(c, scope);
    if (shown.some((m) => m.keywords[FLAGGED] === true)) return { id: c.id, messages: [] };
    const newest = latest(shown);
    return { id: c.id, messages: newest ? [newest] : [] };
  });
  return planEdits(groups, () => ({ keywords: { [FLAGGED]: true } }));
}

// ---- Labels (brief 09 builds its menu on these) ---------------------------

export interface LabelChange {
  /** Labels to put the conversations in. */
  add?: readonly Id[];
  /** Labels to take them out of. */
  remove?: readonly Id[];
}

/**
 * Apply and remove labels on every message shown. A message that would be
 * left in no label goes to All Mail (`roles.archive`).
 * @throws MissingLabelError("archive") when All Mail is needed and missing.
 */
export function planLabels(conversations: readonly Conversation[], scope: ConversationScope, change: LabelChange): MessagePlan {
  const add = change.add ?? [];
  const remove = (change.remove ?? []).filter((id) => !add.includes(id));
  return planEdits(conversations.map(asShown(scope)), (m) => {
    const mailboxIds: Record<Id, boolean> = {};
    for (const id of add) mailboxIds[id] = true;
    for (const id of remove) mailboxIds[id] = false;
    const left = Object.keys(m.mailboxIds).filter((id) => !remove.includes(id)).length + add.filter((id) => !m.mailboxIds[id]).length;
    if (left === 0) {
      const archive = scope.roles.archive;
      if (archive === undefined) throw new MissingLabelError("archive");
      mailboxIds[archive] = true;
    }
    return { mailboxIds };
  });
}

/**
 * Gmail's "Move to": out of the label being viewed (`from`), into `to`. With
 * no `from` (Starred, All Mail, search) it only adds `to`, and moving to Trash
 * or Spam takes every label off, as Delete and Report spam do.
 */
export function planMove(conversations: readonly Conversation[], scope: ConversationScope, from: Id | undefined, to: Id): MessagePlan {
  if (to === scope.roles.trash || to === scope.roles.junk) {
    return planEdits(conversations.map(asMoved(scope)), (m) => moveOnly(m, to));
  }
  const fromSystem = from !== undefined && (from === scope.roles.trash || from === scope.roles.junk);
  return planEdits(conversations.map(asMoved(scope)), (m) => {
    // Out of Trash or Spam, a message keeps nothing of where it was.
    if (fromSystem) return moveOnly(m, to);
    const mailboxIds: Record<Id, boolean> = { [to]: true };
    if (from !== undefined && from !== to) mailboxIds[from] = false;
    return { mailboxIds };
  });
}

/** The conversation reduced to the messages shown: what each planner acts on. */
function asShown(scope: ConversationScope) {
  return <M extends ConversationMessage>(c: Conversation<M>) => ({ id: c.id, messages: shownMessages(c, scope) });
}

/** Is the message a draft sitting in Drafts (a reply being written)? */
function isDraftInDrafts(message: ConversationMessage, roles: MailboxRoles): boolean {
  return message.keywords[DRAFT] === true && roles.drafts !== undefined && message.mailboxIds[roles.drafts] === true;
}

/**
 * The messages archive, delete, move and report spam act on: those shown,
 * less any draft in Drafts, unless drafts are all there is.
 */
export function movedMessages<M extends ConversationMessage>(conversation: Conversation<M>, scope: ConversationScope): readonly M[] {
  const shown = shownMessages(conversation, scope);
  const kept = shown.filter((m) => !isDraftInDrafts(m, scope.roles));
  return kept.length > 0 ? kept : shown;
}

/** The conversation reduced to the messages a move acts on. */
function asMoved(scope: ConversationScope) {
  return <M extends ConversationMessage>(c: Conversation<M>) => ({ id: c.id, messages: movedMessages(c, scope) });
}
