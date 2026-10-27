// Brief 23 against the dev Stalwart: alice schedules two messages to bob 20 s
// ahead with HOLDUNTIL and cancels one. Both wait as $scheduled drafts and the
// Scheduled list shows them; bob has neither before the time; the kept one
// arrives at the time, not before, and the reconciler files it in Sent; the
// canceled one never arrives and is a plain draft again. Everything it makes
// is destroyed afterwards and the counts are checked against
// dev/seed/manifest.json.

import { buildDraftEmail, JmapClient, type Email, type Id, type Mailbox } from "@postern/jmap";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, basicAuth, live, manifest } from "../../../jmap/test/integration/live";
import { saveDraft } from "../../src/send/drafts";
import { cancelScheduled, listScheduled, maxDelayedSendMs, reconcileScheduled, SCHEDULED, scheduleDraft, type Scheduled } from "../../src/send/schedule";

const TAG = `B23IT${Date.now()}`;
const alice = { name: "Alice Archer", email: "alice@postern.test" };
const bob = { name: "Bob Baker", email: "bob@postern.test" };
const AHEAD_MS = 20_000;

interface Roles {
  inbox: Id;
  drafts: Id;
  sent: Id;
}

async function rolesOf(client: JmapClient): Promise<Roles> {
  const list = (await client.call("Mailbox/get", { ids: null })).list as Mailbox[];
  const by = (role: string) => list.find((m) => m.role === role)!.id;
  return { inbox: by("inbox"), drafts: by("drafts"), sent: by("sent") };
}

async function find(client: JmapClient, word: string): Promise<Email[]> {
  const res = await client.email.queryAndGet({ filter: { subject: word } }, { properties: ["id", "mailboxIds", "keywords", "subject", "receivedAt"] });
  return res.list;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!live)("against the dev Stalwart: schedule send", () => {
  let a: JmapClient;
  let b: JmapClient;
  let aRoles: Roles;
  let identityId: Id;
  const mine: Id[] = [];

  beforeAll(async () => {
    a = new JmapClient({ baseUrl: BASE, auth: basicAuth("alice") });
    b = new JmapClient({ baseUrl: BASE, auth: basicAuth("bob") });
    await Promise.all([a.connect(), b.connect()]);
    aRoles = await rolesOf(a);
    identityId = (await a.identity.get()).list.find((i) => i.email === alice.email)!.id;
  });

  afterAll(async () => {
    if (!a || !b) return;
    if (mine.length) await a.call("EmailSubmission/set", { destroy: mine });
    for (const client of [a, b]) {
      const ids = (await find(client, TAG)).map((e) => e.id);
      if (ids.length) await client.call("Email/set", { destroy: ids });
    }
    const list = (await a.call("Mailbox/get", { ids: [aRoles.inbox, aRoles.drafts, aRoles.sent], properties: ["totalEmails", "role"] })).list;
    const seeded = manifest.accounts.alice.labels;
    for (const role of ["inbox", "drafts", "sent"] as const) expect(list.find((m) => m.role === role)?.totalEmails).toBe(seeded[role]!.messages);
  });

  it("holds a message until its time, cancels another, and files the one that went in Sent", { timeout: 90_000 }, async () => {
    expect(maxDelayedSendMs(a)).toBeGreaterThan(0);
    const draft = async (name: string) =>
      saveDraft(
        a,
        buildDraftEmail(
          { from: alice, to: [bob], cc: [], bcc: [], subject: `${TAG} ${name}`, html: `<div>${name}</div>`, text: name, attachments: [], messageId: `${TAG.toLowerCase()}-${name}@postern.test` },
          { draftsMailboxId: aRoles.drafts },
        ),
        [],
      );
    const kept = await draft("kept");
    const dropped = await draft("dropped");
    const at = new Date(Date.now() + AHEAD_MS);
    const schedule = async (emailId: Id): Promise<Scheduled> => {
      const s = await scheduleDraft(a, { emailId, identityId, from: alice.email, at });
      mine.push(s.submissionId);
      return s;
    };
    const one = await schedule(kept.id);
    const two = await schedule(dropped.id);
    expect(Date.parse(one.sendAt)).toBeGreaterThanOrEqual(at.getTime() - 1000);

    const waiting = await listScheduled(a);
    expect(waiting.filter((m) => m.subject.startsWith(TAG)).map((m) => m.emailId).sort()).toEqual([kept.id, dropped.id].sort());
    expect((await find(a, TAG)).every((e) => e.keywords[SCHEDULED] === true && e.mailboxIds[aRoles.drafts] === true)).toBe(true);

    expect(await cancelScheduled(a, two.submissionId, dropped.id)).toBe("canceled");
    // Not yet: the time has not come.
    expect((await reconcileScheduled(a, aRoles)).next).toBe(Date.parse(one.sendAt));
    await sleep(5_000);
    expect(await find(b, TAG)).toEqual([]);

    // It arrives at its time, not before.
    let arrived: Email | undefined;
    for (const end = Date.now() + 60_000; !arrived && Date.now() < end; await sleep(1_000)) arrived = (await find(b, TAG))[0];
    expect(arrived?.subject).toBe(`${TAG} kept`);
    expect(Date.parse(arrived!.receivedAt)).toBeGreaterThanOrEqual(Date.parse(one.sendAt) - 1_000);

    const result = await reconcileScheduled(a, aRoles);
    expect(result.filed).toContain(kept.id);
    const after = new Map((await find(a, TAG)).map((e) => [e.id, e]));
    expect(after.get(kept.id)?.mailboxIds).toEqual({ [aRoles.sent]: true });
    expect(after.get(kept.id)?.keywords).toEqual({ $seen: true });
    expect(after.get(dropped.id)?.mailboxIds).toEqual({ [aRoles.drafts]: true });
    expect(after.get(dropped.id)?.keywords).toEqual({ $draft: true, $seen: true });

    // The canceled one never comes.
    await sleep(5_000);
    expect((await find(b, TAG)).map((e) => e.subject)).toEqual([`${TAG} kept`]);
  });
});
