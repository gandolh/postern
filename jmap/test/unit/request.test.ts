import { describe, expect, expectTypeOf, it } from "vitest";
import {
  JmapCannotCalculateChangesError,
  JmapError,
  JmapLimitError,
  JmapMethodError,
  JmapProtocolError,
  type Email,
  type Id,
  type QueryResponse,
  type ResultRef,
  type Thread,
} from "../../src/index.js";
import { apiAnswers, fixture, json, setup } from "./helpers.js";

describe("back-references", () => {
  it("sends a ref value as #name with resultOf/name/path, and fills accountId", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) => [name, { accountId: "b", ids: [], list: [], state: "s", notFound: [] }]);
    const r = client.request();
    const q = r.call("Email/query", { filter: { inMailbox: "a" }, collapseThreads: true, limit: 3 });
    const g = r.call("Email/get", { ids: q.ref("/ids"), properties: ["threadId"] });
    r.call("Thread/get", { ids: g.ref("/list/*/threadId") });
    await r.send();

    const [body] = server.posts();
    expect(body?.using).toEqual(["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"]);
    expect(body?.methodCalls).toEqual([
      ["Email/query", { accountId: "b", filter: { inMailbox: "a" }, collapseThreads: true, limit: 3 }, "0"],
      ["Email/get", { accountId: "b", "#ids": { resultOf: "0", name: "Email/query", path: "/ids" }, properties: ["threadId"] }, "1"],
      ["Thread/get", { accountId: "b", "#ids": { resultOf: "1", name: "Email/get", path: "/list/*/threadId" } }, "2"],
    ]);
  });

  it("accepts the explicit #name spelling", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) => [name, {}]);
    const r = client.request();
    const q = r.call("Email/query", {});
    r.call("Email/get", { "#ids": q.ref("/ids") });
    await r.send();
    expect(server.posts()[0]?.methodCalls[1]?.[1]).toEqual({
      accountId: "b",
      "#ids": { resultOf: "0", name: "Email/query", path: "/ids" },
    });
  });

  it("rejects a reference to a call that is not earlier in the same request", () => {
    const { client } = setup();
    const other = client.request().call("Email/query", {});
    const r = client.request();
    r.call("Mailbox/get", {});
    expect(() => r.call("Email/get", { ids: other.ref("/ids") })).toThrow(JmapError);
  });

  it("reads typed results against the recorded Stalwart response", async () => {
    const { server, client } = setup();
    server.always("POST /jmap/", () => json(fixture("conversation-list.response.json")));
    const r = client.request();
    const inbox = r.call("Mailbox/query", { filter: { role: "inbox" } });
    const q = r.call("Email/query", { filter: { inMailbox: "a" }, collapseThreads: true, limit: 3, calculateTotal: true });
    const g = r.call("Email/get", { ids: q.ref("/ids"), properties: ["threadId", "subject"] });
    const t = r.call("Thread/get", { ids: g.ref("/list/*/threadId") });
    const res = await r.send();
    expect(res.get(inbox).ids).toEqual(["a"]);
    expect(res.get(q).total).toBe(2035);
    expect(res.get(g).list.map((e) => e.threadId)).toEqual(res.get(t).list.map((th) => th.id));
    expect(res.sessionState).toBe("1af6e809");

    expectTypeOf(res.get(q)).toEqualTypeOf<QueryResponse>();
    expectTypeOf(res.get(g).list).toEqualTypeOf<Email[]>();
    expectTypeOf(res.get(t).list).toEqualTypeOf<Thread[]>();
  });

  it("types refs from the response shape", () => {
    const { client } = setup();
    const r = client.request();
    const q = r.call("Email/query", {});
    expectTypeOf(q.ref("/ids")).toEqualTypeOf<ResultRef<Id[]>>();
    expectTypeOf(q.ref("/total")).toEqualTypeOf<ResultRef<number | undefined>>();
    // Deep JSON pointers take their type from where they are used.
    const deep: ResultRef<Id[]> = q.ref("/ids/0/../ids");
    expect(deep.path).toBe("/ids/0/../ids");
    // @ts-expect-error total is a number, not ids
    r.call("Email/get", { ids: q.ref("/total") });
    // @ts-expect-error an unknown method
    r.call("Email/fly", {});
    // @ts-expect-error an unknown filter condition
    r.call("Email/query", { filter: { inFolder: "a" } });
  });
});

