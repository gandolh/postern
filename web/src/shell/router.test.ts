// @vitest-environment jsdom
// The hash routes: parse and format round trip, unknown hashes, conversation
// helpers, and navigation with push and replace.

import { afterEach, describe, expect, it } from "vitest";
import {
  formatRoute,
  getRoute,
  INBOX,
  isCanonicalHash,
  isMailRoute,
  navigate,
  parseRoute,
  sameList,
  subscribeRoute,
  withConversation,
  withoutConversation,
  type Route,
} from "./router";

const ROUTES: Route[] = [
  { kind: "system", view: "inbox" },
  { kind: "system", view: "starred" },
  { kind: "system", view: "sent" },
  { kind: "system", view: "drafts" },
  { kind: "system", view: "spam" },
  { kind: "system", view: "trash" },
  { kind: "system", view: "all" },
  { kind: "system", view: "inbox", conversationId: "Tabc123" },
  { kind: "system", view: "spam", conversationId: "T-_x" },
  { kind: "label", labelId: "i" },
  { kind: "label", labelId: "i", conversationId: "T9" },
  { kind: "label", labelId: "weird/id #%?" },
  { kind: "search", query: "from:bob has:attachment" },
  { kind: "search", query: 'subject:"a/b" 100% #tag ?x' },
  { kind: "search", query: "café ✉", conversationId: "T7" },
  { kind: "settings", section: "general" },
  { kind: "settings", section: "filters" },
  { kind: "contacts" },
];

describe("parseRoute and formatRoute", () => {
  it.each(ROUTES.map((r) => [formatRoute(r), r] as const))("round-trips %s", (hash, route) => {
    expect(hash.startsWith("#")).toBe(true);
    expect(parseRoute(hash)).toEqual(route);
    expect(formatRoute(parseRoute(hash))).toBe(hash);
    expect(isCanonicalHash(hash)).toBe(true);
  });

  it("writes Gmail's hashes", () => {
    expect(formatRoute({ kind: "system", view: "inbox" })).toBe("#inbox");
    expect(formatRoute({ kind: "system", view: "all" })).toBe("#all");
    expect(formatRoute({ kind: "label", labelId: "i" })).toBe("#label/i");
    expect(formatRoute({ kind: "system", view: "inbox", conversationId: "T1" })).toBe("#inbox/T1");
    expect(formatRoute({ kind: "label", labelId: "i", conversationId: "T1" })).toBe("#label/i/T1");
    expect(formatRoute({ kind: "search", query: "a b/c" })).toBe("#search/a%20b%2Fc");
    expect(formatRoute({ kind: "settings", section: "general" })).toBe("#settings/general");
    expect(formatRoute({ kind: "contacts" })).toBe("#contacts");
  });

  it("parses without the leading #", () => {
    expect(parseRoute("label/i/T2")).toEqual({ kind: "label", labelId: "i", conversationId: "T2" });
  });

  it("reads #settings alone as the general section", () => {
    expect(parseRoute("#settings")).toEqual({ kind: "settings", section: "general" });
    expect(parseRoute("#settings/")).toEqual({ kind: "settings", section: "general" });
    expect(isCanonicalHash("#settings")).toBe(false);
  });

  it.each([
    "",
    "#",
    "#bogus",
    "#Inbox",
    "#inbox/",
    "#inbox/a/b",
    "#label",
    "#label/",
    "#label/i/T1/extra",
    "#search",
    "#search/",
    "#search/%20%20",
    "#search/%E0%A4%A",
    "#label/%E0%A4%A",
    "#inbox/%E0%A4%A",
    "#settings/a/b",
    "#contacts/x",
    "#main",
  ])("sends %j to the Inbox", (hash) => {
    expect(parseRoute(hash)).toEqual(INBOX);
    expect(isCanonicalHash(hash)).toBe(hash === "#inbox");
  });
});

describe("conversation helpers", () => {
  it("opens and closes a conversation on the same list", () => {
    const list = { kind: "label", labelId: "i" } as const;
    const open = withConversation(list, "T1");
    expect(open).toEqual({ kind: "label", labelId: "i", conversationId: "T1" });
    expect(withoutConversation(open)).toEqual(list);
    expect("conversationId" in withoutConversation(open)).toBe(false);
    expect(sameList(open, list)).toBe(true);
    expect(sameList(open, { kind: "label", labelId: "j" })).toBe(false);
    expect(sameList({ kind: "contacts" }, { kind: "contacts" })).toBe(false);
  });

  it("knows which routes show conversations", () => {
    expect(isMailRoute({ kind: "system", view: "trash" })).toBe(true);
    expect(isMailRoute({ kind: "search", query: "x" })).toBe(true);
    expect(isMailRoute({ kind: "settings", section: "general" })).toBe(false);
    expect(isMailRoute({ kind: "contacts" })).toBe(false);
  });
});

describe("navigate", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "#inbox");
  });

  it("pushes a history entry, and the route follows", async () => {
    window.history.replaceState(null, "", "#inbox");
    const before = window.history.length;
    navigate({ kind: "system", view: "sent" });
    expect(window.location.hash).toBe("#sent");
    expect(window.history.length).toBe(before + 1);
    expect(getRoute()).toEqual({ kind: "system", view: "sent" });
  });

  it("replaces without a new entry, and tells subscribers", () => {
    window.history.replaceState(null, "", "#bogus");
    const before = window.history.length;
    let calls = 0;
    const unsubscribe = subscribeRoute(() => calls++);
    navigate(INBOX, { replace: true });
    unsubscribe();
    expect(window.location.hash).toBe("#inbox");
    expect(window.history.length).toBe(before);
    expect(calls).toBe(1);
  });

  it("does nothing when already there", () => {
    window.history.replaceState(null, "", "#drafts");
    const before = window.history.length;
    navigate({ kind: "system", view: "drafts" });
    expect(window.history.length).toBe(before);
  });

  it("returns the same route object until the hash changes", () => {
    window.history.replaceState(null, "", "#label/i");
    expect(getRoute()).toBe(getRoute());
  });
});
