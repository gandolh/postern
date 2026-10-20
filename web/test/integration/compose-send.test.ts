// Brief 08 against the dev Stalwart: alice writes to bob with an attachment
// and an inline image (multipart/mixed > alternative > related), the draft is
// replaced on each save, the submission files it in Sent; bob receives it
// with the same bytes, replies, alice forwards with the original's
// attachments, and every copy sits in one conversation in both mailboxes.
// Everything the test creates is destroyed again, and the counts are checked
// against dev/seed/manifest.json.

import { buildDraftEmail, fetchUploadTransport, forwardAttachments, forwardSubject, JmapClient, replySubject, threadingHeaders, type Email, type Id, type Mailbox } from "@postern/jmap";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, basicAuth, live, manifest } from "../../../jmap/test/integration/live";
import { destroyDrafts, saveDraft } from "../../src/send/drafts";
import { submitDraft } from "../../src/send/submit";
import { uploadFile } from "../../src/send/upload";

const TAG = `B08IT${Date.now()}`;
const alice = { name: "Alice Archer", email: "alice@postern.test" };
const bob = { name: "Bob Baker", email: "bob@postern.test" };
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const NOTES = new TextEncoder().encode(`Notes for ${TAG}\nLine two: café\n`);

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

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

async function counts(client: JmapClient, roles: Roles) {
  const list = (await client.call("Mailbox/get", { ids: [roles.inbox, roles.drafts, roles.sent], properties: ["totalEmails", "totalThreads", "unreadThreads", "role"] })).list;
  return Object.fromEntries(list.map((m) => [m.role, { messages: m.totalEmails, threads: m.totalThreads, unreadThreads: m.unreadThreads }]));
}

async function find(client: JmapClient, subjectWord: string): Promise<Email[]> {
  const res = await client.email.queryAndGet(
    { filter: { subject: subjectWord }, sort: [{ property: "receivedAt", isAscending: true }] },
    { properties: ["id", "threadId", "mailboxIds", "keywords", "subject", "messageId", "inReplyTo", "references", "attachments", "bodyStructure", "from", "to"] },
  );
  return res.list;
}

