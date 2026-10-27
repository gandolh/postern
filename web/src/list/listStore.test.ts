import { afterEach, describe, expect, it, vi } from "vitest";
import { publishMailChange } from "../actions/bus";
import type { ConversationScope } from "../actions/conversation";
import { fakeEmail, FakeMail, inboxThreads, MAILBOXES, ROLES, type FakeEmail } from "../actions/fakeMail";
import { planArchive } from "../actions/plans";
import { ListStore } from "./listStore";
import type { ListQuery } from "./types";
import { queryKey } from "./useListStore";
import { labelListView } from "./view";

const scope: ConversationScope = { kind: "normal", roles: { ...ROLES } };
const inbox = labelListView({ view: "inbox", mailboxId: "a" }, ROLES)!.query;

const stores: ListStore[] = [];

async function setup(emails: FakeEmail[], query: ListQuery = inbox, options: { maxObjectsInGet?: number; conversationView?: boolean } = {}) {
  const { conversationView, ...server } = options;
  const mail = new FakeMail({ mailboxes: MAILBOXES, emails, ...server });
  const client = await mail.connect();
  const store = new ListStore(client, query, { accountId: () => "A", ...(conversationView === undefined ? {} : { conversationView }) });
  stores.push(store);
  return { mail, client, store };
}

async function settled(store: ListStore): Promise<void> {
  await vi.waitFor(() => expect(store.getSnapshot().status).not.toBe("loading"));
  // Let queued loads and refreshes finish.
  for (let i = 0; i < 5; i++) await store.refresh();
}

afterEach(() => {
  for (const s of stores.splice(0)) s.dispose();
});

describe("loading pages", () => {
  it("loads the first page in one request of four linked calls", async () => {
    const { mail, store } = await setup(inboxThreads(120));
    store.start();
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    expect(mail.calls()).toEqual([["Email/query", "Email/get", "Thread/get", "Email/get"]]);
    const [q, g, t, m] = mail.posts[0]!;
    // The Inbox puts woken conversations first (brief 24), then newest first.
    expect(q![1]).toMatchObject({
      filter: { inMailbox: "a" },
      sort: [
        { property: "hasKeyword", keyword: "$woken", isAscending: false },
        { property: "receivedAt", isAscending: false },
      ],
      collapseThreads: true,
      position: 0,
      limit: 50,
    });
    expect(g![1]["#ids"]).toEqual({ resultOf: "0", name: "Email/query", path: "/ids" });
    expect(t![1]["#ids"]).toEqual({ resultOf: "1", name: "Email/get", path: "/list/*/threadId" });
    expect(m![1]["#ids"]).toEqual({ resultOf: "2", name: "Thread/get", path: "/list/*/emailIds" });
    const snap = store.getSnapshot();
    expect(snap.rows).toHaveLength(50);
    expect(snap.total).toBe(120);
    expect(snap.complete).toBe(false);
    expect(snap.rows[0]).toMatchObject({ id: "t0", emailId: "m0", subject: "Subject m0", messages: [expect.objectContaining({ id: "m0" })] });
  });

  it("makes one request per further page, and none past the end", async () => {
    const { mail, store } = await setup(inboxThreads(120));
    store.start();
    await vi.waitFor(() => expect(store.getSnapshot().rows).toHaveLength(50));
    store.ensureLoaded(60);
    await vi.waitFor(() => expect(store.getSnapshot().rows).toHaveLength(100));
    store.ensureLoaded(1000);
    await vi.waitFor(() => expect(store.getSnapshot().complete).toBe(true));
    store.ensureLoaded(1000);
    await new Promise((r) => setTimeout(r, 10));
    expect(mail.posts).toHaveLength(3);
    expect(mail.posts.map((p) => p[0]![1]["position"])).toEqual([0, 50, 100]);
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(Array.from({ length: 120 }, (_, i) => `t${i}`));
  });

  it("shows a conversation's messages, oldest first, for senders and unread", async () => {
    const { store } = await setup([
      fakeEmail({ id: "1", threadId: "T", receivedAt: "2026-10-01T00:00:00Z" }),
      fakeEmail({ id: "2", threadId: "T", mailboxIds: { e: true }, receivedAt: "2026-10-02T00:00:00Z", from: [{ name: "Alice", email: "alice@postern.test" }] }),
    ]);
    store.start();
    await vi.waitFor(() => expect(store.getSnapshot().rows).toHaveLength(1));
    expect(store.getSnapshot().rows[0]!.messages.map((m) => m.id)).toEqual(["1", "2"]);
    expect(store.getSnapshot().rows[0]!.emailId).toBe("1");
  });

  it("fetches long conversations' messages in chunks when one get would pass maxObjectsInGet", async () => {
    const emails = Array.from({ length: 8 }, (_, i) => fakeEmail({ id: `e${i}`, threadId: "T", receivedAt: `2026-10-01T00:00:0${i}Z` }));
    const { mail, store } = await setup(emails, inbox, { maxObjectsInGet: 5 });
    store.start();
    await vi.waitFor(() => expect(store.getSnapshot().rows).toHaveLength(1));
    expect(store.getSnapshot().rows[0]!.messages).toHaveLength(8);
    expect(mail.calls()[1]).toEqual(["Email/get", "Email/get"]);
  });

  it("errors on a failed first page, and Try again loads it", async () => {
    const { mail, store } = await setup(inboxThreads(3));
    mail.failWith = () => "network";
    store.start();
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("error"));
    mail.failWith = null;
    store.retry();
    await vi.waitFor(() => expect(store.getSnapshot().rows).toHaveLength(3));
  });
});

