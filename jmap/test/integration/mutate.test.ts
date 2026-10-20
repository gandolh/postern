// Checks that change alice's mailbox, then put it back: every star is
// unstarred in a finally. Nothing is created or destroyed.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findByRole,
  JmapClient,
  ObjectStore,
  QueryStore,
  syncObjects,
  syncQuery,
  type Email,
  type PushReader,
  type StateChange,
} from "../../src/index.js";
import { devClient, live, waitFor } from "./live.js";

describe.skipIf(!live)("against the dev Stalwart: changes", () => {
  let alice: JmapClient;
  let inboxId: string;
  const readers: PushReader[] = [];
  const starred = new Set<string>();

  /** Inbox messages that are not starred, skipping `skip`. */
  async function unstarredInInbox(count: number): Promise<string[]> {
    const q = await alice.email.query({
      filter: { inMailbox: inboxId, notKeyword: "$flagged" },
      sort: [{ property: "receivedAt", isAscending: true }],
      limit: count,
    });
    return q.ids;
  }

  async function star(client: JmapClient, id: string, on: boolean): Promise<string> {
    if (on) starred.add(id);
    const res = await client.email.setKeywords([id], { $flagged: on });
    expect(res.notUpdated ?? {}).toEqual({});
    if (!on) starred.delete(id);
    return res.newState;
  }

  /** Every starred message id in the account, sorted. */
  async function allStarred(): Promise<string[]> {
    const q = await alice.email.query({ filter: { hasKeyword: "$flagged" }, limit: 1000 });
    return [...q.ids].sort();
  }

  let starredBefore: string[] = [];

  beforeAll(async () => {
    alice = devClient("alice");
    await alice.connect();
    const inbox = findByRole(await alice.mailbox.all(), "inbox");
    if (!inbox) throw new Error("no inbox");
    inboxId = inbox.id;
    starredBefore = await allStarred();
  });

  afterAll(async () => {
    await Promise.all(readers.map((r) => r.stop()));
    // Belt and braces: unstar anything a failed test left starred.
    if (starred.size > 0) await alice.email.setKeywords([...starred], { $flagged: false });
    // The server is left as it was found.
    expect(await allStarred()).toEqual(starredBefore);
  });

  it("stars a message and sees Email/changes report it, then unstars it", async () => {
    const [id] = await unstarredInInbox(1);
    if (!id) throw new Error("no unstarred inbox message");
    const before = (await alice.email.get({ ids: [] })).state;
    const store = new ObjectStore<Pick<Email, "id" | "keywords">>("Email");
    store.put(await alice.email.get({ ids: [id], properties: ["keywords"] }));
    expect(store.get(id)?.keywords["$flagged"]).toBeUndefined();

    try {
      const after = await star(alice, id, true);
      const changes = await alice.email.changes(before);
      expect(changes.oldState).toBe(before);
      expect(changes.newState).toBe(after);
      expect(changes.updated).toContain(id);
      expect(changes.created).not.toContain(id);

      const sync = await syncObjects(alice, "Email", store, { properties: ["keywords"], includeCreated: false });
      expect(sync.status).toBe("changed");
      expect(store.get(id)?.keywords["$flagged"]).toBe(true);
    } finally {
      await star(alice, id, false);
    }
    const check = await alice.email.get({ ids: [id], properties: ["keywords"] });
    expect(check.list[0]?.keywords["$flagged"]).toBeUndefined();
  });

  it("keeps a starred-messages query in sync with Email/queryChanges", async () => {
    const args = {
      filter: { inMailbox: inboxId, hasKeyword: "$flagged" },
      sort: [{ property: "receivedAt" as const, isAscending: false }],
      collapseThreads: true,
      calculateTotal: true,
    };
    const store = new QueryStore(QueryStore.keyOf(args));
    await syncQuery(alice, "Email/query", args, store, { limit: 200 });
    const total = store.total ?? 0;
    expect(store.ids).toHaveLength(total);

    const [id] = await unstarredInInbox(1);
    if (!id) throw new Error("no unstarred inbox message");
    try {
      await star(alice, id, true);
      const added = await syncQuery(alice, "Email/query", args, store);
      expect(added.status).toBe("changed");
      expect(added.status === "changed" && added.added.map((a) => a.id)).toContain(id);
      expect(store.ids).toContain(id);
      expect(store.total).toBe(total + 1);
    } finally {
      await star(alice, id, false);
    }
    const removed = await syncQuery(alice, "Email/query", args, store);
    expect(removed.status === "changed" && removed.removed).toContain(id);
    expect(store.ids).not.toContain(id);
    expect(store.total).toBe(total);
  });

  it("receives a StateChange over the fetch stream after a second client changes mail", async () => {
    const [id] = await unstarredInInbox(2).then((ids) => ids.slice(1));
    if (!id) throw new Error("no unstarred inbox message");
    const before = (await alice.email.get({ ids: [] })).state;

    const reader = alice.push({ types: ["Email", "Mailbox", "Thread", "EmailDelivery"] });
    readers.push(reader);
    const changes: StateChange[] = [];
    reader.onStateChange((c) => changes.push(c));
    reader.start();
    await waitFor(() => (reader.status === "open" ? true : undefined), 5000, "the stream to open");

    const second = devClient("alice");
    try {
      const after = await star(second, id, true);
      const seen = await waitFor(
        () => changes.find((c) => (c.changed[alice.accountId]?.["Email"] ?? before) !== before),
        10_000,
        "a StateChange for Email",
      );
      expect(seen["@type"]).toBe("StateChange");
      expect(seen.changed[alice.accountId]?.["Email"]).toMatch(/\S/);
      expect(after).not.toBe(before);
    } finally {
      await star(second, id, false);
    }
    expect(reader.status).toBe("open");
    expect(reader.lastError).toBeUndefined();
    await reader.stop();
    expect(reader.status).toBe("closed");
  });
});
