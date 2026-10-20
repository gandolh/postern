import { describe, expect, it } from "vitest";
import {
  JmapError,
  ObjectStore,
  QueryStore,
  StateCache,
  stableStringify,
  syncObjects,
  syncQuery,
  type Mailbox,
} from "../../src/index.js";
import { apiAnswers, setup } from "./helpers.js";

type M = Pick<Mailbox, "id" | "name" | "unreadEmails">;
const m = (id: string, name = id, unreadEmails = 0): M => ({ id, name, unreadEmails });

describe("ObjectStore", () => {
  it("applies /changes: drops destroyed, asks for created and held updated, moves state", () => {
    const store = new ObjectStore<M>("Mailbox");
    store.reset({ state: "s1", list: [m("a"), m("b"), m("c")] });
    const { fetch } = store.applyChanges({
      accountId: "b",
      oldState: "s1",
      newState: "s2",
      hasMoreChanges: false,
      created: ["d"],
      updated: ["a", "zz"],
      destroyed: ["c"],
    });
    expect(fetch).toEqual(["d", "a"]);
    expect(store.ids()).toEqual(["a", "b"]);
    expect(store.state).toBe("s2");
  });

  it("refuses changes that do not start at its state", () => {
    const store = new ObjectStore<M>("Mailbox");
    store.reset({ state: "s1", list: [] });
    expect(() =>
      store.applyChanges({ accountId: "b", oldState: "s0", newState: "s2", hasMoreChanges: false, created: [], updated: [], destroyed: [] }),
    ).toThrow(JmapError);
  });

  it("merges a partial /get over held objects and removes notFound", () => {
    const store = new ObjectStore<M>("Mailbox");
    store.reset({ state: "s1", list: [m("a", "Inbox", 3), m("b")] });
    store.put({ state: "s2", list: [{ id: "a", unreadEmails: 4 } as M], notFound: ["b"] });
    expect(store.get("a")).toEqual(m("a", "Inbox", 4));
    expect(store.has("b")).toBe(false);
    expect(store.state).toBe("s1");
  });
});

describe("QueryStore", () => {
  // RFC 8620 §5.6's worked example, on a contiguous window.
  it("splices out removed ids, then splices in added ones by ascending index", () => {
    const store = new QueryStore("k");
    store.applyQuery({ accountId: "b", queryState: "q1", canCalculateChanges: true, position: 0, ids: ["id1", "id2", "id3", "id4"], total: 9 });
    store.applyQueryChanges({
      accountId: "b",
      oldQueryState: "q1",
      newQueryState: "q2",
      total: 9,
      removed: ["id2", "id31"],
      added: [{ id: "id5", index: 0 }],
    });
    expect(store.ids).toEqual(["id5", "id1", "id3", "id4"]);
    expect(store.queryState).toBe("q2");
    expect(store.total).toBe(9);
  });

  it("inserts several additions in index order whatever order they arrive in", () => {
    const store = new QueryStore("k");
    store.applyQuery({ accountId: "b", queryState: "q1", canCalculateChanges: true, position: 0, ids: ["a", "b", "c"] });
    store.applyQueryChanges({
      accountId: "b",
      oldQueryState: "q1",
      newQueryState: "q2",
      removed: [],
      added: [
        { id: "y", index: 3 },
        { id: "x", index: 1 },
      ],
    });
    expect(store.ids).toEqual(["a", "x", "b", "y", "c"]);
  });

  it("refuses query changes from another queryState", () => {
    const store = new QueryStore("k");
    store.applyQuery({ accountId: "b", queryState: "q1", canCalculateChanges: true, position: 0, ids: [] });
    expect(() => store.applyQueryChanges({ accountId: "b", oldQueryState: "q0", newQueryState: "q2", removed: [], added: [] })).toThrow(JmapError);
  });

  it("moves an id reported in both removed and added", () => {
    const store = new QueryStore("k");
    store.applyQuery({ accountId: "b", queryState: "q1", canCalculateChanges: true, position: 0, ids: ["a", "b", "c"] });
    store.applyQueryChanges({ accountId: "b", oldQueryState: "q1", newQueryState: "q2", removed: ["c"], added: [{ id: "c", index: 0 }] });
    expect(store.ids).toEqual(["c", "a", "b"]);
  });

  it("skips insertions past the end of the held window", () => {
    const store = new QueryStore("k");
    store.applyQuery({ accountId: "b", queryState: "q1", canCalculateChanges: true, position: 0, ids: ["a", "b"] });
    store.applyQueryChanges({ accountId: "b", oldQueryState: "q1", newQueryState: "q2", removed: [], added: [{ id: "z", index: 50 }] });
    expect(store.ids).toEqual(["a", "b"]);
  });

  it("appends a page that continues the window, and rejects one that does not", () => {
    const store = new QueryStore("k");
    store.applyQuery({ accountId: "b", queryState: "q1", canCalculateChanges: true, position: 0, ids: ["a", "b"] });
    store.applyQuery({ accountId: "b", queryState: "q1", canCalculateChanges: true, position: 2, ids: ["c"] });
    expect(store.ids).toEqual(["a", "b", "c"]);
    expect(() => store.applyQuery({ accountId: "b", queryState: "q1", canCalculateChanges: true, position: 9, ids: ["x"] })).toThrow();
  });

  it("keys equal queries equally", () => {
    expect(QueryStore.keyOf({ filter: { b: 1, a: 2 } })).toBe(QueryStore.keyOf({ filter: { a: 2, b: 1 } }));
    expect(stableStringify({ x: [1, { z: 1, y: undefined }] })).toBe('{"x":[1,{"z":1}]}');
  });
});

