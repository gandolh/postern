// The dev Stalwart from Node, for the global setup and the specs: find the
// hostile fixtures, and put alice's mailbox back the way the run found it.
// Basic auth with the password from dev/.env (dev/lib.ts); nothing here is
// printed. Never resets or restarts the server.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./env.ts";

const STALWART = (process.env.POSTERN_DEV_API ?? "http://127.0.0.1:18080").replace(/\/+$/, "");

export type AccountName = "alice" | "bob";

const ACCOUNTS: Record<AccountName, { email: string; passwordKey: string }> = {
  alice: { email: "alice@postern.test", passwordKey: "ALICE_PASSWORD" },
  bob: { email: "bob@postern.test", passwordKey: "BOB_PASSWORD" },
};

export function address(name: AccountName): string {
  return ACCOUNTS[name].email;
}

let envLoaded = false;

/** The account's password from dev/.env. Handle it as a secret: never log it or put it in an assertion message. */
export function password(name: AccountName): string {
  if (!envLoaded) {
    process.loadEnvFile(join(REPO_ROOT, "dev/.env"));
    envLoaded = true;
  }
  const value = process.env[ACCOUNTS[name].passwordKey];
  if (!value) throw new Error(`dev/.env has no ${ACCOUNTS[name].passwordKey}; run \`npm run dev:mail\``);
  return value;
}

const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission"];

/** Raw JMAP with Basic auth, for setup and restore only. */
export class DevJmap {
  readonly accountId: string;
  readonly #auth: string;

  constructor(accountId: string, auth: string) {
    this.accountId = accountId;
    this.#auth = auth;
  }

  static async connect(name: AccountName): Promise<DevJmap> {
    const auth = `Basic ${Buffer.from(`${address(name)}:${password(name)}`).toString("base64")}`;
    const res = await fetch(`${STALWART}/jmap/session`, { headers: { authorization: auth } });
    if (!res.ok) throw new Error(`GET /jmap/session as ${address(name)}: HTTP ${res.status}`);
    const session = (await res.json()) as { primaryAccounts?: Record<string, string> };
    const accountId = session.primaryAccounts?.["urn:ietf:params:jmap:mail"];
    if (!accountId) throw new Error(`no mail account for ${address(name)}; is dev/ set up with this dev/.env?`);
    return new DevJmap(accountId, auth);
  }

  /** One method call; its arguments. Throws on a method error. */
  async one<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${STALWART}/jmap/`, {
      method: "POST",
      headers: { authorization: this.#auth, "content-type": "application/json" },
      body: JSON.stringify({ using: USING, methodCalls: [[name, { accountId: this.accountId, ...args }, "0"]] }),
    });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const body = (await res.json()) as { methodResponses: [string, T, string][] };
    const first = body.methodResponses[0];
    if (!first || first[0] === "error") throw new Error(`${name}: ${JSON.stringify(first?.[1])}`);
    return first[1];
  }
}

const connections = new Map<AccountName, Promise<DevJmap>>();

export function devJmap(name: AccountName = "alice"): Promise<DevJmap> {
  let pending = connections.get(name);
  if (!pending) {
    pending = DevJmap.connect(name);
    connections.set(name, pending);
  }
  return pending;
}

interface Manifest {
  hostile: { label: string; header: string; fixtures: { slug: string; messageId: string; file: string }[] };
  accounts: Record<string, { labels: Record<string, { messages: number; threads: number; unreadThreads: number }> }>;
}

export function manifest(): Manifest {
  return JSON.parse(readFileSync(join(REPO_ROOT, "dev/seed/manifest.json"), "utf8")) as Manifest;
}

export interface HostileFixture {
  slug: string;
  threadId: string;
  emailId: string;
}

export interface HostileSet {
  /** The Hostile label's mailbox id. */
  labelId: string;
  bySlug: Map<string, HostileFixture>;
}

let hostile: Promise<HostileSet> | undefined;

/** alice's Hostile label and each fixture's conversation, found by the X-Postern-Fixture header. */
export function hostileSet(): Promise<HostileSet> {
  hostile ??= (async () => {
    const jmap = await devJmap("alice");
    const boxes = await jmap.one<{ list: { id: string; name: string; parentId: string | null }[] }>("Mailbox/get", { ids: null, properties: ["name", "parentId"] });
    const label = boxes.list.find((b) => b.name === manifest().hostile.label && b.parentId === null);
    if (!label) throw new Error("alice has no Hostile label; is dev/ seeded?");
    const query = await jmap.one<{ ids: string[] }>("Email/query", { filter: { inMailbox: label.id }, limit: 100 });
    const got = await jmap.one<{ list: { id: string; threadId: string; "header:X-Postern-Fixture:asText": string | null }[] }>("Email/get", {
      ids: query.ids,
      properties: ["threadId", "header:X-Postern-Fixture:asText"],
    });
    const bySlug = new Map<string, HostileFixture>();
    for (const e of got.list) {
      const slug = (e["header:X-Postern-Fixture:asText"] ?? "").trim().replace(/^hostile\//, "");
      if (slug) bySlug.set(slug, { slug, threadId: e.threadId, emailId: e.id });
    }
    for (const f of manifest().hostile.fixtures) {
      if (!bySlug.has(f.slug)) throw new Error(`hostile fixture ${f.slug} is not in alice's Hostile label`);
    }
    return { labelId: label.id, bySlug };
  })();
  return hostile;
}

