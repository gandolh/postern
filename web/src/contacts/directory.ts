// The signed-in user's contacts, held in memory per JmapClient (so they go at
// sign-out with the client). The Contacts page, the hover card and the
// recipient suggestions all read this one copy.

import {
  contactAddresses,
  createContact,
  deleteContact,
  findByAddress,
  groupAddresses,
  isGroup,
  loadContactCards,
  updateContact,
  type ContactCard,
  type ContactDraft,
  type JmapClient,
} from "@postern/jmap";
import { useSyncExternalStore } from "react";
import { rankCandidates, type Candidate } from "./ranking";

export interface ContactsSnapshot {
  status: "idle" | "loading" | "ready" | "error";
  cards: readonly ContactCard[];
  error: string | null;
}

/** A load older than this is repeated before suggesting (another device may have changed the book). */
export const STALE_MS = 30_000;

const IDLE: ContactsSnapshot = { status: "idle", cards: [], error: null };

export class ContactsDirectory {
  readonly #client: JmapClient;
  readonly #listeners = new Set<() => void>();
  #snapshot: ContactsSnapshot = IDLE;
  #loading: Promise<void> | null = null;
  #loadedAt = 0;

  constructor(client: JmapClient) {
    this.#client = client;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  };

  getSnapshot = (): ContactsSnapshot => this.#snapshot;

  #set(next: ContactsSnapshot): void {
    this.#snapshot = next;
    for (const fn of [...this.#listeners]) fn();
  }

  /** Read the address book (one load at a time). Never rejects: a failure is in the snapshot. */
  load(signal?: AbortSignal): Promise<void> {
    if (this.#loading) return this.#loading;
    if (this.#snapshot.status !== "ready") this.#set({ ...this.#snapshot, status: "loading", error: null });
    this.#loading = loadContactCards(this.#client, signal)
      .then(({ cards }) => {
        this.#loadedAt = Date.now();
        this.#set({ status: "ready", cards, error: null });
      })
      .catch((e: unknown) => {
        // A sign-out or an abort is not a failure to show.
        if (signal?.aborted) return;
        this.#set({
          status: this.#snapshot.cards.length > 0 ? "ready" : "error",
          cards: this.#snapshot.cards,
          error: e instanceof Error ? e.message : "Contacts could not be loaded",
        });
      })
      .finally(() => {
        this.#loading = null;
      });
    return this.#loading;
  }

  /** Loaded, and not stale: what the suggestions use. */
  async ensureFresh(signal?: AbortSignal): Promise<readonly ContactCard[]> {
    if (this.#snapshot.status !== "ready" || Date.now() - this.#loadedAt > STALE_MS) await this.load(signal);
    return this.#snapshot.cards;
  }

  async add(draft: ContactDraft): Promise<void> {
    await createContact(this.#client, draft);
    await this.load();
  }

  async update(card: ContactCard, draft: ContactDraft): Promise<void> {
    await updateContact(this.#client, card, draft);
    await this.load();
  }

  async remove(card: ContactCard): Promise<void> {
    await deleteContact(this.#client, card.id);
    await this.load();
  }

  /** The saved contact with this address, if any (from what is loaded). */
  find(email: string): ContactCard | undefined {
    return findByAddress(this.#snapshot.cards, email);
  }

  /** Contacts as suggestion candidates: one per address, plus the members of each group (flagged when the query matches the group). */
  candidates(query: string): Candidate[] {
    const cards = this.#snapshot.cards;
    const out: Candidate[] = contactAddresses(cards).map((a) => ({
      name: a.name,
      email: a.email,
      provenance: "contact",
      count: 0,
      last: 0,
    }));
    const q = query.trim().toLowerCase();
    if (q) {
      for (const g of cards.filter(isGroup)) {
        const name = g.name?.full?.toLowerCase() ?? "";
        if (!name.split(/[\s.,'"()-]+/).some((w) => w.startsWith(q))) continue;
        for (const m of groupAddresses(g, cards))
          out.push({
            name: m.name,
            email: m.email,
            provenance: "contact",
            count: 0,
            last: 0,
            viaGroup: true,
          });
      }
    }
    return out;
  }

  /** Contacts matching `query`, best first (no sending history). */
  search(query: string, limit: number): Candidate[] {
    return rankCandidates(this.candidates(query), query, limit);
  }
}

const directories = new WeakMap<JmapClient, ContactsDirectory>();

/** The directory for a signed-in client. */
export function contactsDirectory(client: JmapClient): ContactsDirectory {
  let d = directories.get(client);
  if (!d) {
    d = new ContactsDirectory(client);
    directories.set(client, d);
  }
  return d;
}

export function useContactsSnapshot(directory: ContactsDirectory): ContactsSnapshot {
  return useSyncExternalStore(directory.subscribe, directory.getSnapshot, directory.getSnapshot);
}
