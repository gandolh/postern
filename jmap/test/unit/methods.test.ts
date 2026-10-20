import { describe, expect, it } from "vitest";
import { findByRole, isPushVerification, JmapSetError, mailboxPath, type Mailbox } from "../../src/index.js";
import { Limiter } from "../../src/limiter.js";
import { apiAnswers, fixture, json, setup } from "./helpers.js";

describe("wrappers send the right calls", () => {
  it("setKeywords builds keyword patches (escaping the pointer)", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) => [name, { accountId: "b", oldState: "a", newState: "b", updated: { m1: null } }]);
    await client.email.setKeywords(["m1", "m2"], { $flagged: true, $seen: false, "a/b~c": true });
    const args = server.posts()[0]?.methodCalls[0]?.[1];
    expect(args).toEqual({
      accountId: "b",
      update: {
        m1: { "keywords/$flagged": true, "keywords/$seen": null, "keywords/a~1b~0c": true },
        m2: { "keywords/$flagged": true, "keywords/$seen": null, "keywords/a~1b~0c": true },
      },
    });
  });

  it("queryAndGet returns messages in query order from one request", async () => {
    const { server, client } = setup();
    const recorded = fixture<{ methodResponses: [string, Record<string, unknown>, string][] }>("conversation-list.response.json");
    const [, query, get] = recorded.methodResponses;
    server.always("POST /jmap/", () =>
      json({
        methodResponses: [
          ["Email/query", query?.[1], "0"],
          ["Email/get", { ...get?.[1], list: [...((get?.[1]["list"] as unknown[]) ?? [])].reverse() }, "1"],
        ],
        sessionState: "1af6e809",
      }),
    );
    const res = await client.email.queryAndGet({ filter: { inMailbox: "a" }, collapseThreads: true, limit: 3 }, { properties: ["threadId"] });
    expect(server.posts()).toHaveLength(1);
    expect(res.list.map((e) => e.id)).toEqual(res.query.ids);
    expect(res.query.total).toBe(2035);
  });

  it("vacationResponse.get/set act on the singleton", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) =>
      name === "VacationResponse/get"
        ? [name, { accountId: "b", state: "n", list: [{ id: "singleton", isEnabled: false }], notFound: [] }]
        : [name, { accountId: "b", notUpdated: { singleton: { type: "invalidProperties", properties: ["fromDate"] } } }],
    );
    expect((await client.vacationResponse.get()).id).toBe("singleton");
    await expect(client.vacationResponse.set({ isEnabled: true, fromDate: "nope" })).rejects.toBeInstanceOf(JmapSetError);
    expect(server.posts()[1]?.methodCalls[0]).toEqual([
      "VacationResponse/set",
      { accountId: "b", update: { singleton: { isEnabled: true, fromDate: "nope" } } },
      "0",
    ]);
    expect(server.posts()[1]?.using).toContain("urn:ietf:params:jmap:vacationresponse");
  });

  it("pushSubscription create → verify → destroy, with no accountId", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name, args) => {
      if (args["create"]) return [name, { created: { sub: { id: "P1", expires: "2026-10-27T00:00:00Z" } } }];
      if (args["update"]) return [name, { updated: { P1: null } }];
      return [name, { destroyed: ["P1"] }];
    });
    const created = await client.pushSubscription.create({
      deviceClientId: "dev-1",
      url: "https://push.example/endpoint",
      keys: { p256dh: "k", auth: "a" },
      types: ["Email", "Mailbox"],
    });
    expect(created).toEqual({ id: "P1", expires: "2026-10-27T00:00:00Z" });
    await client.pushSubscription.verify("P1", "code-123");
    await client.pushSubscription.destroy("P1");
    const calls = server.posts().map((p) => p.methodCalls[0]);
    expect(calls[0]?.[1]).not.toHaveProperty("accountId");
    expect(calls[1]?.[1]).toEqual({ update: { P1: { verificationCode: "code-123" } } });
    expect(calls[2]?.[1]).toEqual({ destroy: ["P1"] });
    expect(isPushVerification({ "@type": "PushVerification", pushSubscriptionId: "P1", verificationCode: "x" })).toBe(true);
    expect(isPushVerification({ "@type": "StateChange", changed: {} })).toBe(false);
  });

  it("pushSubscription.create throws the SetError", async () => {
    const { server, client } = setup();
    apiAnswers(server, (name) => [name, { notCreated: { sub: { type: "invalidProperties", properties: ["url"] } } }]);
    const err = await client.pushSubscription.create({ deviceClientId: "d", url: "http://insecure" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JmapSetError);
    expect((err as JmapSetError).type).toBe("invalidProperties");
  });

  it("sieveScript.validateSource uploads the script then validates the blob", async () => {
    const { server, client } = setup();
    server.always("POST /jmap/upload/b/", () => json({ accountId: "b", blobId: "Gs1", type: "application/sieve", size: 9 }));
    // Recorded: Stalwart's answer to "if foo bar".
    apiAnswers(server, (name) => [name, { accountId: "b", error: { type: "invalidScript", description: "Unexpected end of file at line 1, column 9." } }]);
    const error = await client.sieveScript.validateSource("if foo bar");
    expect(error?.type).toBe("invalidScript");
    const upload = server.requests.find((r) => r.url.includes("/upload/"));
    expect(upload?.headers["content-type"]).toBe("application/sieve");
    expect(server.posts()[0]?.methodCalls[0]).toEqual(["SieveScript/validate", { accountId: "b", blobId: "Gs1" }, "0"]);
  });
});

describe("mailbox helpers", () => {
  const all: Pick<Mailbox, "id" | "name" | "parentId" | "role">[] = [
    { id: "a", name: "Inbox", parentId: null, role: "inbox" },
    { id: "w", name: "Work", parentId: null, role: null },
    { id: "c", name: "Clients", parentId: "w", role: null },
    { id: "loop", name: "Loop", parentId: "loop", role: null },
  ];

  it("finds by role and builds paths", () => {
    expect(findByRole(all, "inbox")?.id).toBe("a");
    expect(findByRole(all, "archive")).toBeUndefined();
    expect(mailboxPath(all[2]!, all)).toBe("Work/Clients");
    expect(mailboxPath(all[3]!, all)).toBe("Loop");
  });
});

describe("Limiter", () => {
  it("never runs more than max tasks at once", async () => {
    const limiter = new Limiter(2);
    let active = 0;
    let peak = 0;
    const task = async (): Promise<void> => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
    };
    await Promise.all(Array.from({ length: 10 }, () => limiter.run(task)));
    expect(peak).toBe(2);
    limiter.max = 4;
    peak = 0;
    await Promise.all(Array.from({ length: 10 }, () => limiter.run(task)));
    expect(peak).toBe(4);
  });
});