// ---- Leaving dev as we found it -------------------------------------------

/** A conversation in alice's mailbox by its exact subject (the seed's subjects are unique). */
export async function threadBySubject(subject: string): Promise<{ threadId: string; emailIds: string[] }> {
  const jmap = await devJmap("alice");
  const query = await jmap.one<{ ids: string[] }>("Email/query", { filter: { subject }, limit: 20 });
  const got = await jmap.one<{ list: { id: string; threadId: string; subject: string }[] }>("Email/get", { ids: query.ids, properties: ["threadId", "subject"] });
  const hit = got.list.find((e) => e.subject === subject);
  if (!hit) throw new Error(`no message with the subject "${subject}" in alice's mailbox`);
  return { threadId: hit.threadId, emailIds: got.list.filter((e) => e.threadId === hit.threadId).map((e) => e.id) };
}

/** A label's mailbox id by name (top level). */
export async function labelId(name: string): Promise<string> {
  const jmap = await devJmap("alice");
  const boxes = await jmap.one<{ list: { id: string; name: string; parentId: string | null }[] }>("Mailbox/get", { ids: null, properties: ["name", "parentId"] });
  const box = boxes.list.find((b) => b.name === name && b.parentId === null);
  if (!box) throw new Error(`alice has no label ${name}`);
  return box.id;
}

interface IdentitySnapshot {
  id: string;
  name: string;
  textSignature: string;
  htmlSignature: string;
  replyTo: unknown;
}

export interface MailSnapshot {
  emailState: string;
  /** Every unread email id in alice's account. */
  unread: string[];
  counts: LabelCounts;
  identities: IdentitySnapshot[];
}

export interface LabelCounts {
  inbox: { messages: number; threads: number; unreadThreads: number };
  hostile: { messages: number; threads: number; unreadThreads: number };
}

async function allIds(jmap: DevJmap, filter: Record<string, unknown>): Promise<string[]> {
  const ids: string[] = [];
  for (let position = 0; ; ) {
    const page = await jmap.one<{ ids: string[] }>("Email/query", { filter, position, limit: 1000 });
    ids.push(...page.ids);
    if (page.ids.length < 1000) return ids;
    position += page.ids.length;
  }
}

export async function labelCounts(): Promise<LabelCounts> {
  const jmap = await devJmap("alice");
  const boxes = await jmap.one<{ list: { id: string; name: string; role: string | null; totalEmails: number; totalThreads: number; unreadThreads: number }[] }>(
    "Mailbox/get",
    { ids: null, properties: ["name", "role", "totalEmails", "totalThreads", "unreadThreads"] },
  );
  const pick = (b: { totalEmails: number; totalThreads: number; unreadThreads: number } | undefined) => ({
    messages: b?.totalEmails ?? -1,
    threads: b?.totalThreads ?? -1,
    unreadThreads: b?.unreadThreads ?? -1,
  });
  return {
    inbox: pick(boxes.list.find((b) => b.role === "inbox")),
    hostile: pick(boxes.list.find((b) => b.name === manifest().hostile.label)),
  };
}

