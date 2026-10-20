// Reading and writing the owner's address book. Thin over `MethodCaller`
// (the JmapClient): the shapes are in ./jscontact.ts.

import type { MethodCaller } from "../methods/caller.js";
import type { Id } from "../types/core.js";
import type { ContactCard } from "../types/contacts.js";
import type { SetResponse } from "../types/core.js";
import { contactPatch, newContactCard, type ContactDraft } from "./jscontact.js";

/** Cards fetched per `ContactCard/get`. */
export const CONTACT_PAGE = 200;
/** The most cards one load reads. */
export const CONTACT_LIMIT = 5000;

/** Every card in the account: contacts and groups, with the state to ask `changes` from. */
export async function loadContactCards(caller: MethodCaller, signal?: AbortSignal): Promise<{ cards: ContactCard[]; state: string }> {
  const q = await caller.call("ContactCard/query", { limit: CONTACT_LIMIT }, { signal });
  const cards: ContactCard[] = [];
  let state = q.queryState;
  for (let i = 0; i < q.ids.length; i += CONTACT_PAGE) {
    const g = await caller.call("ContactCard/get", { ids: q.ids.slice(i, i + CONTACT_PAGE) }, { signal });
    cards.push(...g.list);
    state = g.state;
  }
  if (q.ids.length === 0) {
    const g = await caller.call("ContactCard/get", { ids: [] }, { signal });
    state = g.state;
  }
  return { cards, state };
}

/** The address book new contacts go in: the default one, else the first. Null when there are none. */
export async function defaultAddressBookId(caller: MethodCaller, signal?: AbortSignal): Promise<Id | null> {
  const r = await caller.call("AddressBook/get", {}, { signal });
  return (r.list.find((b) => b.isDefault) ?? r.list[0])?.id ?? null;
}

function failure(r: Pick<SetResponse<ContactCard>, "notCreated" | "notUpdated" | "notDestroyed">, id: string): Error | null {
  const e = r.notCreated?.[id] ?? r.notUpdated?.[id] ?? r.notDestroyed?.[id];
  return e ? new Error(e.description || e.type) : null;
}

/** Add a contact to the default address book; returns the stored card's id. */
export async function createContact(caller: MethodCaller, draft: ContactDraft, signal?: AbortSignal): Promise<Id> {
  const bookId = await defaultAddressBookId(caller, signal);
  if (!bookId) throw new Error("There is no address book to add the contact to");
  const r = await caller.call("ContactCard/set", { create: { new: newContactCard(draft, bookId) } }, { signal });
  const err = failure(r, "new");
  if (err) throw err;
  const id = r.created?.["new"]?.id;
  if (!id) throw new Error("The contact was not created");
  return id;
}

export async function updateContact(caller: MethodCaller, card: ContactCard, draft: ContactDraft, signal?: AbortSignal): Promise<void> {
  const r = await caller.call("ContactCard/set", { update: { [card.id]: contactPatch(draft) } }, { signal });
  const err = failure(r, card.id);
  if (err) throw err;
}

export async function deleteContact(caller: MethodCaller, id: Id, signal?: AbortSignal): Promise<void> {
  const r = await caller.call("ContactCard/set", { destroy: [id] }, { signal });
  const err = failure(r, id);
  if (err) throw err;
}