async function waitFor<T>(check: () => Promise<T | undefined>, what: string, timeoutMs = 15_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe.skipIf(!live)("against the dev Stalwart: compose and send", () => {
  let a: JmapClient;
  let b: JmapClient;
  let aRoles: Roles;
  let bRoles: Roles;
  let aliceIdentity: Id;
  let bobIdentity: Id;
  let aliceSent: Email;
  let bobCopy: Email;

  beforeAll(async () => {
    a = new JmapClient({ baseUrl: BASE, auth: basicAuth("alice") });
    b = new JmapClient({ baseUrl: BASE, auth: basicAuth("bob") });
    await Promise.all([a.connect(), b.connect()]);
    [aRoles, bRoles] = await Promise.all([rolesOf(a), rolesOf(b)]);
    aliceIdentity = (await a.identity.get()).list.find((i) => i.email === alice.email)!.id;
    bobIdentity = (await b.identity.get()).list.find((i) => i.email === bob.email)!.id;
    const start = await counts(a, aRoles);
    expect(start["inbox"]).toEqual({ messages: manifest.accounts.alice.labels["inbox"]!.messages, threads: manifest.accounts.alice.labels["inbox"]!.threads, unreadThreads: manifest.accounts.alice.labels["inbox"]!.unreadThreads });
  });

  afterAll(async () => {
    if (!a || !b) return;
    for (const [client, roles, account] of [[a, aRoles, "alice"], [b, bRoles, "bob"]] as const) {
      const ids = (await find(client, TAG)).map((e) => e.id);
      if (ids.length) await client.call("Email/set", { destroy: ids });
      const subs = await client.call("EmailSubmission/get", { ids: null });
      if (subs.list.length) await client.call("EmailSubmission/set", { destroy: subs.list.map((s) => s.id) });
      const now = await counts(client, roles);
      const seeded = manifest.accounts[account].labels;
      expect(now["inbox"]?.messages).toBe(seeded["inbox"]!.messages);
      expect(now["inbox"]?.threads).toBe(seeded["inbox"]!.threads);
      expect(now["drafts"]?.messages).toBe(seeded["drafts"]!.messages);
      expect(now["sent"]?.messages).toBe(seeded["sent"]!.messages);
    }
  });

  it("saves a draft with an attachment and an inline image, replacing it on each save", async () => {
    const transport = fetchUploadTransport(fetch);
    const notes = await uploadFile(a, new Blob([NOTES], { type: "text/plain" }), { transport });
    const image = await uploadFile(a, new Blob([PNG], { type: "image/png" }), { transport });
    const content = {
      from: alice,
      to: [bob],
      cc: [],
      bcc: [],
      subject: `${TAG} plan`,
      html: `<div>Hello <b>Bob</b><img src="cid:dot@postern" alt="dot"></div>`,
      text: "Hello Bob [image: dot]",
      attachments: [{ blobId: notes.blobId, type: "text/plain", name: "notes.txt" }],
      inline: [{ blobId: image.blobId, type: "image/png", name: "dot.png", cid: "dot@postern" }],
      messageId: `${TAG.toLowerCase()}-1@postern.test`,
    };
    const first = await saveDraft(a, buildDraftEmail({ ...content, text: "first" }, { draftsMailboxId: aRoles.drafts }), []);
    const second = await saveDraft(a, buildDraftEmail(content, { draftsMailboxId: aRoles.drafts }), [first.id]);
    expect(second.threadId).toBe(first.threadId);
    const copies = await find(a, TAG);
    expect(copies.map((e) => e.id)).toEqual([second.id]);
    expect(copies[0]?.keywords).toEqual({ $draft: true, $seen: true });
    const structure = JSON.stringify(copies[0]?.bodyStructure);
    expect(structure).toMatch(/multipart\/mixed.*multipart\/alternative.*text\/plain.*multipart\/related.*text\/html.*image\/png.*dot@postern.*notes\.txt/);

    await submitDraft(a, { emailId: second.id, identityId: aliceIdentity, draftsMailboxId: aRoles.drafts, sentMailboxId: aRoles.sent });
    aliceSent = (await find(a, TAG))[0]!;
    expect(aliceSent.mailboxIds).toEqual({ [aRoles.sent]: true });
    expect(aliceSent.keywords["$draft"]).toBeUndefined();
  });

  it("reaches bob with the same bytes", async () => {
    bobCopy = await waitFor(async () => (await find(b, TAG))[0], "bob's copy");
    expect(bobCopy.mailboxIds).toEqual({ [bRoles.inbox]: true });
    const files = new Map<string, string>();
    for (const part of bobCopy.attachments ?? []) {
      const res = await b.blob.download({ blobId: part.blobId!, name: part.name ?? "x", type: part.type });
      files.set(part.name ?? "", sha(new Uint8Array(await res.arrayBuffer())));
    }
    expect(files.get("notes.txt")).toBe(sha(NOTES));
    expect(files.get("dot.png")).toBe(sha(PNG));
  });

  it("threads bob's reply and alice's forward in both mailboxes", async () => {
    const reply = threadingHeaders(bobCopy);
    const bobDraft = await saveDraft(
      b,
      buildDraftEmail(
        { from: bob, to: [alice], cc: [], bcc: [], subject: replySubject(bobCopy.subject), html: "<div>Got it</div>", text: "Got it", attachments: [], inReplyTo: reply.inReplyTo, references: reply.references, messageId: `${TAG.toLowerCase()}-2@postern.test` },
        { draftsMailboxId: bRoles.drafts },
      ),
      [],
    );
    await submitDraft(b, { emailId: bobDraft.id, identityId: bobIdentity, draftsMailboxId: bRoles.drafts, sentMailboxId: bRoles.sent });
    const aliceGotReply = await waitFor(async () => (await find(a, TAG)).find((e) => e.mailboxIds[aRoles.inbox]), "the reply at alice's");
    expect(aliceGotReply.threadId).toBe(aliceSent.threadId);

    const forward = threadingHeaders(aliceSent);
    const fwd = await saveDraft(
      a,
      buildDraftEmail(
        { from: alice, to: [bob], cc: [], bcc: [], subject: forwardSubject(aliceSent.subject), html: "<div>Again</div>", text: "Again", attachments: forwardAttachments(aliceSent.attachments), inReplyTo: forward.inReplyTo, references: forward.references, messageId: `${TAG.toLowerCase()}-3@postern.test` },
        { draftsMailboxId: aRoles.drafts },
      ),
      [],
    );
    await submitDraft(a, { emailId: fwd.id, identityId: aliceIdentity, draftsMailboxId: aRoles.drafts, sentMailboxId: aRoles.sent });
    const bobAll = await waitFor(async () => {
      const list = await find(b, TAG);
      return list.length === 3 ? list : undefined;
    }, "the forward at bob's");
    expect(new Set(bobAll.map((e) => e.threadId))).toEqual(new Set([bobCopy.threadId]));
    const bobForward = bobAll.find((e) => e.subject?.startsWith("Fwd:"))!;
    expect((bobForward.attachments ?? []).map((p) => p.name).sort()).toEqual(["dot.png", "notes.txt"]);
    const aliceAll = await find(a, TAG);
    expect(aliceAll).toHaveLength(3);
    expect(new Set(aliceAll.map((e) => e.threadId))).toEqual(new Set([aliceSent.threadId]));
  });

  it("sends nothing for a draft that is never submitted (what Undo leaves)", async () => {
    const held = await saveDraft(
      a,
      buildDraftEmail({ from: alice, to: [bob], cc: [], bcc: [], subject: `${TAG} held`, html: null, text: "never sent", attachments: [] }, { draftsMailboxId: aRoles.drafts }),
      [],
    );
    await new Promise((r) => setTimeout(r, 1500));
    expect((await find(b, TAG)).some((e) => e.subject?.endsWith("held"))).toBe(false);
    await destroyDrafts(a, [held.id]);
  });
});