/** What the seed promises: alice's Inbox and Hostile counts from dev/seed/manifest.json. */
export function manifestCounts(): LabelCounts {
  const labels = manifest().accounts["alice"]?.labels ?? {};
  const pick = (l: { messages: number; threads: number; unreadThreads: number } | undefined) => ({
    messages: l?.messages ?? -1,
    threads: l?.threads ?? -1,
    unreadThreads: l?.unreadThreads ?? -1,
  });
  return { inbox: pick(labels["inbox"]), hostile: pick(labels[manifest().hostile.label]) };
}

export async function snapshotMail(): Promise<MailSnapshot> {
  const jmap = await devJmap("alice");
  const state = await jmap.one<{ state: string }>("Email/get", { ids: [], properties: ["id"] });
  const unread = await allIds(jmap, { notKeyword: "$seen" });
  const identities = await jmap.one<{ list: IdentitySnapshot[] }>("Identity/get", { ids: null, properties: ["name", "textSignature", "htmlSignature", "replyTo"] });
  return { emailState: state.state, unread, counts: await labelCounts(), identities: identities.list };
}

export interface RestoreReport {
  markedUnread: number;
  draftsRemoved: number;
  identitiesRestored: number;
  /** Mail the run created that is not a draft: left alone, reported. */
  unexpected: string[];
}

/** Put alice's mailbox back: unread what the run read, destroy drafts it saved. */
export async function restoreMail(snapshot: MailSnapshot): Promise<RestoreReport> {
  const jmap = await devJmap("alice");
  const report: RestoreReport = { markedUnread: 0, draftsRemoved: 0, identitiesRestored: 0, unexpected: [] };

  // Identities (the signature preview in settings writes one, then clears it).
  const now = await jmap.one<{ list: IdentitySnapshot[] }>("Identity/get", { ids: null, properties: ["name", "textSignature", "htmlSignature", "replyTo"] });
  const update: Record<string, Partial<IdentitySnapshot>> = {};
  for (const before of snapshot.identities) {
    const after = now.list.find((i) => i.id === before.id);
    if (!after) continue;
    const fields = (i: IdentitySnapshot) => ({ name: i.name, textSignature: i.textSignature, htmlSignature: i.htmlSignature, replyTo: i.replyTo });
    if (JSON.stringify(fields(after)) !== JSON.stringify(fields(before))) update[before.id] = fields(before);
  }
  if (Object.keys(update).length > 0) {
    await jmap.one("Identity/set", { update });
    report.identitiesRestored = Object.keys(update).length;
  }

  // What the run created, from the changes since the snapshot.
  const created: string[] = [];
  for (let since = snapshot.emailState; ; ) {
    const changes = await jmap.one<{ created: string[]; newState: string; hasMoreChanges: boolean }>("Email/changes", {
      sinceState: since,
      maxChanges: 500,
    });
    created.push(...changes.created);
    if (!changes.hasMoreChanges) break;
    since = changes.newState;
  }
  if (created.length > 0) {
    const got = await jmap.one<{ list: { id: string; keywords: Record<string, boolean> }[] }>("Email/get", { ids: created, properties: ["keywords"] });
    const drafts = got.list.filter((e) => e.keywords["$draft"] === true).map((e) => e.id);
    report.unexpected = got.list.filter((e) => e.keywords["$draft"] !== true).map((e) => e.id);
    if (drafts.length > 0) {
      await jmap.one("Email/set", { destroy: drafts });
      report.draftsRemoved = drafts.length;
    }
  }

  // What the run read.
  const wasUnread = snapshot.unread;
  for (let i = 0; i < wasUnread.length; i += 500) {
    const ids = wasUnread.slice(i, i + 500);
    const got = await jmap.one<{ list: { id: string; keywords: Record<string, boolean> }[] }>("Email/get", { ids, properties: ["keywords"] });
    const read = got.list.filter((e) => e.keywords["$seen"] === true).map((e) => e.id);
    if (read.length === 0) continue;
    const update: Record<string, Record<string, null>> = {};
    for (const id of read) update[id] = { "keywords/$seen": null };
    await jmap.one("Email/set", { update });
    report.markedUnread += read.length;
  }
  return report;
}

/** Mark one conversation's emails unread again (a spec that opened it on purpose). */
export async function markUnread(emailIds: readonly string[]): Promise<void> {
  if (emailIds.length === 0) return;
  const jmap = await devJmap("alice");
  const update: Record<string, Record<string, null>> = {};
  for (const id of emailIds) update[id] = { "keywords/$seen": null };
  await jmap.one("Email/set", { update });
}
