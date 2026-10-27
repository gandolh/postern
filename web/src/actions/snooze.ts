// Snooze and unsnooze as plans (brief 24), so they run like every other
// action: applied at once, one Email/set, Undo from the inverse. Pure.
//
//   snooze     out of the Inbox into the Snoozed label, with $snoozed-<time>
//              on every message (snooze/keyword.ts). Other labels stay. A
//              second snooze moves the time.
//   unsnooze   out of Snoozed back into the Inbox, the time dropped. Waking
//              (snooze/wake.ts) also marks the newest message unread and
//              $woken, so the Inbox shows it on top.

import type { Id } from "@postern/jmap";
import { snoozeKeyword, snoozeKeywordsOf, WOKEN } from "../snooze/keyword";
import { latest, SEEN, type Conversation, type ConversationScope, type MailboxRoles } from "./conversation";
import { planEdits, type MessagePlan } from "./patches";
import { MissingLabelError, movedMessages } from "./plans";
import type { ActionCopy } from "./runner";
import { formatSnoozeTime } from "../snooze/times";

/** Snooze until `at`: every message moved (a reply draft stays, as for archive) leaves the Inbox for Snoozed. */
export function planSnooze(conversations: readonly Conversation[], scope: ConversationScope, snoozedId: Id, at: Date): MessagePlan {
  const inbox = scope.roles.inbox;
  const keyword = snoozeKeyword(at);
  return planEdits(
    conversations.map((c) => ({ id: c.id, messages: movedMessages(c, scope) })),
    (m) => {
      const keywords: Record<string, boolean> = { [WOKEN]: false };
      for (const k of snoozeKeywordsOf(m)) keywords[k] = false;
      keywords[keyword] = true;
      const mailboxIds: Record<Id, boolean> = { [snoozedId]: true };
      if (inbox !== undefined) mailboxIds[inbox] = false;
      return { mailboxIds, keywords };
    },
  );
}

export interface UnsnoozeOptions {
  /** Waking at the time (or on a reply): the newest message turns unread and $woken. */
  wake?: boolean;
}

/**
 * Back to the Inbox: every message in Snoozed, or carrying a snooze time, is
 * moved back and loses its time.
 * @throws MissingLabelError("inbox") when the account has no Inbox.
 */
export function planUnsnooze(
  conversations: readonly Conversation[],
  roles: Pick<MailboxRoles, "inbox">,
  snoozedId: Id | undefined,
  options: UnsnoozeOptions = {},
): MessagePlan {
  const inbox = roles.inbox;
  if (inbox === undefined) throw new MissingLabelError("inbox");
  const groups = conversations.map((c) => ({
    id: c.id,
    messages: c.messages.filter((m) => (snoozedId !== undefined && m.mailboxIds[snoozedId] === true) || snoozeKeywordsOf(m).length > 0),
  }));
  const newest = new Set(groups.flatMap((g) => (options.wake ? [latest(g.messages)?.id] : [])).filter((id): id is Id => id !== undefined));
  return planEdits(groups, (m) => {
    const keywords: Record<string, boolean> = {};
    for (const k of snoozeKeywordsOf(m)) keywords[k] = false;
    if (newest.has(m.id)) {
      keywords[SEEN] = false;
      keywords[WOKEN] = true;
    }
    const mailboxIds: Record<Id, boolean> = { [inbox]: true };
    if (snoozedId !== undefined) mailboxIds[snoozedId] = false;
    return { mailboxIds, keywords };
  });
}

/** runner.ts's actionCopy, here so that this module (which runner.ts imports) imports nothing back at run time. */
function actionCopy(oneDone: string, manyDone: string, oneFailed: string, manyFailed: string): ActionCopy {
  const n = (count: number) => count.toLocaleString();
  return {
    done: (count) => (count === 1 ? oneDone : manyDone.replace("{n}", n(count))),
    failed: (count) => (count === 1 ? oneFailed : manyFailed.replace("{n}", n(count))),
  };
}

/** "Conversation snoozed until Tue 08:00." */
export function snoozeCopy(at: Date, now: Date = new Date()): ActionCopy {
  const when = formatSnoozeTime(at, now);
  return actionCopy(`Conversation snoozed until ${when}.`, `{n} conversations snoozed until ${when}.`, "Couldn't snooze the conversation.", "Couldn't snooze {n} conversations.");
}

export const UNSNOOZE_COPY = actionCopy("Conversation unsnoozed.", "{n} conversations unsnoozed.", "Couldn't unsnooze the conversation.", "Couldn't unsnooze {n} conversations.");
