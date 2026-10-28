// Report spam and Not spam: a move to or from Spam (role `junk`) with the
// `$junk` / `$notjunk` keywords. Also "Delete all spam messages now" and
// "Empty Trash now".
//
//   reportSpam(caller, conversations, scope)   every message moved → Spam, $junk on, $notjunk off
//   notSpam(caller, conversations, scope)      every message in Spam → Inbox, $notjunk on, $junk off
//   REPORT_SPAM_COPY / NOT_SPAM_COPY           the toast words (the server learns from both)
//   listEmptyable / emptyLabel                 Spam or Trash emptied (confirm first; no undo)
//
// Training (checked 2026-10-20 against Stalwart 0.16.25's source and the dev
// server): Email/set stores a spam training sample when a message gains
// `$junk` or the Spam mailbox, and a ham sample when it gains `$notjunk`, loses
// `$junk`, or leaves Spam other than for Trash (crates/jmap/src/email/set.rs,
// `train_spam`; crates/email/src/message/ingest.rs `add_account_spam_sample`).
// The default classifier (FTRL, `SpamClassifier.model`) retrains from the
// samples every 12 hours once it holds 100 of each kind
// (crates/spam-filter/src/modules/classifier.rs). So the copy says it learns.
//
// The list and the conversation view go through useMailActions(), which adds
// the optimistic update, the toast and undo; these are the plain versions.

import type { Id, MethodCaller } from "@postern/jmap";
import { JUNK, NOT_JUNK, type Conversation, type ConversationScope, type MailboxRoles } from "./conversation";
import { sendPlan, type SendResult } from "./execute";
import { planEdits, type MessageEdit, type MessagePlan } from "./patches";
import { MissingLabelError, movedMessages } from "./plans";
import { actionCopy as copy, type ActionCopy } from "./copy";

/** Report spam: every message moved (reply drafts aside) leaves its labels for Spam and is marked `$junk`. */
export function planReportSpam(conversations: readonly Conversation[], scope: ConversationScope): MessagePlan {
  const junk = scope.roles.junk;
  if (junk === undefined) throw new MissingLabelError("junk");
  return planEdits(
    conversations.map((c) => ({ id: c.id, messages: movedMessages(c, scope) })),
    (m): MessageEdit => {
      const mailboxIds: Record<Id, boolean> = { [junk]: true };
      for (const id of Object.keys(m.mailboxIds)) if (id !== junk) mailboxIds[id] = false;
      return { mailboxIds, keywords: { [JUNK]: true, [NOT_JUNK]: false } };
    },
  );
}

/** Not spam: every message in Spam moves to the Inbox and is marked `$notjunk`. */
export function planNotSpam(conversations: readonly Conversation[], scope: ConversationScope): MessagePlan {
  const { junk, inbox } = scope.roles;
  if (junk === undefined) throw new MissingLabelError("junk");
  if (inbox === undefined) throw new MissingLabelError("inbox");
  return planEdits(
    conversations.map((c) => ({ id: c.id, messages: c.messages.filter((m) => m.mailboxIds[junk] === true) })),
    () => ({ mailboxIds: { [junk]: false, [inbox]: true }, keywords: { [JUNK]: false, [NOT_JUNK]: true } }),
  );
}

/** Report the conversations as spam. Resolves with what the server did; `plan.inverse` undoes it. */
export async function reportSpam(caller: MethodCaller, conversations: readonly Conversation[], scope: ConversationScope): Promise<SendResult> {
  return sendPlan(caller, planReportSpam(conversations, scope));
}

/** Take the conversations out of Spam, into the Inbox. */
export async function notSpam(caller: MethodCaller, conversations: readonly Conversation[], scope: ConversationScope): Promise<SendResult> {
  return sendPlan(caller, planNotSpam(conversations, scope));
}

/** Said once after the toast's own words: Stalwart learns from both (see the top of this file). */
export const LEARNS = "Your mail server learns from this.";

export const REPORT_SPAM_COPY: ActionCopy = copy(
  `{Thing} reported as spam. ${LEARNS}`,
  `{n} {things} reported as spam. ${LEARNS}`,
  "Couldn't report the {thing} as spam.",
  "Couldn't report {n} {things} as spam.",
);

export const REPORT_SPAM_MESSAGE_COPY: ActionCopy = copy(
  `Message reported as spam. ${LEARNS}`,
  `Messages reported as spam. ${LEARNS}`,
  "Couldn't report the message as spam.",
  "Couldn't report the messages as spam.",
);

