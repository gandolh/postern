// Where To/Cc/Bcc suggestions come from: the saved contacts (groups expanded
// to their members) and "Other contacts", the people the user has written to
// (the newest messages in Sent plus this session's sends). Ranking is in
// ../contacts/ranking.ts. The interface is brief 08's:
//
//   const source = recipientSource(client);            one per signed-in client
//   const people = await source.suggest("bo", 8, signal);
//   source.remember([{ name: "Bob", email: "bob@x.test" }]);   after a send
//
// suggest() never throws: a failed load suggests nobody.

import type { EmailAddress, JmapClient } from "@postern/jmap";
import { contactsDirectory } from "../contacts/directory";
import { SentRecipients } from "../contacts/other";
import { rankCandidates } from "../contacts/ranking";

export { RECENT_SENT_MESSAGES } from "../contacts/other";

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

class ContactsAndOthers implements RecipientSource {
  readonly #sent: SentRecipients;
  readonly #client: JmapClient;

  constructor(client: JmapClient) {
    this.#client = client;
    this.#sent = new SentRecipients(client);
  }

  async suggest(query: string, limit: number, signal?: AbortSignal): Promise<RecipientSuggestion[]> {
    if (!query.trim()) return [];
    const directory = contactsDirectory(this.#client);
    try {
      // A failed contacts load leaves the others to answer.
      await directory.ensureFresh(signal);
    } catch {
      // ensureFresh never rejects; belt and braces for a faulty client.
    }
    const others = await this.#sent.all(signal).catch(() => []);
    const ranked = rankCandidates([...directory.candidates(query), ...others], query, limit);
    return ranked.map(({ name, email }) => ({ name, email }));
  }

  remember(addresses: readonly EmailAddress[]): void {
    this.#sent.remember(addresses);
  }
}

const sources = new WeakMap<JmapClient, RecipientSource>();

/** The suggestion source for a signed-in client (one each; forgotten with the client at sign-out). */
export function recipientSource(client: JmapClient): RecipientSource {
  let source = sources.get(client);
  if (!source) {
    source = new ContactsAndOthers(client);
    sources.set(client, source);
  }
  return source;
}
