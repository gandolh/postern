// Assembles the whole seed and computes the manifest the integration tests
// in later briefs assert against. Deterministic: the same inputs every run.

import { bulk } from "./bulk.ts";
import { conversations } from "./conversations.ts";
import { hostile, hostileFixtures, HOSTILE_HEADER, HOSTILE_LABEL } from "./hostile.ts";
import { newsletters } from "./newsletters.ts";
import { singles } from "./singles.ts";
import type { MailboxRef, SeedEmail } from "./types.ts";

export { HOSTILE_HEADER, HOSTILE_LABEL } from "./hostile.ts";
export { LARGE_ATTACHMENT_BYTES, LARGE_MESSAGE_ID, INLINE_IMAGES_MESSAGE_ID } from "./singles.ts";

/** Every seeded message, in a stable order, deduped on (account, Message-ID). */
export function allEmails(): SeedEmail[] {
  const all = [...conversations(), ...newsletters(), ...singles(), ...hostile(), ...bulk()];
  const seen = new Set<string>();
  for (const e of all) {
    const key = `${e.account}:${e.messageId}`;
    if (seen.has(key)) throw new Error(`duplicate Message-ID in the seed: ${key} (${e.key})`);
    seen.add(key);
  }
  return all;
}

// -------------------------------------------------------------------- manifest

/** The labels the manifest reports, per account: roles, then user-label paths. */
const LABELS: Record<SeedEmail["account"], MailboxRef[]> = {
  alice: ["inbox", "sent", "drafts", "junk", "trash", "archive", "label:Work", "label:Work/Clients", "label:Receipts", "label:Travel", `label:${HOSTILE_LABEL}`],
  bob: ["inbox", "sent", "drafts", "junk", "trash", "archive"],
};

export interface LabelCounts {
  messages: number;
  threads: number;
  unreadMessages: number;
  unreadThreads: number;
  starredMessages: number;
}

export interface AccountManifest {
  email: string;
  totalMessages: number;
  totalThreads: number;
  labels: Record<string, LabelCounts>;
}

export interface Manifest {
  /** Bumped when the shape changes, so a stale manifest is obvious. */
  version: number;
  anchor: string;
  generatedFrom: string;
  hostile: {
    label: string;
    header: string;
    fixtures: Array<{ slug: string; messageId: string; file: string }>;
  };
  accounts: Record<SeedEmail["account"], AccountManifest>;
}

const EMAIL = { alice: "alice@postern.test", bob: "bob@postern.test" } as const;

function unread(e: SeedEmail): boolean {
  return !e.keywords.includes("$seen");
}
function starred(e: SeedEmail): boolean {
  return e.keywords.includes("$flagged");
}

function countLabel(emails: SeedEmail[], label: MailboxRef): LabelCounts {
  const here = emails.filter((e) => e.mailboxes.includes(label));
  const threads = new Set(here.map((e) => e.thread));
  const unreadThreads = new Set(here.filter(unread).map((e) => e.thread));
  return {
    messages: here.length,
    threads: threads.size,
    unreadMessages: here.filter(unread).length,
    unreadThreads: unreadThreads.size,
    starredMessages: here.filter(starred).length,
  };
}

/** The label key used in the manifest: a role name, or the user-label path. */
export function labelKey(label: MailboxRef): string {
  return label.startsWith("label:") ? label.slice("label:".length) : label;
}

export function buildManifest(): Manifest {
  const emails = allEmails();
  const accounts = {} as Record<SeedEmail["account"], AccountManifest>;
  for (const account of ["alice", "bob"] as const) {
    const mine = emails.filter((e) => e.account === account);
    const labels: Record<string, LabelCounts> = {};
    for (const label of LABELS[account]) labels[labelKey(label)] = countLabel(mine, label);
    accounts[account] = {
      email: EMAIL[account],
      totalMessages: mine.length,
      totalThreads: new Set(mine.map((e) => e.thread)).size,
      labels,
    };
  }
  return {
    version: 1,
    anchor: "2026-10-01T09:00:00.000Z",
    generatedFrom: "dev/seed.ts --write-manifest",
    hostile: {
      label: HOSTILE_LABEL,
      header: HOSTILE_HEADER,
      fixtures: hostileFixtures().map((f) => ({ slug: f.slug, messageId: f.messageId, file: `hostile/${f.file}` })),
    },
    accounts,
  };
}

/** The labels a manifest reports for an account, as refs (for the verifier). */
export function accountLabels(account: SeedEmail["account"]): MailboxRef[] {
  return LABELS[account];
}
