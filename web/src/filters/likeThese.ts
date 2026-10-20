// "Filter messages like these": from a message's menu or the list's More
// menu, open the filter editor in Settings → Filters with the senders filled
// in. The draft waits here until the page takes it.

import { emptyCriteria, type EmailAddress, type FilterCriteria } from "@postern/jmap";
import { navigate } from "../shell/router";

let pending: FilterCriteria | null = null;
const listeners = new Set<() => void>();

/** Open Settings → Filters with a new filter whose criteria start as `criteria`. */
export function openFilterEditor(criteria: Partial<FilterCriteria>): void {
  pending = { ...emptyCriteria(), ...criteria };
  for (const l of listeners) l();
  navigate({ kind: "settings", section: "filters" });
}

/** The criteria waiting for the editor, once (cleared by taking). */
export function takePendingCriteria(): FilterCriteria | null {
  const c = pending;
  pending = null;
  return c;
}

/** Hear a new draft while the filters page is open. */
export function subscribePendingCriteria(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The senders of some messages, Gmail-style: each address once, not your own, at most 20. */
export function sendersOf(messages: readonly { from?: readonly EmailAddress[] | null }[], me: string): string[] {
  const out: string[] = [];
  const mine = me.toLowerCase();
  for (const m of messages) {
    const email = m.from?.[0]?.email?.trim().toLowerCase();
    if (email && email !== mine && !out.includes(email)) out.push(email);
    if (out.length >= 20) break;
  }
  return out;
}

/** "Filter messages like these" for some messages (a card, or the selected conversations' messages). */
export function filterMessagesLike(messages: readonly { from?: readonly EmailAddress[] | null }[], me: string): void {
  openFilterEditor({ from: sendersOf(messages, me) });
}
