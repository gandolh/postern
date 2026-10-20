// Where To/Cc/Bcc suggestions come from. For now: people the user has written
// to (the To, Cc and Bcc of the newest messages in Sent), plus anyone they
// send to in this session. Brief 15 replaces this file with contacts and keeps
// the interface:
//
//   const source = recipientSource(client);            one per signed-in client
//   const people = await source.suggest("bo", 8, signal);
//   source.remember([{ name: "Bob", email: "bob@x.test" }]);   after a send
//
// suggest() never throws: a failed load suggests nobody.

import type { EmailAddress, Id, JmapClient } from "@postern/jmap";

/** A person to offer in a recipient field. */
export interface RecipientSuggestion {
  name: string | null;
  email: string;
}

export interface RecipientSource {
  /** Up to `limit` people whose name or address starts with what was typed (any word, any case), best first. */
  suggest(query: string, limit: number, signal?: AbortSignal): Promise<RecipientSuggestion[]>;
  /** People just written to: they rank first from now on. */
  remember(addresses: readonly EmailAddress[]): void;
}

/** How many Sent messages are read for recent recipients. */
export const RECENT_SENT_MESSAGES = 250;

interface Known {
  name: string | null;
  email: string;
  count: number;
  last: number;
}

class RecentRecipients implements RecipientSource {
  readonly #client: JmapClient;
  readonly #known = new Map<string, Known>();
  #loading: Promise<void> | null = null;

  constructor(client: JmapClient) {
    this.#client = client;
  }

  async suggest(query: string, limit: number, signal?: AbortSignal): Promise<RecipientSuggestion[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    await this.#load(signal);
    const matches: Known[] = [];
    for (const k of this.#known.values()) if (matchesQuery(k, q)) matches.push(k);
    matches.sort((a, b) => b.last - a.last || b.count - a.count);
    return matches.slice(0, limit).map(({ name, email }) => ({ name, email }));
  }

  remember(addresses: readonly EmailAddress[]): void {
    const now = Date.now();
    for (const a of addresses) this.#add(a, now);
  }

  #add(a: EmailAddress, at: number): void {
    const key = a.email.trim().toLowerCase();
    if (!key) return;
    const known = this.#known.get(key);
    if (known) {
      known.count++;
      if (at > known.last) known.last = at;
      if (!known.name && a.name) known.name = a.name;
    } else this.#known.set(key, { name: a.name?.trim() || null, email: a.email.trim(), count: 1, last: at });
  }

  #load(signal?: AbortSignal): Promise<void> {
    if (!this.#loading) {
      this.#loading = this.#fetch(signal).catch(() => {
        // Try again on the next keystroke.
        this.#loading = null;
      });
    }
    return this.#loading;
  }

  async #fetch(signal?: AbortSignal): Promise<void> {
    const sent = await this.#client.call("Mailbox/query", { filter: { role: "sent" } }, { signal });
    const sentId: Id | undefined = sent.ids[0];
    if (!sentId) return;
    const r = this.#client.request();
    const q = r.call("Email/query", { filter: { inMailbox: sentId }, sort: [{ property: "receivedAt", isAscending: false }], limit: RECENT_SENT_MESSAGES });
    const g = r.call("Email/get", { ids: q.ref("/ids"), properties: ["to", "cc", "bcc", "receivedAt"] });
    const res = await r.send({ signal });
    for (const e of res.get(g).list) {
      const at = Date.parse(e.receivedAt) || 0;
      for (const a of [...(e.to ?? []), ...(e.cc ?? []), ...(e.bcc ?? [])]) this.#add(a, at);
    }
  }
}

function matchesQuery(k: Known, q: string): boolean {
  const email = k.email.toLowerCase();
  if (email.startsWith(q)) return true;
  const name = (k.name ?? "").toLowerCase();
  if (name.startsWith(q) || name.split(/[\s.,'"()-]+/).some((w) => w.startsWith(q))) return true;
  const local = email.split("@")[0] ?? "";
  if (local.split(/[._+-]+/).some((w) => w.startsWith(q))) return true;
  return q.length >= 3 && email.includes(q);
}

const sources = new WeakMap<JmapClient, RecipientSource>();

/** The suggestion source for a signed-in client (one each; forgotten with the client at sign-out). */
export function recipientSource(client: JmapClient): RecipientSource {
  let source = sources.get(client);
  if (!source) {
    source = new RecentRecipients(client);
    sources.set(client, source);
  }
  return source;
}
