// All Mail, made on first need. Stalwart creates no archive-role mailbox
// (corpus/wiki/gmail-on-jmap.md), so the first archive that would leave a
// message in no label creates one: "Archive", role `archive`, at the top.
//
//   const archiveId = await ensureAllMail(client, labelsStore);
//
// The server is asked first, not the label cache: another tab may have made
// it. A top-level "Archive" with no role (an IMAP client's folder) is given
// the role rather than duplicated. Concurrent calls share one creation.

import { JmapSetError, type Id, type Mailbox, type MethodCaller } from "@postern/jmap";

/** What it needs from the labels store: the cached answer, and a sync after creating. */
export interface AllMailLabels {
  mailboxIdForRole(role: "archive"): Id | undefined;
  sync(): Promise<void>;
}

export const ALL_MAIL_NAME = "Archive";

const pending = new WeakMap<MethodCaller, Promise<Id>>();

/** The archive-role mailbox's id, creating it if the account has none. */
export function ensureAllMail(caller: MethodCaller, labels: AllMailLabels): Promise<Id> {
  const known = labels.mailboxIdForRole("archive");
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
  const mailboxes = list as Pick<Mailbox, "id" | "name" | "parentId" | "role">[];
  const existing = mailboxes.find((m) => m.role === "archive");
  if (existing) return existing.id;

  const folder = mailboxes.find((m) => m.role === null && m.parentId === null && m.name.toLowerCase() === ALL_MAIL_NAME.toLowerCase());
  if (folder) {
    const res = await caller.call("Mailbox/set", { update: { [folder.id]: { role: "archive" } } });
    const error = res.notUpdated?.[folder.id];
    if (error) throw new JmapSetError("Mailbox/set", folder.id, error);
    return folder.id;
  }

  const res = await caller.call("Mailbox/set", {
    create: { allMail: { name: ALL_MAIL_NAME, role: "archive", parentId: null, isSubscribed: true } },
  });
  const id = res.created?.["allMail"]?.id;
  if (!id) throw new JmapSetError("Mailbox/set", "allMail", res.notCreated?.["allMail"] ?? { type: "serverFail" });
  return id;
}
