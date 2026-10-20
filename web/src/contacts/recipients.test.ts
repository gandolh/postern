// The recipient seam with contacts: bob from the address book and the people alice wrote to.
import { describe, expect, it } from "vitest";
import { recipientSource } from "../composer/recipients";
import { card, FakeContacts } from "./fakeContacts";

describe("recipient suggestions from contacts", () => {
  it("offers contacts, expands a group, and survives a failing address book", async () => {
    const fake = new FakeContacts([
      card("1", "Bob Baker", ["bob@postern.test"]),
      card("2", "Zed", ["zed@postern.test"]),
      card("3", "Boardroom", [], { kind: "group", uid: "urn:uuid:g", members: { "urn:uuid:2": true } }),
    ]);
    const source = recipientSource(fake.client);
    expect(await source.suggest("bo", 8)).toEqual([
      { name: "Zed", email: "zed@postern.test" },
      { name: "Bob Baker", email: "bob@postern.test" },
    ]);

    const broken = new FakeContacts();
    broken.cards = [];
    (broken.client.call as unknown as { mockRejectedValue(e: Error): void }).mockRejectedValue(new Error("offline"));
    expect(await recipientSource(broken.client).suggest("bo", 8)).toEqual([]);
  });
});
