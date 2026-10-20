// The conversations a label action works on, from the ids a toolbar, a drag
// or a keyboard shortcut hands over. Rows already loaded in the mounted list
// are used as they are (they carry every message's labels); anything else
// (a conversation open without its list, say) is fetched.

import type { Id, MethodCaller } from "@postern/jmap";
import type { Conversation, ConversationMessage, ConversationScope, MailboxRoles } from "../actions/conversation";
import { getActiveList } from "../list/registry";
import type { LabelRoute } from "../shell/router";

export interface ResolveOptions {
  /** "Select all N" is on: take every conversation of the list, not just the loaded ones. */
  all?: boolean;
}

/** True when the mounted list has "Select all N" on and every given id is selected. */
export function isAllSelected(ids: readonly Id[]): boolean {
  const list = getActiveList();
  return list !== null && list.allSelected && ids.length > 0 && ids.every((id) => list.selectedIds.has(id));
}

export async function resolveConversations(caller: MethodCaller, ids: readonly Id[], options: ResolveOptions = {}): Promise<Conversation[]> {
  const list = getActiveList();
  const held = new Map<Id, Conversation>();
  if (list) {
    if (options.all) for (const row of await list.targets()) held.set(row.id, row);
    for (const row of list.rows) if (!held.has(row.id)) held.set(row.id, row);
  }
  const wanted = options.all && list ? [...held.keys()] : [...new Set(ids)];
  const missing = wanted.filter((id) => !held.has(id));
  if (missing.length > 0) for (const c of await fetchConversations(caller, missing)) held.set(c.id, c);
  return wanted.flatMap((id) => {
    const c = held.get(id);
    return c ? [c] : [];
  });
}

const CHUNK = 100;

/** Conversations straight from the server: Thread/get, then each message's labels. */
export async function fetchConversations(caller: MethodCaller, threadIds: readonly Id[]): Promise<Conversation[]> {
  const out: Conversation[] = [];
  for (let i = 0; i < threadIds.length; i += CHUNK) {
    const threads = await caller.call("Thread/get", { ids: threadIds.slice(i, i + CHUNK) });
    const emailIds = threads.list.flatMap((t) => t.emailIds);
    const emails = emailIds.length
      ? (await caller.call("Email/get", { ids: emailIds, properties: ["id", "threadId", "mailboxIds", "keywords", "receivedAt"] })).list
      : [];
    const byId = new Map(emails.map((e) => [e.id, e]));
    for (const t of threads.list) {
      const messages = t.emailIds.flatMap((id) => {
        const e = byId.get(id);
        return e
          ? [{ id: e.id, threadId: e.threadId, mailboxIds: e.mailboxIds, keywords: e.keywords ?? {}, receivedAt: e.receivedAt } as ConversationMessage]
          : [];
      });
      if (messages.length > 0) out.push({ id: t.id, messages });
    }
  }
  return out;
}

/** The scope a label route shows its conversations in (Trash and Spam show only their own messages). */
export function scopeFor(route: LabelRoute | null, roles: MailboxRoles): ConversationScope {
  const view = route?.kind === "system" ? route.view : null;
  return { kind: view === "trash" ? "trash" : view === "spam" ? "spam" : "normal", roles };
}
