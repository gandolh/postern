import { describe, expect, it } from "vitest";
import {
  expandTemplate,
  JmapNoAccountError,
  rebaseUrl,
  Session,
  templateVariables,
  type SessionObject,
} from "../../src/index.js";
import { BASE, SESSION, setup } from "./helpers.js";

describe("rebaseUrl", () => {
  const stalwart = "https://mail.postern.test/jmap/download/{accountId}/{blobId}/{name}?accept={type}";

  it("swaps Stalwart's origin for a relative base, keeping path, query and templates", () => {
    expect(rebaseUrl(stalwart, "/webmail-api")).toBe("/webmail-api/jmap/download/{accountId}/{blobId}/{name}?accept={type}");
  });

  it("swaps it for an absolute base", () => {
    expect(rebaseUrl("https://mail.postern.test/jmap/", "http://127.0.0.1:18080")).toBe("http://127.0.0.1:18080/jmap/");
  });

  it("ignores a trailing slash on the base", () => {
    expect(rebaseUrl("https://mail.postern.test/jmap/upload/{accountId}/", "/webmail-api/")).toBe(
      "/webmail-api/jmap/upload/{accountId}/",
    );
  });

  it("keeps the event-source query templates intact", () => {
    expect(
      rebaseUrl("https://mail.postern.test/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}", "/webmail-api"),
    ).toBe("/webmail-api/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}");
  });

  it("handles http, a port, and an already relative URL", () => {
    expect(rebaseUrl("http://mail.example:8080/jmap/", "/x")).toBe("/x/jmap/");
    expect(rebaseUrl("/jmap/", "/x")).toBe("/x/jmap/");
  });

  it("does not percent-encode the braces the way new URL() would", () => {
    expect(rebaseUrl(stalwart, BASE)).not.toContain("%7B");
  });
});

describe("expandTemplate", () => {
  it("encodes values as RFC 6570 level 1", () => {
    expect(expandTemplate("/d/{blobId}/{name}?accept={type}", { blobId: "Gab", name: "my file (1).pdf", type: "application/pdf" })).toBe(
      "/d/Gab/my%20file%20%281%29.pdf?accept=application%2Fpdf",
    );
  });

  it("refuses a missing variable", () => {
    expect(() => expandTemplate("/{accountId}/{blobId}", { accountId: "b" })).toThrow(/blobId/);
  });

  it("lists variables", () => {
    expect(templateVariables(SESSION.downloadUrl)).toEqual(["accountId", "blobId", "name", "type"]);
  });
});

describe("Session", () => {
  const session = new Session(SESSION, "/webmail-api");

  it("rebases every endpoint", () => {
    expect(session.apiUrl).toBe("/webmail-api/jmap/");
    expect(session.uploadUrl).toBe("/webmail-api/jmap/upload/{accountId}/");
    expect(session.downloadUrl).toBe("/webmail-api/jmap/download/{accountId}/{blobId}/{name}?accept={type}");
    expect(session.eventSourceUrl).toBe("/webmail-api/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}");
    expect(session.raw.apiUrl).toBe("https://mail.postern.test/jmap/");
  });

  it("takes the account from primaryAccounts, not a constant", () => {
    const other: SessionObject = {
      ...SESSION,
      primaryAccounts: { ...SESSION.primaryAccounts, "urn:ietf:params:jmap:mail": "zz" },
    };
    expect(session.accountId).toBe("b");
    expect(new Session(other, "/x").accountId).toBe("zz");
  });

  it("exposes limits, username, state and capabilities", () => {
    expect(session.limits).toMatchObject({
      maxCallsInRequest: 16,
      maxObjectsInGet: 500,
      maxObjectsInSet: 500,
      maxConcurrentUpload: 4,
      maxSizeRequest: 10_000_000,
      maxSizeUpload: 50_000_000,
    });
    expect(session.username).toBe("alice@postern.test");
    expect(session.state).toBe(SESSION.state);
    expect(session.hasCapability("urn:ietf:params:jmap:sieve")).toBe(true);
    expect(session.hasCapability("urn:ietf:params:jmap:nope")).toBe(false);
    expect(session.accountCapability<{ maxSizeScript: number }>("urn:ietf:params:jmap:sieve")?.maxSizeScript).toBe(102400);
  });

  it("fills the URL templates", () => {
    expect(session.uploadUrlFor()).toBe("/webmail-api/jmap/upload/b/");
    expect(session.downloadUrlFor({ blobId: "Gx1", name: "lake.png", type: "image/png" })).toBe(
      "/webmail-api/jmap/download/b/Gx1/lake.png?accept=image%2Fpng",
    );
    expect(session.downloadUrlFor({ blobId: "Gx1", name: "a b" })).toBe(
      "/webmail-api/jmap/download/b/Gx1/a%20b?accept=application%2Foctet-stream",
    );
    expect(session.eventSourceUrlFor({ types: ["Email", "Mailbox"], closeafter: "no", ping: 30 })).toBe(
      "/webmail-api/jmap/eventsource/?types=Email%2CMailbox&closeafter=no&ping=30",
    );
    expect(session.eventSourceUrlFor({ types: "*", closeafter: "state", ping: 0 })).toContain("types=%2A");
  });

  it("refuses a session without a mail account (Stalwart's answer without credentials)", () => {
    const signedOut: SessionObject = { ...SESSION, accounts: {}, primaryAccounts: {}, username: "", state: "0" };
    expect(() => new Session(signedOut, "/x")).toThrow(JmapNoAccountError);
  });
});

describe("JmapClient.connect", () => {
  it("fetches {base}/jmap/session with the provider's header and keeps the session", async () => {
    const { server, client } = setup();
    const session = await client.connect();
    expect(server.requests[0]?.url).toBe(`${BASE}/jmap/session`);
    expect(server.requests[0]?.headers["authorization"]).toBe("Basic dGVzdDp0ZXN0");
    expect(session.apiUrl).toBe(`${BASE}/jmap/`);
    expect(client.session).toBe(session);
    expect(client.accountId).toBe("b");
  });

  it("shares one request between concurrent connects", async () => {
    const { server, client } = setup();
    await Promise.all([client.connect(), client.connect(), client.ensureSession()]);
    expect(server.requests).toHaveLength(1);
  });

  it("refetches the session when an API response reports a new sessionState", async () => {
    const { server, client } = setup();
    server.always("POST /jmap/", () =>
      new Response(JSON.stringify({ methodResponses: [["Core/echo", {}, "0"]], sessionState: "changed" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await client.call("Core/echo", {});
    expect(server.requests.filter((r) => r.url.endsWith("/session"))).toHaveLength(1);
    await client.call("Core/echo", {});
    expect(server.requests.filter((r) => r.url.endsWith("/session"))).toHaveLength(2);
  });
});
