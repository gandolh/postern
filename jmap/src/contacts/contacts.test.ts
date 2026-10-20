import { describe, expect, it } from "vitest";
import type { MethodCaller } from "../methods/caller.js";
import type { ContactCard } from "../types/contacts.js";
import { createContact, deleteContact, loadContactCards, updateContact } from "./api.js";
import {
  contactAddresses,
  contactDraft,
  contactEmails,
  contactName,
  contactNote,
  contactPatch,
  contactPhones,
  findByAddress,
  groupAddresses,
  newContactCard,
} from "./jscontact.js";

const bob: ContactCard = {
  id: "1",
  addressBookIds: { b: true },
  uid: "urn:uuid:bob",
  name: { full: "Bob Baker" },
  emails: {
    e1: { address: "bobby@x.test" },
    e2: { address: "bob@x.test", pref: 1 },
  },
  phones: { p1: { number: "+40 1" } },
  notes: { n1: { note: "met at a talk" } },
};
const noName: ContactCard = {
  id: "2",
  addressBookIds: { b: true },
  emails: { e1: { address: "zed@x.test" } },
};
const parts: ContactCard = {
  id: "3",
  addressBookIds: { b: true },
  name: {
    components: [
      { kind: "given", value: "Cy" },
      { kind: "surname", value: "Dunn" },
    ],
  },
};
const team: ContactCard = {
  id: "4",
  addressBookIds: { b: true },
  kind: "group",
  name: { full: "Team" },
  members: { "urn:uuid:bob": true, "urn:uuid:gone": true },
};

describe("JSContact helpers", () => {
  it("reads names, preferred address first, phones and notes", () => {
    expect(contactName(bob)).toBe("Bob Baker");
    expect(contactName(parts)).toBe("Cy Dunn");
    expect(contactName(noName)).toBe("zed@x.test");
    expect(contactEmails(bob)).toEqual(["bob@x.test", "bobby@x.test"]);
    expect(contactPhones(bob)).toEqual(["+40 1"]);
    expect(contactNote(bob)).toBe("met at a talk");
    expect(contactDraft(noName)).toEqual({
      name: "zed@x.test",
      emails: ["zed@x.test"],
      phones: [],
      note: "",
    });
  });

  it("builds a card with a uid, trimmed and de-duplicated", () => {
    const card = newContactCard(
      {
        name: " Ann ",
        emails: ["a@x.test", "A@x.test", " "],
        phones: [],
        note: "",
      },
      "b",
      "urn:uuid:fixed",
    );
    expect(card).toEqual({
      "@type": "Card",
      version: "1.0",
      uid: "urn:uuid:fixed",
      kind: "individual",
      addressBookIds: { b: true },
      name: { full: "Ann" },
      emails: { e1: { "@type": "EmailAddress", address: "a@x.test" } },
    });
    expect(newContactCard({ name: "N", emails: [], phones: [], note: "" }, "b").uid).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
  });

  it("patches whole maps, and nulls the emptied ones", () => {
    expect(
      contactPatch({
        name: "Bob",
        emails: ["b@x.test"],
        phones: [],
        note: " hi ",
      }),
    ).toEqual({
      name: { full: "Bob" },
      emails: { e1: { "@type": "EmailAddress", address: "b@x.test" } },
      phones: null,
      notes: { n1: { "@type": "Note", note: "hi" } },
    });
    expect(contactPatch({ name: "Bob", emails: [], phones: ["1"], note: "" })).toMatchObject({
      emails: null,
      notes: null,
      phones: { p1: { number: "1" } },
    });
  });

  it("lists addresses, finds by address and expands groups to member addresses", () => {
    const all = [bob, noName, team];
    expect(contactAddresses(all).map((a) => [a.name, a.email])).toEqual([
      ["Bob Baker", "bob@x.test"],
      ["Bob Baker", "bobby@x.test"],
      [null, "zed@x.test"],
    ]);
    expect(findByAddress(all, " BOB@x.test ")?.id).toBe("1");
    expect(findByAddress(all, "nobody@x.test")).toBeUndefined();
    expect(groupAddresses(team, all)).toEqual([{ cardId: "1", name: "Bob Baker", email: "bob@x.test" }]);
  });
});

function fakeCaller(initial: ContactCard[]): {
  caller: MethodCaller;
  calls: [string, unknown][];
} {
  const cards = [...initial];
  const calls: [string, unknown][] = [];
  const caller = {
    async call(name: string, args: Record<string, unknown>) {
      calls.push([name, args]);
      switch (name) {
        case "ContactCard/query":
          return { ids: cards.map((c) => c.id), queryState: "q1" };
        case "ContactCard/get":
          return {
            state: "s1",
            list: cards.filter((c) => (args["ids"] as string[]).includes(c.id)),
          };
        case "AddressBook/get":
          return {
            list: [
              { id: "x", isDefault: false },
              { id: "b", isDefault: true },
            ],
          };
        case "ContactCard/set": {
          const set = args as {
            create?: Record<string, unknown>;
            update?: Record<string, unknown>;
            destroy?: string[];
          };
          if (set.create) return { created: { new: { id: "9" } }, notCreated: null };
          if (set.update)
            return {
              updated: { "1": null },
              notUpdated: {
                "7": { type: "invalidProperties", description: "nope" },
              },
            };
          return { destroyed: set.destroy, notDestroyed: null };
        }
      }
      throw new Error(name);
    },
    request() {
      throw new Error("not used");
    },
  };
  return { caller: caller as unknown as MethodCaller, calls };
}

describe("contact calls", () => {
  it("loads every card", async () => {
    const { caller } = fakeCaller([bob, noName]);
    const r = await loadContactCards(caller);
    expect(r.cards.map((c) => c.id)).toEqual(["1", "2"]);
    expect(r.state).toBe("s1");
  });

  it("creates in the default address book, and surfaces a refusal", async () => {
    const { caller, calls } = fakeCaller([]);
    await expect(
      createContact(caller, {
        name: "N",
        emails: ["n@x.test"],
        phones: [],
        note: "",
      }),
    ).resolves.toBe("9");
    const set = calls.find(([n]) => n === "ContactCard/set")![1] as {
      create: { new: ContactCard };
    };
    expect(set.create.new.addressBookIds).toEqual({ b: true });
    await expect(updateContact(caller, { ...bob, id: "7" }, contactDraft(bob))).rejects.toThrow("nope");
    await expect(deleteContact(caller, "1")).resolves.toBeUndefined();
  });
});
