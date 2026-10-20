// Contacts as the UI sees them, and the JSContact (RFC 9553) the server stores.
// Pure: no network.
//
// What Stalwart 0.16.25 does (checked on the dev server):
// - The `uid` is never assigned for a JMAP-created card, and it cannot be
//   changed later. Group `members` are keyed by member uid, so every card
//   Postern creates carries a `urn:uuid:` uid.
// - Patching `name/full` leaves the old `name/components` in place (a phone
//   shows the old N field), so an edit replaces the whole `name`, `emails`,
//   `phones` and `notes` maps instead of patching inside them.
// - `ContactCard/query` filters `text`, `name` and `kind` match nothing useful,
//   so callers fetch every card and filter here.

import type { Id } from "../types/core.js";
import type { ContactCard } from "../types/contacts.js";

/** What the Contacts page edits. */
export interface ContactDraft {
  name: string;
  emails: string[];
  phones: string[];
  note: string;
}

/** One address of one contact, or one member of a group, ready to offer in a recipient field. */
export interface ContactAddress {
  /** The card the address came from. */
  cardId: Id;
  name: string | null;
  email: string;
}

export function isGroup(card: ContactCard): boolean {
  return card.kind === "group";
}

/** The display name: `name.full`, else the parts joined, else the first address. */
export function contactName(card: ContactCard): string {
  const full = card.name?.full?.trim();
  if (full) return full;
  const parts = (card.name?.components ?? [])
    .filter((c) => c.kind === "given" || c.kind === "given2" || c.kind === "surname" || c.kind === "surname2")
    .map((c) => c.value.trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return contactEmails(card)[0] ?? "";
}

function ordered<T extends { pref?: number }>(map: Record<string, T> | undefined): T[] {
  const list = Object.values(map ?? {});
  // Stable: preferred (1 is most preferred) first, the rest in stored order.
  return list
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (a.v.pref ?? 101) - (b.v.pref ?? 101) || a.i - b.i)
    .map(({ v }) => v);
}

/** Every address, preferred first. */
export function contactEmails(card: ContactCard): string[] {
  return ordered(card.emails)
    .map((e) => e.address?.trim())
    .filter((a): a is string => !!a);
}

export function contactPhones(card: ContactCard): string[] {
  return ordered(card.phones)
    .map((p) => p.number?.trim())
    .filter((n): n is string => !!n);
}

/** The notes joined by a blank line. */
export function contactNote(card: ContactCard): string {
  return Object.values(card.notes ?? {})
    .map((n) => n.note)
    .filter(Boolean)
    .join("\n\n");
}

export function contactDraft(card: ContactCard): ContactDraft {
  return {
    name: card.name?.full?.trim() ?? contactName(card),
    emails: contactEmails(card),
    phones: contactPhones(card),
    note: contactNote(card),
  };
}

function clean(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.trim();
    const key = v.toLowerCase();
    if (v && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

function emailMap(emails: readonly string[]): Record<string, { "@type": "EmailAddress"; address: string }> {
  return Object.fromEntries(emails.map((address, i) => [`e${i + 1}`, { "@type": "EmailAddress" as const, address }]));
}

function phoneMap(phones: readonly string[]): Record<string, { "@type": "Phone"; number: string }> {
  return Object.fromEntries(phones.map((number, i) => [`p${i + 1}`, { "@type": "Phone" as const, number }]));
}

/** `urn:uuid:` + a random UUID. */
export function newContactUid(): string {
  return `urn:uuid:${globalThis.crypto.randomUUID()}`;
}

/** The object to pass as a `ContactCard/set` create. */
export function newContactCard(draft: ContactDraft, addressBookId: Id, uid: string = newContactUid()): Omit<ContactCard, "id"> {
  const emails = clean(draft.emails);
  const phones = clean(draft.phones);
  const note = draft.note.trim();
  const card: Omit<ContactCard, "id"> = {
    "@type": "Card",
    version: "1.0",
    uid,
    kind: "individual",
    addressBookIds: { [addressBookId]: true },
    name: { full: draft.name.trim() },
  };
  if (emails.length > 0) card.emails = emailMap(emails);
  if (phones.length > 0) card.phones = phoneMap(phones);
  if (note) card.notes = { n1: { "@type": "Note", note } };
  return card;
}

/**
 * The `ContactCard/set` update that makes a card match `draft`. Whole-map
 * replacement (see the header); an emptied map is set to null.
 */
export function contactPatch(draft: ContactDraft): Record<string, unknown> {
  const emails = clean(draft.emails);
  const phones = clean(draft.phones);
  const note = draft.note.trim();
  return {
    name: { full: draft.name.trim() },
    emails: emails.length > 0 ? emailMap(emails) : null,
    phones: phones.length > 0 ? phoneMap(phones) : null,
    notes: note ? { n1: { "@type": "Note", note } } : null,
  };
}

/** The cards that are members of `group` (by uid), in card order. */
export function groupMembers(group: ContactCard, cards: readonly ContactCard[]): ContactCard[] {
  const uids = new Set(Object.keys(group.members ?? {}));
  if (uids.size === 0) return [];
  return cards.filter((c) => !isGroup(c) && c.uid !== undefined && uids.has(c.uid));
}

/** Every address of every non-group card, one entry per address. */
export function contactAddresses(cards: readonly ContactCard[]): ContactAddress[] {
  const out: ContactAddress[] = [];
  for (const card of cards) {
    if (isGroup(card)) continue;
    const name = contactName(card);
    for (const email of contactEmails(card))
      out.push({
        cardId: card.id,
        name: name && name !== email ? name : null,
        email,
      });
  }
  return out;
}

/** The card (not a group) that has this address, case-insensitively. */
export function findByAddress(cards: readonly ContactCard[], email: string): ContactCard | undefined {
  const key = email.trim().toLowerCase();
  return cards.find((c) => !isGroup(c) && contactEmails(c).some((e) => e.toLowerCase() === key));
}

/** The first address of a group member (what a recipient field gets). */
export function groupAddresses(group: ContactCard, cards: readonly ContactCard[]): ContactAddress[] {
  const out: ContactAddress[] = [];
  for (const m of groupMembers(group, cards)) {
    const email = contactEmails(m)[0];
    if (!email) continue;
    const name = contactName(m);
    out.push({
      cardId: m.id,
      name: name && name !== email ? name : null,
      email,
    });
  }
  return out;
}
