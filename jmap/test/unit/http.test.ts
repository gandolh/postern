import { describe, expect, it, vi } from "vitest";
import {
  JmapClient,
  JmapHttpError,
  JmapNetworkError,
  JmapNoAccountError,
  JmapRequestError,
  JmapUnauthorizedError,
  isAbortError,
  type AuthProvider,
} from "../../src/index.js";
import { BASE, FakeServer, json, problem, SESSION, setup } from "./helpers.js";

// Bodies recorded from Stalwart 0.16.25 on 2026-10-20.
const UNAUTHORIZED = { type: "about:blank", status: 401, title: "Unauthorized", detail: "You have to authenticate first." };
const LIMIT = {
  type: "urn:ietf:params:jmap:error:limit",
  status: 400,
  detail: "The request exceeds the maximum number of calls in a single request.",
  limit: "maxCallsInRequest",
};
const NOT_REQUEST = { type: "urn:ietf:params:jmap:error:notRequest", status: 400, detail: "{" };

describe("request-level errors", () => {
  it("maps urn:ietf:params:jmap:error:limit, keeping the type and the limit", async () => {
    const { server, client } = setup();
    server.always("POST /jmap/", () => problem(400, LIMIT));
    const err = await client.call("Mailbox/get", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JmapRequestError);
    expect(err).toMatchObject({ status: 400, type: LIMIT.type, errorType: "limit", limit: "maxCallsInRequest" });
  });

  it("maps notRequest (Stalwart's answer to an unknown capability too)", async () => {
    const { server, client } = setup();
    server.always("POST /jmap/", () => problem(400, NOT_REQUEST));
    await expect(client.call("Mailbox/get", {})).rejects.toMatchObject({ errorType: "notRequest" });
  });

  it("maps other statuses to JmapHttpError with the status", async () => {
    const { server, client } = setup();
    server.always("POST /jmap/", () => new Response("upstream down", { status: 502, statusText: "Bad Gateway" }));
    const err = await client.call("Mailbox/get", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JmapHttpError);
    expect(err).not.toBeInstanceOf(JmapRequestError);
    expect((err as JmapHttpError).status).toBe(502);
  });

  it("maps a thrown fetch to JmapNetworkError, distinct from HTTP errors", async () => {
    const client = new JmapClient({
      baseUrl: BASE,
      auth: { authorization: () => "Basic x" },
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });
    const err = await client.connect().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JmapNetworkError);
    expect(err).not.toBeInstanceOf(JmapHttpError);
  });

  it("lets aborts through untouched", async () => {
    const { client } = setup();
    const controller = new AbortController();
    controller.abort();
    const err = await client.connect({ signal: controller.signal }).catch((e: unknown) => e);
    expect(isAbortError(err)).toBe(true);
  });

  it("treats a session with no accounts as signed out", async () => {
    const { client } = setup({ session: { ...SESSION, accounts: {}, primaryAccounts: {}, username: "" } });
    await expect(client.connect()).rejects.toBeInstanceOf(JmapNoAccountError);
  });
});

describe("401 and the auth provider", () => {
  function server401Once(): FakeServer {
    const server = new FakeServer();
    server.once("GET /jmap/session", () => problem(401, UNAUTHORIZED));
    server.always("GET /jmap/session", () => json(SESSION));
    return server;
  }

  it("retries once with a fresh header when onUnauthorized returns true", async () => {
    const server = server401Once();
    let token = "Bearer old";
    const auth: AuthProvider = {
      authorization: () => token,
      onUnauthorized: vi.fn(async () => {
        token = "Bearer new";
        return true;
      }),
    };
    const client = new JmapClient({ baseUrl: BASE, auth, fetch: server.fetch });
    await client.connect();
    expect(auth.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(server.requests.map((r) => r.headers["authorization"])).toEqual(["Bearer old", "Bearer new"]);
  });

  it("throws JmapUnauthorizedError when the hook declines", async () => {
    const server = server401Once();
    const client = new JmapClient({
      baseUrl: BASE,
      auth: { authorization: () => "Bearer old", onUnauthorized: () => false },
      fetch: server.fetch,
    });
    const err = await client.connect().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JmapUnauthorizedError);
    expect((err as JmapUnauthorizedError).status).toBe(401);
    expect(server.requests).toHaveLength(1);
  });

  it("retries only once", async () => {
    const server = new FakeServer();
    server.always("GET /jmap/session", () => problem(401, UNAUTHORIZED));
    const onUnauthorized = vi.fn(() => true);
    const client = new JmapClient({ baseUrl: BASE, auth: { authorization: () => "Bearer x", onUnauthorized }, fetch: server.fetch });
    await expect(client.connect()).rejects.toBeInstanceOf(JmapUnauthorizedError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(server.requests).toHaveLength(2);
  });

  it("asks the provider for the header on every request and never caches it", async () => {
    const { server } = setup();
    let n = 0;
    const client = new JmapClient({ baseUrl: BASE, auth: { authorization: () => `Bearer t${++n}` }, fetch: server.fetch });
    server.always("POST /jmap/", () => json({ methodResponses: [["Mailbox/get", {}, "0"]], sessionState: SESSION.state }));
    await client.call("Mailbox/get", {});
    await client.call("Mailbox/get", {});
    expect(server.requests.map((r) => r.headers["authorization"])).toEqual(["Bearer t1", "Bearer t2", "Bearer t3"]);
  });
});
