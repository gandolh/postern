// "Other contacts": the addresses the user has written to, read from Sent and
// from this session's sends. They are suggested, never stored as contacts.

import type { EmailAddress, Id, JmapClient } from "@postern/jmap";
import type { Candidate } from "./ranking";

/** How many Sent messages are read. */
export const RECENT_SENT_MESSAGES = 250;

export interface SentMessage {
  receivedAt: string;
  to?: readonly EmailAddress[] | null;
  cc?: readonly EmailAddress[] | null;
  bcc?: readonly EmailAddress[] | null;
}

/** One entry per address across `messages`, with how often and when it was written to. Pure. */
export function collectOtherContacts(messages: readonly SentMessage[], into: Map<string, Candidate> = new Map()): Map<string, Candidate> {
  for (const m of messages) {
    const at = Date.parse(m.receivedAt) || 0;
    addRecipients([...(m.to ?? []), ...(m.cc ?? []), ...(m.bcc ?? [])], at, into);
  }
  return into;
}

export function addRecipients(addresses: readonly EmailAddress[], at: number, into: Map<string, Candidate>): void {
  for (const a of addresses) {
    const email = a.email.trim();
    const key = email.toLowerCase();
    if (!key) continue;
    const known = into.get(key);
    if (known) {
      known.count++;
      if (at > known.last) known.last = at;
      if (!known.name && a.name?.trim()) known.name = a.name.trim();
    } else
      into.set(key, {
        name: a.name?.trim() || null,
        email,
        provenance: "other",
        count: 1,
        last: at,
      });
  }
}

/** Reads the Sent label once (retrying after a failure) and holds what it found. */
export class SentRecipients {
  readonly #client: JmapClient;
  readonly #known = new Map<string, Candidate>();
  #loading: Promise<void> | null = null;

  constructor(client: JmapClient) {
    this.#client = client;
  }

  /** Everyone written to. Never throws: a failed load is nobody. */
  async all(signal?: AbortSignal): Promise<Candidate[]> {
    await this.#load(signal);
    return [...this.#known.values()];
  }

  remember(addresses: readonly EmailAddress[]): void {
    addRecipients(addresses, Date.now(), this.#known);
  }

  #load(signal?: AbortSignal): Promise<void> {
    if (!this.#loading) {
      this.#loading = this.#fetch(signal).catch(() => {
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
    const q = r.call("Email/query", {
      filter: { inMailbox: sentId },
      sort: [{ property: "receivedAt", isAscending: false }],
      limit: RECENT_SENT_MESSAGES,
    });
    const g = r.call("Email/get", {
      ids: q.ref("/ids"),
      properties: ["to", "cc", "bcc", "receivedAt"],
    });
    const res = await r.send({ signal });
    collectOtherContacts(res.get(g).list, this.#known);
  }
}