describe("method errors", () => {
  it("keeps the type string and maps cannotCalculateChanges to its own class", async () => {
    const { server, client } = setup();
    // Recorded from Stalwart 0.16.25.
    server.always("POST /jmap/", () =>
      json({
        methodResponses: [
          ["error", { type: "unknownMethod", description: "Foo/get" }, "0"],
          ["error", { type: "cannotCalculateChanges" }, "1"],
          ["Mailbox/get", { accountId: "b", state: "srala", list: [], notFound: [] }, "2"],
        ],
        sessionState: "1af6e809",
      }),
    );
    const r = client.request();
    const a = r.callRaw("Foo/get", {});
    const b = r.call("Email/changes", { sinceState: "old" });
    const c = r.call("Mailbox/get", { ids: [] });
    const res = await r.send();

    expect(() => res.get(a)).toThrow(JmapMethodError);
    expect(res.error(a)?.type).toBe("unknownMethod");
    expect(res.error(a)?.description).toBe("Foo/get");
    expect(res.error(a)?.method).toBe("Foo/get");
    expect(res.error(b)).toBeInstanceOf(JmapCannotCalculateChangesError);
    expect(res.error(c)).toBeUndefined();
    expect(res.get(c).state).toBe("srala");
  });

  it("client.call throws the method error", async () => {
    const { server, client } = setup();
    server.always("POST /jmap/", () =>
      json({
        methodResponses: [["error", { type: "invalidArguments", description: "invalid JMAP State at line 1 column 303" }, "0"]],
        sessionState: "1af6e809",
      }),
    );
    await expect(client.email.changes("garbage")).rejects.toMatchObject({ type: "invalidArguments", method: "Email/changes" });
  });

  it("reports a missing response as a protocol error", async () => {
    const { server, client } = setup();
    server.always("POST /jmap/", () => json({ methodResponses: [], sessionState: "1af6e809" }));
    await expect(client.call("Mailbox/get", {})).rejects.toBeInstanceOf(JmapProtocolError);
  });
});

