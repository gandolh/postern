// Report spam and Not spam, the basic form: a move to or from Spam (role
// `junk`) with the `$junk` / `$notjunk` keywords, as Stalwart's spam filter
// reads them. Brief 13 extends this file (blocking the sender, training).
//
//   reportSpam(caller, conversations, scope)   every message shown → Spam, $junk on, $notjunk off
//   notSpam(caller, conversations, scope)      every message in Spam → Inbox, $notjunk on, $junk off
//
// The list and the conversation view go through useMailActions(), which adds
// the optimistic update, the toast and undo; these are the plain versions.

import type { Id, MethodCaller } from "@postern/jmap";
import { JUNK, NOT_JUNK, shownMessages, type Conversation, type ConversationScope } from "./conversation";
import { sendPlan, type SendResult } from "./execute";
import { planEdits, type MessageEdit, type MessagePlan } from "./patches";
import { MissingLabelError } from "./plans";

/** Report spam: every message shown leaves its labels for Spam and is marked `$junk`. */
export function planReportSpam(conversations: readonly Conversation[], scope: ConversationScope): MessagePlan {
  const junk = scope.roles.junk;
  if (junk === undefined) throw new MissingLabelError("junk");
  return planEdits(
    conversations.map((c) => ({ id: c.id, messages: shownMessages(c, scope) })),
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
