// The Snoozed label, made on first use (brief 24): a top-level mailbox named
// "Snoozed", unsubscribed so an IMAP client leaves it out of its folder list.
// The server is asked first, not the label cache: another device may have made
// it. A top-level "Snoozed" folder that exists already is used as it is.
// Concurrent calls share one creation. The labels store shows it as the
// Snoozed system entry (labelsStore.ts).

import { JmapSetError, type Id, type Mailbox, type MethodCaller } from "@postern/jmap";
import { SNOOZED_LABEL } from "./keyword";

export interface SnoozedLabels {
  /** The Snoozed label's mailbox, if the labels store knows it. */
  snoozedId(): Id | undefined;
  sync(): Promise<void>;
}

const pending = new WeakMap<MethodCaller, Promise<Id>>();

/** Is this mailbox the Snoozed label? Top level, no role, the name in any case. */
export function isSnoozedMailbox(m: Pick<Mailbox, "name" | "parentId" | "role">): boolean {
  return m.role === null && m.parentId === null && m.name.toLowerCase() === SNOOZED_LABEL.toLowerCase();
}

export function ensureSnoozedLabel(caller: MethodCaller, labels: SnoozedLabels): Promise<Id> {
  const known = labels.snoozedId();
  if (known !== undefined) return Promise.resolve(known);
  const running = pending.get(caller);
  if (running) return running;
  const created = findOrCreate(caller)
    .then(async (id) => {
      await labels.sync();
      return id;
    })
    .finally(() => pending.delete(caller));
  pending.set(caller, created);
  return created;
}

async function findOrCreate(caller: MethodCaller): Promise<Id> {
  const { list } = await caller.call("Mailbox/get", { ids: null, properties: ["id", "name", "parentId", "role"] });
  const existing = (list as Pick<Mailbox, "id" | "name" | "parentId" | "role">[]).find(isSnoozedMailbox);
  if (existing) return existing.id;
  const res = await caller.call("Mailbox/set", { create: { snoozed: { name: SNOOZED_LABEL, parentId: null, isSubscribed: false } } });
  const id = res.created?.["snoozed"]?.id;
  if (!id) throw new JmapSetError("Mailbox/set", "snoozed", res.notCreated?.["snoozed"] ?? { type: "serverFail" });
  return id;
}
