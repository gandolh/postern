import { describe, expect, it } from "vitest";
import { collectOtherContacts } from "./other";
import { matchTier, mergeCandidates, rankCandidates, type Candidate } from "./ranking";

const c = (name: string | null, email: string, extra: Partial<Candidate> = {}): Candidate => ({ name, email, provenance: "other", count: 1, last: 0, ...extra });

describe("matchTier", () => {
  it("tells the start of the name or address from a later word from a substring", () => {
    expect(matchTier({ name: "Bob Baker", email: "x@y.test" }, "bo")).toBe(0);
    expect(matchTier({ name: null, email: "bob@y.test" }, "bob@")).toBe(0);
    expect(matchTier({ name: "Alice Bobson", email: "x@y.test" }, "bo")).toBe(1);
    expect(matchTier({ name: null, email: "carol.chen@y.test" }, "ch")).toBe(1);
    expect(matchTier({ name: null, email: "xbobx@y.test" }, "bob")).toBe(2);
    expect(matchTier({ name: null, email: "xbobx@y.test" }, "bo")).toBeNull();
    expect(matchTier({ name: "Zed", email: "z@y.test" }, "")).toBeNull();
  });
});

describe("rankCandidates", () => {
  it("puts earlier matches first, then contacts over others, then frequency, then recency", () => {
    const list = [
      c("Alice Bobson", "alice@x.test", { provenance: "contact" }),
      c("Bo Other", "other@x.test", { count: 9 }),
      c("Bob Rare", "rare@x.test", { count: 1, last: 5 }),
      c("Bob Often", "often@x.test", { count: 7, last: 1 }),
      c("Bob Contact", "contact@x.test", { provenance: "contact", count: 0 }),
      c("Bob Recent", "recent@x.test", { count: 1, last: 50 }),
    ];
    expect(rankCandidates(list, "Bo", 10).map((x) => x.email)).toEqual([
      "contact@x.test",
      "other@x.test",
      "often@x.test",
      "recent@x.test",
      "rare@x.test",
      "alice@x.test",
    ]);
  });

  it("merges a contact with its sending history, keeps the contact's name, and limits", () => {
    const merged = mergeCandidates([c("bob", "Bob@x.test", { count: 4, last: 8 }), c("Bob Baker", "bob@x.test", { provenance: "contact", count: 0 })]);
    expect(merged).toEqual([{ name: "Bob Baker", email: "Bob@x.test", provenance: "contact", count: 4, last: 8, viaGroup: undefined }]);
    expect(rankCandidates([c("Ann", "a@x.test"), c("Abe", "abe@x.test")], "a", 1)).toHaveLength(1);
    expect(rankCandidates([c("Ann", "a@x.test")], "  ", 5)).toEqual([]);
  });

  it("offers a matching group's members first, even when the query matches only the group", () => {
    const list = [c("Zed", "zed@x.test", { provenance: "contact", viaGroup: true }), c("Team Lead", "lead@x.test", { count: 30 })];
    expect(rankCandidates(list, "team", 5).map((x) => x.email)).toEqual(["zed@x.test", "lead@x.test"]);
  });
});

describe("Other contacts", () => {
  it("counts every address in to, cc and bcc, newest time and first name seen", () => {
    const map = collectOtherContacts([
      { receivedAt: "2026-10-01T00:00:00Z", to: [{ name: null, email: "Bob@x.test" }], cc: [{ name: "Cy", email: "cy@x.test" }] },
      { receivedAt: "2026-10-03T00:00:00Z", to: [{ name: "Bob Baker", email: "bob@x.test" }], bcc: [{ name: null, email: "" }] },
    ]);
    const bob = map.get("bob@x.test");
    expect(bob).toMatchObject({ name: "Bob Baker", email: "Bob@x.test", count: 2, provenance: "other", last: Date.parse("2026-10-03T00:00:00Z") });
    expect([...map.keys()].sort()).toEqual(["bob@x.test", "cy@x.test"]);
  });
});