describe("actions", () => {
  it("takes an archived row out at once, keeps it out once the server agrees, and undo brings it back in place", async () => {
    const { mail, client, store } = await setup(inboxThreads(5));
    store.start();
    await settled(store);
    const row = store.getSnapshot().rows[2]!;
    const plan = planArchive([row], scope);

    publishMailChange({ kind: "patch", update: plan.update });
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(["t0", "t1", "t3", "t4"]);
    expect(store.getSnapshot().total).toBe(4);

    await client.call("Email/set", { update: plan.update });
    publishMailChange({ kind: "settled" });
    await settled(store);
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(["t0", "t1", "t3", "t4"]);
    expect(store.getSnapshot().total).toBe(4);

    publishMailChange({ kind: "patch", update: plan.inverse });
    await client.call("Email/set", { update: plan.inverse });
    publishMailChange({ kind: "settled" });
    await settled(store);
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(store.getSnapshot().rows[2]!.messages[0]!.mailboxIds).toEqual({ a: true });
    expect(mail.emails.get("m2")!.mailboxIds).toEqual({ a: true });
  });

  it("keeps an archived row in All Mail, its labels changed", async () => {
    const all = labelListView({ view: "all", mailboxId: "h" }, ROLES)!.query;
    const { store } = await setup(inboxThreads(2), all);
    store.start();
    await settled(store);
    const plan = planArchive([store.getSnapshot().rows[0]!], scope);
    publishMailChange({ kind: "patch", update: plan.update });
    expect(store.getSnapshot().rows).toHaveLength(2);
    expect(store.getSnapshot().rows[0]!.messages[0]!.mailboxIds).toEqual({ h: true });
  });

  it("puts a row back when the action is rolled back", async () => {
    const { store } = await setup(inboxThreads(3));
    store.start();
    await settled(store);
    const plan = planArchive([store.getSnapshot().rows[0]!], scope);
    publishMailChange({ kind: "patch", update: plan.update });
    expect(store.getSnapshot().rows).toHaveLength(2);
    publishMailChange({ kind: "patch", update: plan.inverse });
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(["t0", "t1", "t2"]);
  });
});