describe("StateCache", () => {
  it("names the types a StateChange makes stale", () => {
    const cache = new StateCache("b");
    cache.objects<M>("Mailbox").reset({ state: "m1", list: [] });
    cache.objects<M>("Thread").reset({ state: "t1", list: [] });
    cache.objects<M>("Email");
    expect(cache.staleTypes({ "@type": "StateChange", changed: { b: { Mailbox: "m2", Thread: "t1", Email: "e5" }, other: { Mailbox: "x" } } })).toEqual(
      ["Mailbox"],
    );
  });
});

describe("syncObjects", () => {
  it("loads an empty store with a full /get", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) => [name, { accountId: "b", state: "m1", list: [m("a"), m("b")], notFound: [] }]);
    const store = new ObjectStore<M>("Mailbox");
    const result = await syncObjects(client, "Mailbox", store, { properties: ["name", "unreadEmails"] });
    expect(result).toEqual({ status: "changed", state: "m1", created: ["a", "b"], updated: [], destroyed: [] });
    expect(server.posts()[0]?.methodCalls[0]).toEqual(["Mailbox/get", { accountId: "b", ids: null, properties: ["name", "unreadEmails"] }, "0"]);
  });

  it("follows /changes until hasMoreChanges is false, fetching what changed", async () => {
    const { server, client } = setup();
    const pages = [
      { oldState: "m1", newState: "m2", hasMoreChanges: true, created: ["c"], updated: [], destroyed: ["b"] },
      { oldState: "m2", newState: "m3", hasMoreChanges: false, created: [], updated: ["a"], destroyed: [] },
    ];
    apiAnswers(server, (name, args) => {
      if (name === "Mailbox/changes") return [name, { accountId: "b", ...pages.shift() }];
      const ids = args["ids"] as string[];
      return [name, { accountId: "b", state: "m3", list: ids.map((id) => m(id, id, 9)), notFound: [] }];
    });
    const store = new ObjectStore<M>("Mailbox");
    store.reset({ state: "m1", list: [m("a"), m("b")] });
    const result = await syncObjects(client, "Mailbox", store);
    expect(result).toEqual({ status: "changed", state: "m3", created: ["c"], updated: ["a"], destroyed: ["b"] });
    expect(store.ids().sort()).toEqual(["a", "c"]);
    expect(store.get("a")?.unreadEmails).toBe(9);
  });

  it("reports unchanged", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) => [name, { accountId: "b", oldState: "m1", newState: "m1", hasMoreChanges: false, created: [], updated: [], destroyed: [] }]);
    const store = new ObjectStore<M>("Mailbox");
    store.reset({ state: "m1", list: [] });
    expect(await syncObjects(client, "Mailbox", store)).toEqual({ status: "unchanged", state: "m1" });
  });

  it("reports cannotCalculateChanges distinctly and clears the store", async () => {
    const { server, client } = setup();
    apiAnswers(server, () => ["error", { type: "cannotCalculateChanges" }]);
    const store = new ObjectStore<M>("Email");
    store.reset({ state: "e1", list: [m("a")] });
    const result = await syncObjects(client, "Email", store);
    expect(result.status).toBe("cannotCalculateChanges");
    expect(result.status === "cannotCalculateChanges" && result.errorType).toBe("cannotCalculateChanges");
    expect(store.state).toBeNull();
    expect(store.size).toBe(0);
  });

  it("treats Stalwart's invalidArguments for an unknown state the same way", async () => {
    const { server, client } = setup();
    apiAnswers(server, () => ["error", { type: "invalidArguments", description: "invalid JMAP State at line 1 column 303" }]);
    const store = new ObjectStore<M>("Email");
    store.reset({ state: "garbage", list: [] });
    const result = await syncObjects(client, "Email", store);
    expect(result).toMatchObject({ status: "cannotCalculateChanges", errorType: "invalidArguments" });
  });

  it("rethrows other method errors", async () => {
    const { server, client } = setup();
    apiAnswers(server, () => ["error", { type: "forbidden" }]);
    const store = new ObjectStore<M>("Email");
    store.reset({ state: "e1", list: [] });
    await expect(syncObjects(client, "Email", store)).rejects.toMatchObject({ type: "forbidden" });
  });
});

