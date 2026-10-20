// Read-only checks against the dev Stalwart. Changes nothing on the server
// (uploaded blobs are temporary and expire unreferenced).

import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  findByRole,
  JmapClient,
  JmapMethodError,
  JmapRequestError,
  JmapUnauthorizedError,
  mailboxPath,
  type Mailbox,
} from "../../src/index.js";
import { BASE, devClient, live, manifest } from "./live.js";

describe.skipIf(!live)("against the dev Stalwart: reading", () => {
  let alice: JmapClient;
  let mailboxes: Mailbox[];

  beforeAll(async () => {
    alice = devClient("alice");
    await alice.connect();
    mailboxes = await alice.mailbox.all();
  });

  it("loads and rebases the session", () => {
    const s = alice.session;
    expect(s.accountId).toBe(s.raw.primaryAccounts["urn:ietf:params:jmap:mail"]);
    expect(s.username).toBe("alice@postern.test");
    expect(s.raw.apiUrl).toMatch(/^https:\/\/mail\.postern\.test\//);
    expect(s.apiUrl).toBe(`${BASE}/jmap/`);
    expect(s.uploadUrlFor()).toBe(`${BASE}/jmap/upload/${s.accountId}/`);
    expect(s.limits).toMatchObject({ maxCallsInRequest: 16, maxObjectsInGet: 500, maxObjectsInSet: 500, maxConcurrentUpload: 4 });
    expect(s.state).toMatch(/\S/);
  });

  it("lists alice's labels: system ones by role, with the seeded counts", () => {
    const expected = manifest.accounts.alice.labels;
    for (const role of ["inbox", "sent", "drafts", "junk", "trash", "archive"]) {
      const mailbox = findByRole(mailboxes, role);
      const counts = expected[role];
      expect(mailbox, role).toBeDefined();
      expect({ role, messages: mailbox?.totalEmails, threads: mailbox?.totalThreads }).toEqual({
        role,
        messages: counts?.messages,
        threads: counts?.threads,
      });
    }
    expect(findByRole(mailboxes, "inbox")?.totalThreads).toBe(2035);
  });

  it("lists alice's user labels, Work/Clients nested under Work", () => {
    const expected = manifest.accounts.alice.labels;
    const byPath = new Map(mailboxes.map((m) => [mailboxPath(m, mailboxes), m]));
    for (const path of ["Work", "Work/Clients", "Receipts", "Travel", "Hostile"]) {
      const mailbox = byPath.get(path);
      expect(mailbox, path).toBeDefined();
      expect(mailbox?.role).toBeNull();
      expect({ path, messages: mailbox?.totalEmails, threads: mailbox?.totalThreads }).toEqual({
        path,
        messages: expected[path]?.messages,
        threads: expected[path]?.threads,
      });
    }
    expect(byPath.get("Work/Clients")?.parentId).toBe(byPath.get("Work")?.id);
  });

  it("queries conversations (collapseThreads) and gets one whole conversation in one request", async () => {
    const inbox = findByRole(mailboxes, "inbox");
    if (!inbox) throw new Error("no inbox");
    const r = alice.request();
    const q = r.call("Email/query", {
      filter: { inMailbox: inbox.id },
      sort: [{ property: "receivedAt", isAscending: false }],
      collapseThreads: true,
      calculateTotal: true,
      limit: 100,
    });
    const g = r.call("Email/get", { ids: q.ref("/ids"), properties: ["threadId"] });
    const t = r.call("Thread/get", { ids: g.ref("/list/*/threadId") });
    const res = await r.send();
    expect(res.get(q).total).toBe(2035);
    expect(res.get(q).ids).toHaveLength(100);
    const threads = res.get(t).list;
    expect(threads).toHaveLength(100);
    const conversation = threads.find((th) => th.emailIds.length > 1);
    if (!conversation) throw new Error("no multi-message conversation in the first 100");

    const messages = await alice.email.get({
      ids: conversation.emailIds,
      properties: ["threadId", "subject", "from", "receivedAt", "bodyValues", "textBody", "htmlBody", "preview"],
      fetchTextBodyValues: true,
      fetchHTMLBodyValues: true,
      maxBodyValueBytes: 256,
    });
    expect(messages.list.map((m) => m.id).sort()).toEqual([...conversation.emailIds].sort());
    for (const m of messages.list) {
      expect(m.threadId).toBe(conversation.id);
      const parts = [...m.textBody, ...m.htmlBody].map((p) => p.partId).filter((p): p is string => p !== null);
      expect(parts.some((p) => m.bodyValues[p] !== undefined)).toBe(true);
      for (const value of Object.values(m.bodyValues)) expect(new TextEncoder().encode(value.value).byteLength).toBeLessThanOrEqual(256 + 4);
    }
  });

  it("highlights search hits with SearchSnippet", async () => {
    const r = alice.request();
    const q = r.call("Email/query", { filter: { text: "Lisbon" }, limit: 2 });
    const s = r.call("SearchSnippet/get", { filter: { text: "Lisbon" }, emailIds: q.ref("/ids") });
    const res = await r.send();
    expect(res.get(s).list.length).toBeGreaterThan(0);
    expect(res.get(s).list[0]?.subject).toContain("<mark>");
  });

  it("splits a big Email/get over maxObjectsInGet", async () => {
    const all = await alice.email.query({ limit: 700 });
    expect(all.ids).toHaveLength(700);
    const got = await alice.email.get({ ids: all.ids, properties: ["id"] });
    expect(got.list).toHaveLength(700);
  });

  it("splits 20 calls over maxCallsInRequest", async () => {
    const r = alice.request();
    const handles = Array.from({ length: 20 }, () => r.call("Mailbox/get", { ids: [] }));
    const res = await r.send();
    expect(new Set(handles.map((h) => res.get(h).state)).size).toBe(1);
  });

  it("reads identities, the vacation responder, quotas, address books", async () => {
    const identities = await alice.identity.get();
    expect(identities.list.some((i) => i.email === "alice@postern.test")).toBe(true);
    expect((await alice.vacationResponse.get()).id).toBe("singleton");
    expect(Array.isArray((await alice.quota.get()).list)).toBe(true);
    expect((await alice.addressBook.get()).list.some((b) => b.isDefault)).toBe(true);
    expect(Array.isArray((await alice.contactCard.query()).ids)).toBe(true);
    expect(Array.isArray((await alice.pushSubscription.get()).list)).toBe(true);
  });

  it("validates Sieve without storing it", async () => {
    expect(await alice.sieveScript.validateSource('require "fileinto";\nif header :contains "subject" "x" { fileinto "Work"; }\n')).toBeNull();
    expect((await alice.sieveScript.validateSource("if foo bar"))?.type).toBe("invalidScript");
  });

  it("uploads a blob and downloads it back", async () => {
    const text = `postern brief 03 upload check ${Date.now()}`;
    const progress: number[] = [];
    const up = await alice.blob.upload(text, { type: "text/plain", onProgress: (p) => progress.push(p.loaded) });
    expect(up.blobId).toMatch(/\S/);
    expect(up.size).toBe(text.length);
    expect(progress).toEqual([0, text.length]);
    const res = await alice.blob.download({ blobId: up.blobId, name: "check.txt", type: "text/plain" });
    expect(await res.text()).toBe(text);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="check.txt"');
    expect(res.headers.get("content-type")).toBe("text/plain");
  });

  it("resolves cid: images to blobs that download as PNGs", async () => {
    const { list } = await alice.email.queryAndGet(
      { filter: { subject: "Photos from the offsite" }, limit: 1 },
      { properties: ["bodyStructure", "attachments"] },
    );
    const email = list[0];
    if (!email) throw new Error("seed message missing");
    const urls = alice.blob.cidUrls(email);
    expect([...urls.keys()]).toEqual(["offsite-1@postern.test", "offsite-2@postern.test"]);
    const res = await alice.fetch(urls.get("offsite-1@postern.test") ?? "");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("maps live errors: method, request and auth", async () => {
    const err = await alice.email.changes("garbage").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JmapMethodError);
    expect((err as JmapMethodError).type).toBe("invalidArguments");

    const tooMany = {
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: Array.from({ length: 17 }, (_, i): [string, Record<string, unknown>, string] => ["Mailbox/get", { accountId: alice.accountId, ids: [] }, String(i)]),
    };
    const limit = await alice.post(alice.session, tooMany).catch((e: unknown) => e);
    expect(limit).toBeInstanceOf(JmapRequestError);
    expect(limit).toMatchObject({ errorType: "limit", limit: "maxCallsInRequest" });

    // No credentials rather than wrong ones: no failed sign-in is recorded.
    const onUnauthorized = vi.fn(() => false);
    const anonymous = new JmapClient({ baseUrl: BASE, auth: { authorization: () => "", onUnauthorized } });
    await expect(anonymous.connect()).rejects.toBeInstanceOf(JmapUnauthorizedError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