describe("freshness", () => {
  it("adds new mail at the top with Email/changes and Email/queryChanges, keeping the rows held", async () => {
    const { mail, store } = await setup(inboxThreads(3));
    store.start();
    await settled(store);
    const before = store.getSnapshot().rows;
    mail.mutate((emails) => {
      emails.set("new", fakeEmail({ id: "new", threadId: "tn", receivedAt: "2026-10-05T00:00:00Z" }));
      return { created: ["new"] };
    });
    const sent = mail.posts.length;
    await store.refresh();
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(["tn", "t0", "t1", "t2"]);
    expect(store.getSnapshot().rows[1]).toBe(before[0]);
    expect(mail.calls().slice(sent)).toEqual([["Email/changes"], ["Email/get"], ["Email/queryChanges"], ["Email/get", "Thread/get", "Email/get"]]);
  });

  it("refetches a conversation that gained a message outside the list (a reply in Sent)", async () => {
    const { mail, store } = await setup(inboxThreads(2));
    store.start();
    await settled(store);
    mail.mutate((emails) => {
      emails.set("r", fakeEmail({ id: "r", threadId: "t1", mailboxIds: { e: true }, receivedAt: "2026-10-09T00:00:00Z" }));
      return { created: ["r"] };
    });
    await store.refresh();
    expect(store.getSnapshot().rows[1]!.messages.map((m) => m.id)).toEqual(["m1", "r"]);
  });

  it("reloads the pages held when the server cannot calculate changes, keeping the rows", async () => {
    const { mail, store } = await setup(inboxThreads(70));
    store.start();
    await settled(store);
    store.ensureLoaded(60);
    await vi.waitFor(() => expect(store.getSnapshot().complete).toBe(true));
    mail.mutate((emails) => {
      emails.get("m3")!.keywords = { $seen: true };
      return { updated: ["m3"] };
    });
    mail.forgetHistory();
    const sent = mail.posts.length;
    await store.refresh();
    expect(store.getSnapshot().rows).toHaveLength(70);
    expect(store.getSnapshot().rows[3]!.messages[0]!.keywords).toEqual({ $seen: true });
    expect(mail.calls().slice(sent)).toEqual([["Email/changes"], ...Array(2).fill(["Email/query", "Email/get", "Thread/get", "Email/get"])]);
  });

  it("catches up when the list moved between two pages, without duplicates", async () => {
    const { mail, store } = await setup(inboxThreads(60));
    store.start();
    await settled(store);
    mail.mutate((emails) => {
      emails.set("new", fakeEmail({ id: "new", threadId: "tn", receivedAt: "2026-10-05T00:00:00Z" }));
      return { created: ["new"] };
    });
    store.ensureLoaded(100);
    await vi.waitFor(() => expect(store.getSnapshot().complete).toBe(true));
    const ids = store.getSnapshot().rows.map((r) => r.id);
    expect(ids).toHaveLength(61);
    expect(new Set(ids).size).toBe(61);
    expect(ids[0]).toBe("tn");
  });

  it("applies a push StateChange only when the Email state moved", async () => {
    const { mail, store } = await setup(inboxThreads(2));
    store.start();
    await settled(store);
    const sent = mail.posts.length;
    await store.applyStateChange({ "@type": "StateChange", changed: { A: { Email: store.emailState!, Mailbox: "x" } } });
    expect(mail.posts.length).toBe(sent);
    mail.mutate((emails) => {
      emails.get("m1")!.keywords = { $flagged: true };
      return { updated: ["m1"] };
    });
    await store.applyStateChange({ "@type": "StateChange", changed: { A: { Email: mail.state } } });
    expect(store.getSnapshot().rows[1]!.messages[0]!.keywords).toEqual({ $flagged: true });
  });
});

describe("select all", () => {
  it("fetches every conversation in the list with its messages", async () => {
    const { store } = await setup([...inboxThreads(120), fakeEmail({ id: "x", threadId: "t5", mailboxIds: { e: true } })]);
    const all = await store.allConversations();
    expect(all).toHaveLength(120);
    expect(all.find((c) => c.id === "t5")!.messages.map((m) => m.id).sort()).toEqual(["m5", "x"]);
  });
});

