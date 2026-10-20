// "Also apply to matching conversations": the filter's criteria as a Gmail
// search (brief 10's operators, so the person can also open it as a search),
// the conversations it finds, and one plan that does the filter's actions to
// them. As in Gmail, only archive, mark as read, star, apply label and delete
// (to Trash) reach existing mail; forwarding and "never send to Spam" are
// about mail still to come.

import { formatSearch, joinWords, type EmailFilter, type FilterActions, type FilterCriteria, type Id, type MethodCaller } from "@postern/jmap";
import type { Conversation, ConversationMessage, ConversationScope } from "../actions/conversation";
import { applyPatch, planEdits, type MessageEdit, type MessagePlan } from "../actions/patches";
import { planArchive, planLabels, planRead, planStar, planTrash } from "../actions/plans";

/** The criteria as a search string (Gmail's operators; the default scope leaves out Spam and Trash). */
export function criteriaToSearch(c: FilterCriteria): string {
  const parts: string[] = [];
  // "OR binds tighter than the space": from:a OR from:b subject:x is (a or b) and x.
  if (c.from.length > 0) parts.push(c.from.map((v) => formatSearch({ from: v })).join(" OR "));
  if (c.to.length > 0) parts.push(c.to.map((v) => formatSearch({ to: v })).join(" OR "));
  if (c.subject) parts.push(formatSearch({ subject: c.subject }));
  if (c.words.length > 0) parts.push(formatSearch({ words: joinWords(c.words) }));
  if (c.notWords.length > 0) parts.push(formatSearch({ notWords: joinWords(c.notWords) }));
  if (c.hasAttachment) parts.push(formatSearch({ hasAttachment: true }));
  if (c.size) parts.push(formatSearch({ size: c.size }));
  return parts.filter(Boolean).join(" ");
}

/** Does the filter do anything that existing mail can take? */
export function hasRetroactiveActions(a: FilterActions): boolean {
  return a.archive || a.markRead || a.star || a.label !== null || a.delete;
}

/** How many conversations "Also apply" goes through at most. */
export const RETROACTIVE_LIMIT = 5000;
const PAGE = 100;

export interface MatchingConversations {
  conversations: Conversation[];
  /** Conversations the search found (may exceed what was loaded). */
  total: number;
}

/** The conversations a search filter finds, with every message's labels and keywords. */
export async function findMatchingConversations(
  caller: MethodCaller,
  filter: EmailFilter | null,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<MatchingConversations> {
  const limit = options.limit ?? RETROACTIVE_LIMIT;
  const signal = options.signal;
  const threadIds: Id[] = [];
  let total = 0;
  // Advance by what came back: a server may return fewer than asked without being at the end.
  for (let position = 0; position < limit; ) {
    const page = await caller.call(
      "Email/query",
      { filter, collapseThreads: true, sort: [{ property: "receivedAt", isAscending: false }], position, limit: Math.min(PAGE, limit - position), calculateTotal: true },
      { signal },
    );
    total = page.total ?? total;
    if (page.ids.length === 0) break;
    position += page.ids.length;
    const emails = await caller.call("Email/get", { ids: page.ids, properties: ["threadId"] }, { signal });
    for (const e of emails.list) if (e.threadId && !threadIds.includes(e.threadId)) threadIds.push(e.threadId);
    if (typeof page.total === "number" && position >= page.total) break;
  }
  if (threadIds.length === 0) return { conversations: [], total };
  const threads = await caller.call("Thread/get", { ids: threadIds }, { signal });
  const emailIds = threads.list.flatMap((t) => t.emailIds);
  const messages = await caller.call("Email/get", { ids: emailIds, properties: ["threadId", "mailboxIds", "keywords", "receivedAt"] }, { signal });
  const byThread = new Map<Id, ConversationMessage[]>();
  for (const e of messages.list) {
    const m: ConversationMessage = {
      id: e.id,
      threadId: e.threadId ?? "",
      mailboxIds: e.mailboxIds ?? {},
      keywords: e.keywords ?? {},
      receivedAt: e.receivedAt ?? "",
    };
    const list = byThread.get(m.threadId) ?? [];
    list.push(m);
    byThread.set(m.threadId, list);
  }
  const conversations = threads.list.map((t) => {
    const all = byThread.get(t.id) ?? [];
    // Thread order (oldest first), as the rest of Postern keeps them.
    const order = new Map(t.emailIds.map((id, i) => [id, i]));
    return { id: t.id, messages: all.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) };
  });
  return { conversations, total: Math.max(total, conversations.length) };
}

/**
 * One plan doing the filter's actions to existing conversations, so the toast
 * offers one Undo: label, archive, read, star, then delete, each planned on
 * the state the previous step leaves, merged into one patch per message.
 * @throws MissingLabelError when archiving (or taking a label off) needs All Mail and there is none.
 */
export function planFilterActions(conversations: readonly Conversation[], scope: ConversationScope, a: FilterActions): MessagePlan {
  const steps: ((cs: readonly Conversation[]) => MessagePlan)[] = [];
  if (a.label) {
    const id = a.label.id;
    steps.push((cs) => planLabels(cs, scope, { add: [id] }));
  }
  if (a.archive) steps.push((cs) => planArchive(cs, scope));
  if (a.markRead) steps.push((cs) => planRead(cs, scope, true));
  if (a.star) steps.push((cs) => planStar(cs, scope, true));
  if (a.delete) steps.push((cs) => planTrash(cs, scope));

  let current: readonly Conversation[] = conversations;
  for (const step of steps) {
    const plan = step(current);
    current = current.map((c) => ({ ...c, messages: c.messages.map((m) => (plan.update[m.id] ? { ...m, ...applyPatch(m, plan.update[m.id]!) } : m)) }));
  }
  const final = new Map(current.flatMap((c) => c.messages.map((m) => [m.id, m] as const)));
  return planEdits(conversations, (m): MessageEdit | null => {
    const end = final.get(m.id);
    if (!end || end === m) return null;
    const mailboxIds: Record<Id, boolean> = {};
    for (const id of new Set([...Object.keys(m.mailboxIds), ...Object.keys(end.mailboxIds)])) mailboxIds[id] = end.mailboxIds[id] === true;
    const keywords: Record<string, boolean> = {};
    for (const k of new Set([...Object.keys(m.keywords), ...Object.keys(end.keywords)])) keywords[k] = end.keywords[k] === true;
    return { mailboxIds, keywords };
  });
}