export const NOT_SPAM_COPY: ActionCopy = copy(
  `{Thing} marked as not spam and moved to Inbox. ${LEARNS}`,
  `{n} {things} marked as not spam and moved to Inbox. ${LEARNS}`,
  "Couldn't move the {thing} out of Spam.",
  "Couldn't move {n} {things} out of Spam.",
);

// ---- Delete all spam messages now / Empty Trash now ------------------------

export type EmptyableLabel = "junk" | "trash";

export interface EmptyPlan {
  label: EmptyableLabel;
  mailboxId: Id;
  /** Messages only in Spam or Trash: deleted forever. */
  destroy: Id[];
  /** Messages also in another label: only taken out of Spam or Trash. */
  release: Id[];
}

export interface EmptyResult {
  destroyed: number;
  released: number;
  /** Messages the server refused to delete or change. */
  failed: number;
}

/** Ids per Email/query page while listing a label. */
const PAGE = 500;

/**
 * Every message in Spam or Trash, sorted into those to delete forever (in no
 * other label than Spam and Trash) and those to take out (also in a label, so
 * deleting them forever would take them from that label too). Read-only.
 */
export async function listEmptyable(caller: MethodCaller, roles: MailboxRoles, label: EmptyableLabel, options: { signal?: AbortSignal } = {}): Promise<EmptyPlan> {
  const mailboxId = roles[label];
  if (mailboxId === undefined) throw new MissingLabelError(label);
  const ids: Id[] = [];
  // Advance by what came back: a server may return fewer than asked without being at the end.
  for (;;) {
    const page = await caller.call("Email/query", { filter: { inMailbox: mailboxId }, position: ids.length, limit: PAGE, calculateTotal: true }, options);
    ids.push(...page.ids);
    if (page.ids.length === 0 || (typeof page.total === "number" && ids.length >= page.total)) break;
  }
  const destroy: Id[] = [];
  const release: Id[] = [];
  if (ids.length === 0) return { label, mailboxId, destroy, release };
  const got = await caller.call("Email/get", { ids, properties: ["mailboxIds"] }, options);
  const binOnly = new Set([roles.junk, roles.trash].filter((x): x is Id => x !== undefined));
  for (const email of got.list) {
    const labels = Object.keys(email.mailboxIds ?? {});
    if (labels.every((id) => binOnly.has(id))) destroy.push(email.id);
    else release.push(email.id);
  }
  return { label, mailboxId, destroy, release };
}

/** Run an EmptyPlan: one Email/set (the client splits it by the server's limits). Cannot be undone. */
export async function emptyLabel(caller: MethodCaller, plan: EmptyPlan, options: { signal?: AbortSignal } = {}): Promise<EmptyResult> {
  if (plan.destroy.length === 0 && plan.release.length === 0) return { destroyed: 0, released: 0, failed: 0 };
  const update = Object.fromEntries(plan.release.map((id) => [id, { [`mailboxIds/${plan.mailboxId}`]: null }]));
  const res = await caller.call("Email/set", { update, destroy: plan.destroy }, options);
  const destroyed = res.destroyed?.length ?? 0;
  const released = Object.keys(res.updated ?? {}).length;
  const failed = Object.keys(res.notDestroyed ?? {}).length + Object.keys(res.notUpdated ?? {}).length;
  return { destroyed, released, failed };
}

/** What the confirm dialog says before emptying. */
export function emptyConfirmText(plan: EmptyPlan): { title: string; body: string; confirm: string } {
  const n = plan.destroy.length;
  const where = plan.label === "junk" ? "Spam" : "Trash";
  const kept =
    plan.release.length === 0
      ? ""
      : plan.release.length === 1
        ? ` One message that also has another label will only be taken out of ${where}.`
        : ` ${plan.release.length.toLocaleString()} messages that also have another label will only be taken out of ${where}.`;
  return {
    title: plan.label === "junk" ? "Delete all spam messages?" : "Empty Trash?",
    body: `${n === 1 ? "1 message" : `${n.toLocaleString()} messages`} in ${where} will be deleted forever. You can't undo this.${kept}`,
    confirm: plan.label === "junk" ? "Delete all spam" : "Empty Trash",
  };
}

/** The toast after emptying. */
export function emptyDoneText(label: EmptyableLabel, result: EmptyResult): string {
  const where = label === "junk" ? "Spam" : "Trash";
  if (result.failed > 0) return `Couldn't empty ${where}: ${result.failed.toLocaleString()} messages were left.`;
  const n = result.destroyed;
  return `${n === 1 ? "1 message" : `${n.toLocaleString()} messages`} deleted forever.`;
}
