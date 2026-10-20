// A scripted JMAP for contacts tests: AddressBook/get, ContactCard query/get/set
// over an in-memory list, plus an empty Sent label. Not shipped.

import type { ContactCard, JmapClient } from "@postern/jmap";
import { vi } from "vitest";
import type { SignedInSession } from "../auth/context";

export class FakeContacts {
  cards: ContactCard[];
  readonly calls: [string, Record<string, unknown>][] = [];
  #next = 100;
  sent: { to: { name: string | null; email: string }[]; receivedAt: string }[] = [];

  constructor(cards: ContactCard[] = []) {
    this.cards = cards;
  }

  readonly client = {
    accountId: "b",
    call: vi.fn(async (name: string, args: Record<string, unknown>) => this.#call(name, args)),
    request: () => {
      throw new Error("not used");
    },
  } as unknown as JmapClient;

  get session(): SignedInSession {
    return { client: this.client, account: { username: "alice@postern.test", name: "Alice Archer" }, signOut: vi.fn(async () => {}) };
  }

  names(): string[] {
    return this.calls.map(([n]) => n);
  }

  #call(name: string, args: Record<string, unknown>): unknown {
    this.calls.push([name, args]);
    switch (name) {
      case "AddressBook/get":
        return { list: [{ id: "b", isDefault: true }] };
      case "ContactCard/query":
        return { ids: this.cards.map((c) => c.id), queryState: "q" };
      case "ContactCard/get": {
        const ids = args["ids"] as string[];
        return { state: "s", list: this.cards.filter((c) => ids.includes(c.id)) };
      }
      case "ContactCard/set": {
        const set = args as { create?: Record<string, Omit<ContactCard, "id">>; update?: Record<string, Record<string, unknown>>; destroy?: string[] };
        const created: Record<string, { id: string }> = {};
        for (const [k, v] of Object.entries(set.create ?? {})) {
          const id = String(this.#next++);
          this.cards.push({ ...v, id } as ContactCard);
          created[k] = { id };
        }
        for (const [id, patch] of Object.entries(set.update ?? {})) {
          this.cards = this.cards.map((c) => {
            if (c.id !== id) return c;
            const next: Record<string, unknown> = { ...c };
            for (const [k, v] of Object.entries(patch)) {
              if (v === null) delete next[k];
              else next[k] = v;
            }
            return next as ContactCard;
          });
        }
        this.cards = this.cards.filter((c) => !(set.destroy ?? []).includes(c.id));
        return { created, notCreated: null, updated: {}, notUpdated: null, destroyed: set.destroy ?? [], notDestroyed: null };
      }
      case "Mailbox/query":
        return { ids: [] };
    }
    throw new Error(`unexpected ${name}`);
  }
}

export function card(id: string, name: string, emails: string[], extra: Partial<ContactCard> = {}): ContactCard {
  return {
    id,
    addressBookIds: { b: true },
    uid: `urn:uuid:${id}`,
    name: { full: name },
    emails: Object.fromEntries(emails.map((address, i) => [`e${i}`, { address }])),
    ...extra,
  };
}