describe("splitting to fit the limits", () => {
  it("splits 20 independent calls over two POSTs of at most 16", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name, args) => [name, { accountId: "b", state: "s", list: [], notFound: [], ids: args["ids"] }]);
    const r = client.request();
    const handles = Array.from({ length: 20 }, (_, i) => r.call("Mailbox/get", { ids: [`m${i}`] }));
    const res = await r.send();
    const posts = server.posts();
    expect(posts.map((p) => p.methodCalls.length)).toEqual([16, 4]);
    expect(handles.map((h) => res.get(h).state)).toHaveLength(20);
    // createdIds travels with split requests so creation references still resolve.
    expect(posts[0]?.createdIds).toEqual({});
  });

  it("never separates a back-reference from its target", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) => [name, { ids: [], list: [] }]);
    const r = client.request();
    for (let i = 0; i < 15; i++) r.call("Mailbox/get", { ids: [] });
    const q = r.call("Email/query", {});
    r.call("Email/get", { ids: q.ref("/ids") });
    await r.send();
    const posts = server.posts();
    expect(posts.map((p) => p.methodCalls.length)).toEqual([15, 2]);
    expect(posts[1]?.methodCalls.map((c) => c[0])).toEqual(["Email/query", "Email/get"]);
  });

  it("refuses a chain of linked calls longer than maxCallsInRequest", async () => {
    const { client } = setup();
    const r = client.request();
    let prev = r.call("Email/query", {});
    for (let i = 0; i < 16; i++) {
      const g = r.call("Email/get", { ids: prev.ref("/ids") });
      prev = r.call("Email/query", { anchor: g.ref<Id>("/list/0/id") });
    }
    await expect(r.send()).rejects.toThrow(JmapLimitError);
    await expect(client.request().send()).resolves.toBeDefined();
  });

  it("splits a /get over maxObjectsInGet and merges the parts", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name, args) => {
      const ids = args["ids"] as string[];
      return [name, { accountId: "b", state: "s1", list: ids.slice(1).map((id) => ({ id })), notFound: ids.slice(0, 1) }];
    });
    const ids = Array.from({ length: 1201 }, (_, i) => `e${i}`);
    const res = await client.email.get({ ids, properties: ["id"] });
    const calls = server.posts()[0]?.methodCalls ?? [];
    expect(calls.map((c) => (c[1]["ids"] as string[]).length)).toEqual([500, 500, 201]);
    expect(calls.map((c) => c[2])).toEqual(["0.0", "0.1", "0.2"]);
    expect(res.list).toHaveLength(1198);
    expect(res.notFound).toEqual(["e0", "e500", "e1000"]);
  });

  it("splits a /set over maxObjectsInSet and merges the parts", async () => {
    const { server, client } = setup();
    let n = 0;
    apiAnswers(server, (name, args) => {
      n++;
      const updated = Object.fromEntries(Object.keys((args["update"] ?? {}) as object).map((id) => [id, null]));
      return [name, { accountId: "b", oldState: `s${n - 1}`, newState: `s${n}`, updated, destroyed: args["destroy"] ?? [] }];
    });
    const ids = Array.from({ length: 700 }, (_, i) => `e${i}`);
    const res = await client.email.setKeywords(ids, { $flagged: true });
    const calls = server.posts()[0]?.methodCalls ?? [];
    expect(calls).toHaveLength(2);
    expect(Object.keys(calls[0]?.[1]["update"] as object)).toHaveLength(500);
    expect(calls[0]?.[1]["update"]).toMatchObject({ e0: { "keywords/$flagged": true } });
    expect(Object.keys(res.updated ?? {})).toHaveLength(700);
    expect(res.oldState).toBe("s0");
    expect(res.newState).toBe("s2");
  });

  it("refuses to split a /get that a later call references", async () => {
    const { client } = setup();
    const r = client.request();
    const g = r.call("Email/get", { ids: Array.from({ length: 501 }, (_, i) => `e${i}`) });
    r.call("Thread/get", { ids: g.ref("/list/*/threadId") });
    await expect(r.send()).rejects.toMatchObject({ limit: "maxObjectsInGet" });
  });

  it("refuses to split a /set with ifInState", async () => {
    const { client } = setup();
    const destroy = Array.from({ length: 501 }, (_, i) => `e${i}`);
    await expect(client.email.set({ destroy, ifInState: "s" })).rejects.toMatchObject({ limit: "maxObjectsInSet" });
  });

  it("carries createdIds from one POST to the next", async () => {
    const { server, client } = setup();
    let post = 0;
    server.always("POST /jmap/", (req) => {
      post++;
      const body = req.json as { methodCalls: [string, Record<string, unknown>, string][]; createdIds: Record<string, string> };
      const created = post === 1 ? { draft: "M1" } : {};
      return json({
        methodResponses: body.methodCalls.map(([n, , id]) => [n, { created: post === 1 && n === "Email/set" ? { draft: { id: "M1" } } : null }, id]),
        createdIds: { ...body.createdIds, ...created },
        sessionState: "1af6e809",
      });
    });
    const r = client.request();
    r.call("Email/set", { create: { draft: { subject: "hi" } } });
    for (let i = 0; i < 15; i++) r.call("Mailbox/get", { ids: [] });
    r.call("EmailSubmission/set", { create: { send: { identityId: "b", emailId: "#draft" } } });
    const res = await r.send();
    const posts = server.posts();
    expect(posts).toHaveLength(2);
    expect(posts[1]?.createdIds).toEqual({ draft: "M1" });
    expect(posts[1]?.using).toContain("urn:ietf:params:jmap:submission");
    expect(res.createdIds).toEqual({ draft: "M1" });
  });
});

describe("the builder", () => {
  it("sends once", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) => [name, {}]);
    const r = client.request();
    r.call("Mailbox/get", {});
    await r.send();
    await expect(r.send()).rejects.toThrow(JmapError);
    expect(() => r.call("Mailbox/get", {})).toThrow(JmapError);
  });

  it("adds capabilities from methods and from using()", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) => [name, {}]);
    const r = client.request().using("urn:ietf:params:jmap:blob");
    r.call("SieveScript/get", {});
    r.call("Quota/get", {});
    r.call("PushSubscription/get", {});
    await r.send();
    const [body] = server.posts();
    expect(body?.using.sort()).toEqual(
      [
        "urn:ietf:params:jmap:blob",
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:quota",
        "urn:ietf:params:jmap:sieve",
      ].sort(),
    );
    // PushSubscription takes no accountId.
    expect(body?.methodCalls[2]?.[1]).toEqual({});
  });

  it("serialises accountId first (Stalwart fails the whole request on a bad state seen before it)", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) => [name, {}]);
    await client.call("Email/changes", { sinceState: "s1", maxChanges: 5 });
    expect(server.requests.at(-1)?.body).toContain('["Email/changes",{"accountId":"b","sinceState":"s1","maxChanges":5},"0"]');
  });

  it("keeps an explicit accountId", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) => [name, {}]);
    await client.call("Mailbox/get", { accountId: "other" });
    expect(server.posts()[0]?.methodCalls[0]?.[1]).toEqual({ accountId: "other" });
  });
});
