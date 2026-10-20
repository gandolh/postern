// dev/seed.ts — fill the dev Stalwart with the fixtures in dev/seed/, over
// raw JMAP (brief 03's client does not exist yet). Run after `npm run
// dev:mail`:
//
//   node dev/seed.ts                 import everything, then verify the manifest
//   node dev/seed.ts --write-manifest regenerate dev/seed/manifest.json first
//   node dev/seed.ts --force          import even if mail is present (duplicates;
//                                     for a clean reseed use dev:mail:reset)
//
// Deterministic (fixed anchor date, seeded PRNG) and idempotent: it refuses to
// run twice unless --force, because every message already carries a stable
// Message-ID and a second import would duplicate.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNTS, Jmap, getMailboxes, loadDevEnv, mailboxPath } from "./lib.ts";
import type { DevAccount, MailboxInfo } from "./lib.ts";
import {
  accountLabels,
  allEmails,
  buildManifest,
  labelKey,
} from "./seed/fixtures.ts";
import type { LabelCounts, Manifest } from "./seed/fixtures.ts";
import type { MailboxRef, SeedEmail } from "./seed/types.ts";

const MANIFEST_PATH = join(import.meta.dirname, "seed", "manifest.json");
const IMPORT_BATCH = 100; // well under Jmap.setMaxObjects (500) and request size.
const UPLOAD_CONCURRENCY = 4; // the session's maxConcurrentUpload.

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const WRITE_MANIFEST = args.has("--write-manifest");

// --------------------------------------------------------------- manifest file

if (WRITE_MANIFEST) {
  const manifest = buildManifest();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${MANIFEST_PATH} (${manifest.accounts.alice.totalMessages} for alice, ${manifest.accounts.bob.totalMessages} for bob)`);
  // Generation needs no server; a seed run imports and then verifies.
  process.exit(0);
}

// ------------------------------------------------------------------ the import

loadDevEnv();

/** Resolve a MailboxRef to a mailbox id for one account. */
function resolver(mailboxes: MailboxInfo[]): (ref: MailboxRef) => string {
  const byRole = new Map(mailboxes.filter((m) => m.role).map((m) => [m.role as string, m.id]));
  const byPath = new Map(mailboxes.map((m) => [mailboxPath(m, mailboxes), m.id]));
  return (ref) => {
    const id = ref.startsWith("label:") ? byPath.get(ref.slice("label:".length)) : byRole.get(ref);
    if (!id) throw new Error(`no mailbox for ${ref}; run \`npm run dev:mail\` to create the labels`);
    return id;
  };
}

function totalMail(mailboxes: MailboxInfo[]): number {
  return mailboxes.reduce((n, m) => n + m.totalEmails, 0);
}

function alreadySeeded(mailboxes: MailboxInfo[]): boolean {
  // A freshly created account holds zero messages; the seed is the only thing
  // that puts mail in it. So any mail at all means a previous seed. A
  // Message-ID lookup would be exact, but Stalwart 0.16 does not index the
  // Message-ID header for `Email/query` (checked: a header filter returns
  // nothing), and scanning every message to find one is not worth it.
  return totalMail(mailboxes) > 0;
}

async function uploadAll(jmap: Jmap, emails: SeedEmail[]): Promise<Map<string, string>> {
  const blobs = new Map<string, string>();
  let next = 0;
  async function worker(): Promise<void> {
    while (next < emails.length) {
      const i = next++;
      const e = emails[i] as SeedEmail;
      blobs.set(e.key, await jmap.upload(toCrlfBytes(e.build()), "message/rfc822"));
      if ((i + 1) % 250 === 0) process.stdout.write(`    uploaded ${i + 1}/${emails.length}\r`);
    }
  }
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
  if (emails.length >= 250) process.stdout.write("\n");
  return blobs;
}

