// The per-account half of `npm run dev:mail`, run by dev/setup.sh once the
// accounts exist: checks each one signs in with its dev/.env password, then
// makes sure it has every system label, an identity, and (alice) her labels.
// Idempotent: it looks before it creates, and never renames or deletes.
//
//   node dev/accounts.ts

import { ACCOUNTS, Jmap, getMailboxes, mailboxPath, loadDevEnv } from "./lib.ts";
import type { DevAccount, MailboxInfo } from "./lib.ts";

/**
 * The system labels Postern relies on, by JMAP role. Stalwart 0.16 creates
 * the first five for a new account (as "Inbox", "Sent Items", "Drafts",
 * "Junk Mail", "Deleted Items") but no archive-role mailbox, which is
 * Postern's All Mail. The names below are used only for what is missing.
 */
const SYSTEM_LABELS: ReadonlyArray<{ role: string; name: string }> = [
  { role: "inbox", name: "Inbox" },
  { role: "sent", name: "Sent Items" },
  { role: "drafts", name: "Drafts" },
  { role: "junk", name: "Junk Mail" },
  { role: "trash", name: "Deleted Items" },
  { role: "archive", name: "Archive" },
];

/** User labels, as paths. A parent comes before its children. */
const USER_LABELS: Record<DevAccount["name"], readonly string[]> = {
  alice: ["Work", "Work/Clients", "Receipts", "Travel", "Hostile"],
  bob: [],
};

async function ensureMailboxes(jmap: Jmap): Promise<void> {
  let mailboxes = await getMailboxes(jmap);
  const created: string[] = [];

  for (const { role, name } of SYSTEM_LABELS) {
    if (mailboxes.some((m) => m.role === role)) continue;
    await createMailbox(jmap, { name, role, parentId: null });
    created.push(`${name} (role ${role})`);
    mailboxes = await getMailboxes(jmap);
  }

  for (const path of USER_LABELS[jmap.account.name]) {
    if (findByPath(mailboxes, path)) continue;
    const parts = path.split("/");
    const name = parts.pop() as string;
    const parent = parts.length ? findByPath(mailboxes, parts.join("/")) : null;
    if (parts.length && !parent) throw new Error(`label ${path}: parent ${parts.join("/")} is missing`);
    await createMailbox(jmap, { name, role: null, parentId: parent ? parent.id : null });
    created.push(path);
    mailboxes = await getMailboxes(jmap);
  }

  const summary = created.length ? `created ${created.join(", ")}` : "all present";
  console.log(`  ${jmap.account.email}: labels ${summary}`);
}

function findByPath(mailboxes: readonly MailboxInfo[], path: string): MailboxInfo | undefined {
  return mailboxes.find((m) => mailboxPath(m, mailboxes) === path);
}

async function createMailbox(
  jmap: Jmap,
  mailbox: { name: string; role: string | null; parentId: string | null },
): Promise<void> {
  const res = await jmap.one<{ created?: Record<string, unknown>; notCreated?: Record<string, unknown> }>(
    "Mailbox/set",
    { create: { m: { ...mailbox, isSubscribed: true } } },
  );
  if (!res.created?.m) throw new Error(`Mailbox/set ${mailbox.name}: ${JSON.stringify(res.notCreated)}`);
}

/**
 * Stalwart creates an identity for a new account from its description (the
 * display name), so this normally finds one. It creates one only if a user
 * deleted it.
 */
async function ensureIdentity(jmap: Jmap): Promise<void> {
  const res = await jmap.one<{ list: Array<{ email: string; name: string }> }>("Identity/get", {});
  const own = res.list.find((i) => i.email === jmap.account.email);
  if (own) {
    console.log(`  ${jmap.account.email}: identity "${own.name}" present`);
    return;
  }
  const set = await jmap.one<{ created?: Record<string, unknown>; notCreated?: Record<string, unknown> }>(
    "Identity/set",
    { create: { i: { name: jmap.account.displayName, email: jmap.account.email } } },
  );
  if (!set.created?.i) throw new Error(`Identity/set: ${JSON.stringify(set.notCreated)}`);
  console.log(`  ${jmap.account.email}: identity "${jmap.account.displayName}" created`);
}

loadDevEnv();
for (const account of ACCOUNTS) {
  const jmap = await Jmap.connect(account);
  await ensureMailboxes(jmap);
  await ensureIdentity(jmap);
}
