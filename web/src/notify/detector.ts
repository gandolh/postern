// Finds NEW Inbox mail (brief 11). Fed the newest Inbox messages after each
// change, it reports the ones that arrived since the last look. Never the
// first look (that is the baseline), never mail already seen, and never mail
// older than the newest message seen at the baseline: archived mail moved
// back to the Inbox is old, not new.

export interface InboxMessage {
  id: string;
  threadId: string;
  /** ISO date the server received it. */
  receivedAt: string;
  from: readonly { name?: string | null; email: string }[] | null;
  subject: string | null;
  keywords?: Readonly<Record<string, boolean>>;
}

export class NewMailDetector {
  #seen = new Set<string>();
  #watermark = 0;
  #primed = false;

  /** Forget everything; the next observe() is a baseline again. */
  reset(): void {
    this.#seen.clear();
    this.#watermark = 0;
    this.#primed = false;
  }

  /** Messages in the Inbox (newest first or any order). Returns the new, unread ones, oldest first. */
  observe(messages: readonly InboxMessage[]): InboxMessage[] {
    const fresh: InboxMessage[] = [];
    for (const m of messages) {
      const at = Date.parse(m.receivedAt);
      if (this.#primed && !this.#seen.has(m.id) && at > this.#watermark) {
        if (!m.keywords?.["$seen"] && !m.keywords?.["$draft"]) fresh.push(m);
      }
    }
    for (const m of messages) {
      this.#seen.add(m.id);
      const at = Date.parse(m.receivedAt);
      if (Number.isFinite(at) && at > this.#watermark) this.#watermark = at;
    }
    this.#primed = true;
    return fresh.sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
  }
}
