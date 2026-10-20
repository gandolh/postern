import { describe, expect, it } from "vitest";
import { ComposeTestServer, MAILBOXES } from "../send/testServer";
import { recipientSource } from "./recipients";

describe("recent recipients", () => {
  it("suggests people alice wrote to, by name or address, newest first", async () => {
    const server = new ComposeTestServer();
    const sent = (id: string, at: string, to: { name: string | null; email: string }[], cc: { name: string | null; email: string }[] = []) =>
      server.add({ id, mailboxIds: { [MAILBOXES.sent]: true }, receivedAt: at, to, cc, bcc: null });
    sent("S1", "2026-10-01T10:00:00Z", [{ name: "Bob Baker", email: "bob@postern.test" }]);
    sent("S2", "2026-10-05T10:00:00Z", [{ name: "Bobby Tables", email: "tables@example.org" }], [{ name: null, email: "carol.chen@northwind.example.com" }]);
    server.add({ id: "I1", mailboxIds: { [MAILBOXES.inbox]: true }, receivedAt: "2026-10-06T10:00:00Z", to: [{ name: "Boris", email: "boris@example.org" }] });
    const client = await server.connect();
    const source = recipientSource(client);
    expect(recipientSource(client)).toBe(source);
    expect(await source.suggest("bob", 8)).toEqual([
      { name: "Bobby Tables", email: "tables@example.org" },
      { name: "Bob Baker", email: "bob@postern.test" },
    ]);
    expect(await source.suggest("chen", 8)).toEqual([{ name: null, email: "carol.chen@northwind.example.com" }]);
    expect(await source.suggest("tables@", 8)).toHaveLength(1);
    expect(await source.suggest("", 8)).toEqual([]);
    source.remember([{ name: "Bo Diddley", email: "bo@example.org" }]);
    expect((await source.suggest("bo", 1))[0]?.email).toBe("bo@example.org");
    expect(server.names().filter((n) => n === "Email/query")).toHaveLength(1);
  });
});