describe("syncQuery", () => {
  it("runs the query when empty, then queryChanges up to the last id held", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) =>
      name === "Email/query"
        ? [name, { accountId: "b", queryState: "q1", canCalculateChanges: true, position: 0, ids: ["a", "b"], total: 2 }]
        : [name, { accountId: "b", oldQueryState: "q1", newQueryState: "q2", total: 3, removed: [], added: [{ id: "n", index: 0 }] }],
    );
    const args = { filter: { inMailbox: "a" }, sort: [{ property: "receivedAt" as const, isAscending: false }], collapseThreads: true, limit: 50 };
    const store = new QueryStore(QueryStore.keyOf(args));
    expect((await syncQuery(client, "Email/query", args, store)).status).toBe("changed");
    const second = await syncQuery(client, "Email/query", args, store);
    expect(second).toEqual({ status: "changed", queryState: "q2", removed: [], added: [{ id: "n", index: 0 }] });
    expect(store.ids).toEqual(["n", "a", "b"]);
    const sent = server.posts()[1]?.methodCalls[0];
    expect(sent?.[0]).toBe("Email/queryChanges");
    expect(sent?.[1]).toMatchObject({ sinceQueryState: "q1", upToId: "b", collapseThreads: true });
    expect(sent?.[1]).not.toHaveProperty("limit");
  });

  it("reports cannotCalculateChanges and clears the store", async () => {
    const { server, client } = setup();
    apiAnswers(server, () => ["error", { type: "cannotCalculateChanges" }]);
    const store = new QueryStore("k");
    store.applyQuery({ accountId: "b", queryState: "q1", canCalculateChanges: true, position: 0, ids: ["a"] });
    expect(await syncQuery(client, "Email/query", {}, store)).toMatchObject({ status: "cannotCalculateChanges" });
    expect(store.queryState).toBeNull();
  });
});