function toCrlfBytes(message: string): Uint8Array {
  return Buffer.from(message.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"), "latin1");
}

async function importAll(jmap: Jmap, emails: SeedEmail[], blobs: Map<string, string>, toId: (r: MailboxRef) => string): Promise<void> {
  for (let start = 0; start < emails.length; start += IMPORT_BATCH) {
    const batch = emails.slice(start, start + IMPORT_BATCH);
    const create: Record<string, unknown> = {};
    for (const e of batch) {
      const mailboxIds: Record<string, boolean> = {};
      for (const ref of e.mailboxes) mailboxIds[toId(ref)] = true;
      const keywords: Record<string, boolean> = {};
      for (const k of e.keywords) keywords[k] = true;
      create[e.key] = { blobId: blobs.get(e.key), mailboxIds, keywords, receivedAt: e.receivedAt.toISOString() };
    }
    const res = await jmap.one<{ created?: Record<string, unknown>; notCreated?: Record<string, { type: string }> }>(
      "Email/import",
      { emails: create },
    );
    if (res.notCreated && Object.keys(res.notCreated).length) {
      throw new Error(`Email/import failed for ${JSON.stringify(res.notCreated).slice(0, 500)}`);
    }
    process.stdout.write(`    imported ${Math.min(start + IMPORT_BATCH, emails.length)}/${emails.length}\r`);
  }
  process.stdout.write("\n");
}

async function seedAccount(account: DevAccount): Promise<boolean> {
  const jmap = await Jmap.connect(account);
  const mailboxes = await getMailboxes(jmap);
  if (!FORCE && alreadySeeded(mailboxes)) {
    console.log(`  ${account.email}: already has mail (${totalMail(mailboxes)} messages); skipping. Reset with \`npm run dev:mail:reset && npm run dev:mail\`, or re-run \`node dev/seed.ts --force\`.`);
    return false;
  }
  const mine = allEmails().filter((e) => e.account === account.name);
  console.log(`  ${account.email}: ${mine.length} messages`);
  const toId = resolver(mailboxes);
  // Resolve every ref up front so a bad label fails before any upload.
  for (const e of mine) for (const ref of e.mailboxes) toId(ref);
  const blobs = await uploadAll(jmap, mine);
  await importAll(jmap, mine, blobs, toId);
  return true;
}

// --------------------------------------------------------------- verification

/** The counts Stalwart reports for one account, label by label. */
async function serverCounts(jmap: Jmap): Promise<Record<string, LabelCounts>> {
  const mailboxes = await getMailboxes(jmap);
  const toId = resolver(mailboxes);
  const byId = new Map(mailboxes.map((m) => [m.id, m]));
  const out: Record<string, LabelCounts> = {};
  for (const ref of accountLabels(account(jmap))) {
    const id = toId(ref);
    const mb = byId.get(id) as MailboxInfo;
    const starred = await jmap.one<{ total: number }>("Email/query", {
      filter: { inMailbox: id, hasKeyword: "$flagged" },
      calculateTotal: true,
      limit: 0,
    });
    out[labelKey(ref)] = {
      messages: mb.totalEmails,
      threads: mb.totalThreads,
      unreadMessages: mb.unreadEmails,
      unreadThreads: mb.unreadThreads,
      starredMessages: starred.total,
    };
  }
  return out;
}

function account(jmap: Jmap): DevAccount["name"] {
  return jmap.account.name;
}

function diffCounts(label: string, expected: LabelCounts, actual: LabelCounts): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(expected) as Array<keyof LabelCounts>) {
    if (expected[key] !== actual[key]) problems.push(`${label}.${key}: manifest ${expected[key]} vs server ${actual[key]}`);
  }
  return problems;
}

async function verify(manifest: Manifest): Promise<boolean> {
  let ok = true;
  for (const acct of ACCOUNTS) {
    const jmap = await Jmap.connect(acct);
    const actual = await serverCounts(jmap);
    const expected = manifest.accounts[acct.name].labels;
    const problems: string[] = [];
    for (const label of Object.keys(expected)) {
      problems.push(...diffCounts(label, expected[label] as LabelCounts, actual[label] as LabelCounts));
    }
    if (problems.length) {
      ok = false;
      console.error(`  ${acct.email}: MISMATCH`);
      for (const p of problems) console.error(`    ${p}`);
    } else {
      const inbox = expected["inbox"] as LabelCounts;
      console.log(`  ${acct.email}: ok (Inbox ${inbox.messages} messages, ${inbox.threads} conversations)`);
    }
  }
  return ok;
}

// ----------------------------------------------------------------------- main

console.log("Seeding the dev mailboxes ...");
let imported = false;
for (const acct of ACCOUNTS) imported = (await seedAccount(acct)) || imported;

console.log("Verifying against dev/seed/manifest.json ...");
let manifest: Manifest;
try {
  const mod = await import("./seed/manifest.json", { with: { type: "json" } });
  manifest = mod.default as Manifest;
} catch {
  console.error("error: dev/seed/manifest.json is missing. Generate it with `node dev/seed.ts --write-manifest`.");
  process.exit(1);
}
const passed = await verify(manifest);
if (!passed) {
  if (imported) {
    // A fresh import must match the manifest exactly. It did not, so either the
    // fixtures changed without the manifest, or the seed has a bug.
    console.error(
      "\nA fresh import does not match the manifest. If you changed the fixtures, regenerate it alongside a clean reseed:\n" +
        "  npm run dev:mail:reset && npm run dev:mail && node dev/seed.ts --write-manifest\n" +
        "Otherwise this is a real bug in the seed; do not commit a manifest that does not match a clean import.",
    );
    process.exit(1);
  }
  // Nothing was imported this run, so the mailboxes have simply drifted since
  // they were seeded (mail delivered over SMTP, flags changed, messages moved
  // while developing). That is expected; restore the baseline when you need it.
  console.warn(
    "\nThe mailboxes have drifted from the manifest since they were seeded (this is normal while developing).\n" +
      "Restore the clean baseline with: npm run dev:mail:reset && npm run dev:mail && npm run dev:seed",
  );
  process.exit(0);
}
console.log("Done. The dev mailboxes match the manifest.");