describe("conversation view off (brief 22)", () => {
  /** One conversation of three messages in the Inbox, and one of a single message between them. */
  const threeAndOne = () => [
    fakeEmail({ id: "1", threadId: "T", receivedAt: "2026-10-01T09:00:00Z", subject: "Plans", preview: "first" }),
    fakeEmail({ id: "2", threadId: "T", receivedAt: "2026-10-02T09:00:00Z", subject: "Re: Plans", preview: "second", keywords: { $seen: true } }),
    fakeEmail({ id: "3", threadId: "T", receivedAt: "2026-10-04T09:00:00Z", subject: "Re: Plans", preview: "third" }),
    fakeEmail({ id: "s", threadId: "S", receivedAt: "2026-10-03T09:00:00Z", subject: "Single" }),
  ];

  it("lists every message as a row of its own, newest first, in one request of two calls", async () => {
    const { mail, store } = await setup(threeAndOne(), inbox, { conversationView: false });
    store.start();
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    expect(mail.calls()).toEqual([["Email/query", "Email/get"]]);
    const [q, g] = mail.posts[0]!;
    expect(q![1]).toMatchObject({ filter: { inMailbox: "a" }, collapseThreads: false, position: 0, limit: 50 });
    expect(g![1]["properties"]).toEqual(expect.arrayContaining(["threadId", "from", "to", "subject", "preview", "receivedAt", "keywords", "mailboxIds", "hasAttachment"]));
    const snap = store.getSnapshot();
    expect(snap.total).toBe(4);
    expect(snap.rows.map((r) => [r.id, r.conversationId, r.emailId])).toEqual([
      ["3", "T", "3"],
      ["s", "S", "s"],
      ["2", "T", "2"],
      ["1", "T", "1"],
    ]);
    expect(snap.rows.map((r) => r.messages.map((m) => m.id))).toEqual([["3"], ["s"], ["2"], ["1"]]);
    expect(snap.rows.map((r) => r.preview)).toEqual(["third", "Preview of s", "second", "first"]);
    expect(snap.rows[2]!.receivedAt).toBe("2026-10-02T09:00:00Z");
  });

  it("archives one message row alone, and undo brings it back in place", async () => {
    const { mail, client, store } = await setup(threeAndOne(), inbox, { conversationView: false });
    store.start();
    await settled(store);
    const plan = planArchive([store.getSnapshot().rows[2]!], scope);
    expect(Object.keys(plan.update)).toEqual(["2"]);

    publishMailChange({ kind: "patch", update: plan.update });
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(["3", "s", "1"]);
    await client.call("Email/set", { update: plan.update });
    publishMailChange({ kind: "settled" });
    await settled(store);
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(["3", "s", "1"]);
    expect(mail.emails.get("1")!.mailboxIds).toEqual({ a: true });
    expect(mail.emails.get("3")!.mailboxIds).toEqual({ a: true });

    publishMailChange({ kind: "patch", update: plan.inverse });
    await client.call("Email/set", { update: plan.inverse });
    publishMailChange({ kind: "settled" });
    await settled(store);
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(["3", "s", "2", "1"]);
  });

  it("adds a reply to a listed conversation as a new row, without Thread/get", async () => {
    const { mail, store } = await setup(threeAndOne(), inbox, { conversationView: false });
    store.start();
    await settled(store);
    mail.mutate((emails) => {
      emails.set("4", fakeEmail({ id: "4", threadId: "T", receivedAt: "2026-10-05T09:00:00Z" }));
      return { created: ["4"] };
    });
    const sent = mail.posts.length;
    await store.refresh();
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(["4", "3", "s", "2", "1"]);
    expect(store.getSnapshot().rows[0]!.messages.map((m) => m.id)).toEqual(["4"]);
    expect(mail.calls().slice(sent)).toEqual([["Email/changes"], ["Email/get"], ["Email/queryChanges"], ["Email/get"]]);
  });

  it("selects all: every message, each a row", async () => {
    const { store } = await setup(threeAndOne(), inbox, { conversationView: false });
    const all = await store.allConversations();
    expect(all.map((r) => [r.id, r.conversationId, r.messages.length])).toEqual([
      ["3", "T", 1],
      ["s", "S", 1],
      ["2", "T", 1],
      ["1", "T", 1],
    ]);
  });

  it("is a different list from the same query with conversation view on", () => {
    expect(queryKey(inbox, false)).not.toBe(queryKey(inbox, true));
    expect(queryKey(inbox)).toBe(queryKey(inbox, true));
  });
});
