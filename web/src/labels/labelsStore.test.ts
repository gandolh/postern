// The label tree (nesting, role mapping, counts, hidden labels) and the store
// that keeps it current with Mailbox/get and Mailbox/changes.

import {
  JmapMethodError,
  JmapNetworkError,
  SessionExpiredError,
  type Mailbox,
  type MethodCaller,
  type StateChange,
} from "@postern/jmap";
import { describe, expect, it } from "vitest";
import { buildLabels, INITIAL_LABELS, LabelsStore, resolveLabelRoute, viewForRole } from "./labelsStore";

const RIGHTS = {
  mayReadItems: true,
  mayAddItems: true,
  mayRemoveItems: true,
  maySetSeen: true,
  maySetKeywords: true,
  mayCreateChild: true,
  mayRename: true,
  mayDelete: true,
  maySubmit: true,
};

function mailbox(m: Partial<Mailbox> & Pick<Mailbox, "id" | "name">): Mailbox {
  return {
    parentId: null,
    role: null,
    sortOrder: 0,
    totalEmails: 0,
    unreadEmails: 0,
    totalThreads: 0,
    unreadThreads: 0,
    myRights: RIGHTS,
    isSubscribed: true,
    ...m,
  };
}

/** Alice on the dev server (dev/seed/manifest.json), in Stalwart's order and names. */
const ALICE: Mailbox[] = [
  mailbox({ id: "j", name: "Clients", parentId: "i", unreadThreads: 1, totalThreads: 2, unreadEmails: 1, totalEmails: 2 }),
  mailbox({ id: "i", name: "Work", unreadThreads: 14, totalThreads: 225, unreadEmails: 15, totalEmails: 245 }),
  mailbox({ id: "h", name: "Archive", role: "archive", unreadThreads: 19, totalThreads: 403, unreadEmails: 19, totalEmails: 437 }),
  mailbox({ id: "e", name: "Sent Items", role: "sent", totalThreads: 157, totalEmails: 224 }),
  mailbox({ id: "b", name: "Deleted Items", role: "trash", unreadThreads: 1, totalThreads: 3, unreadEmails: 1, totalEmails: 3 }),
  mailbox({ id: "c", name: "Junk Mail", role: "junk", unreadThreads: 3, totalThreads: 4, unreadEmails: 3, totalEmails: 4 }),
  mailbox({ id: "m", name: "Hostile", unreadThreads: 5, totalThreads: 17, unreadEmails: 5, totalEmails: 17 }),
  mailbox({ id: "d", name: "Drafts", role: "drafts", totalThreads: 2, totalEmails: 2 }),
  mailbox({ id: "a", name: "Inbox", role: "inbox", unreadThreads: 127, totalThreads: 2035, unreadEmails: 128, totalEmails: 2144 }),
  mailbox({ id: "k", name: "Receipts", unreadThreads: 15, totalThreads: 240, unreadEmails: 15, totalEmails: 240 }),
  mailbox({ id: "l", name: "Travel", unreadThreads: 5, totalThreads: 138, unreadEmails: 5, totalEmails: 147 }),
];

describe("buildLabels", () => {
  const built = buildLabels(ALICE);

  it("finds system labels by role and shows Gmail's words", () => {
    expect(built.system.inbox.label?.id).toBe("a");
    expect(built.system.spam.label?.id).toBe("c");
    expect(built.system.spam.title).toBe("Spam");
    expect(built.system.spam.label?.name).toBe("Junk Mail");
    expect(built.system.spam.label?.title).toBe("Spam");
    expect(built.system.trash.label?.title).toBe("Trash");
    expect(built.system.sent.label?.title).toBe("Sent");
    expect(built.system.all.title).toBe("All Mail");
    expect(built.system.all.label?.id).toBe("h");
    expect(built.system.starred.label).toBeUndefined();
    expect(built.system.starred.role).toBeNull();
    expect(viewForRole("junk")).toBe("spam");
    expect(viewForRole("archive")).toBe("all");
    expect(viewForRole("important")).toBeUndefined();
  });

  it("puts unread conversations on Inbox and Spam, the draft count on Drafts, nothing on the rest", () => {
    expect(built.system.inbox.badge).toBe(127);
    expect(built.system.spam.badge).toBe(3);
    expect(built.system.drafts.badge).toBe(2);
    expect(built.system.sent.badge).toBeNull();
    expect(built.system.trash.badge).toBeNull();
    expect(built.system.all.badge).toBeNull();
    expect(built.system.starred.badge).toBeNull();
  });

  it("nests user labels by parentId, sorted by sortOrder then name", () => {
    expect(built.tree.map((n) => n.label.title)).toEqual(["Hostile", "Receipts", "Travel", "Work"]);
    const work = built.tree.find((n) => n.label.id === "i")!;
    expect(work.depth).toBe(0);
    expect(work.children.map((n) => [n.label.title, n.depth, n.label.path])).toEqual([["Clients", 1, "Work/Clients"]]);
    expect(work.label.unreadThreads).toBe(14);
    expect(built.hidden).toEqual([]);
  });

  it("lists system labels first in Gmail's order, then the tree", () => {
    expect(built.labels.map((l) => l.id)).toEqual(["a", "e", "d", "c", "b", "h", "m", "k", "l", "i", "j"]);
    expect(built.byId.get("j")?.path).toBe("Work/Clients");
  });

  it("keeps All Mail without a mailbox when the account has no archive (Stalwart's default)", () => {
    const fresh = buildLabels(ALICE.filter((m) => m.role !== "archive"));
    expect(fresh.system.all.label).toBeUndefined();
    expect(fresh.system.all.title).toBe("All Mail");
  });

  it("finds Snoozed by name, a system label outside the user labels (brief 24)", () => {
    const b = buildLabels([...ALICE, mailbox({ id: "s", name: "Snoozed", isSubscribed: false }), mailbox({ id: "t", name: "Snoozed", parentId: "i" })]);
    expect(b.system.snoozed.label?.id).toBe("s");
    expect(b.system.snoozed.title).toBe("Snoozed");
    expect(b.labels.find((l) => l.id === "s")?.system).toBe("snoozed");
    expect([...b.tree, ...b.hidden].map((n) => n.label.id)).not.toContain("s");
    // A sublabel called Snoozed is an ordinary label.
    expect(b.byId.get("t")?.system).toBeNull();
    expect(buildLabels(ALICE).system.snoozed.label).toBeUndefined();
  });

  it("puts unsubscribed top-level labels under More, with their sublabels", () => {
    const b = buildLabels([
      mailbox({ id: "x", name: "Old", isSubscribed: false }),
      mailbox({ id: "y", name: "Older", parentId: "x", isSubscribed: true }),
      mailbox({ id: "z", name: "Kept" }),
    ]);
    expect(b.tree.map((n) => n.label.id)).toEqual(["z"]);
    expect(b.hidden.map((n) => n.label.id)).toEqual(["x"]);
    expect(b.hidden[0]!.children.map((n) => n.label.id)).toEqual(["y"]);
  });

  it("honours sortOrder before name", () => {
    const b = buildLabels([mailbox({ id: "1", name: "Alpha", sortOrder: 5 }), mailbox({ id: "2", name: "Zulu", sortOrder: 1 })]);
    expect(b.tree.map((n) => n.label.title)).toEqual(["Zulu", "Alpha"]);
  });

  it("treats a second mailbox with a taken role, and unknown roles, as user labels", () => {
    const b = buildLabels([
      mailbox({ id: "a", name: "Inbox", role: "inbox" }),
      mailbox({ id: "a2", name: "Inbox 2", role: "inbox", sortOrder: 9 }),
      mailbox({ id: "imp", name: "Important", role: "important" }),
    ]);
    expect(b.system.inbox.label?.id).toBe("a");
    expect(b.tree.map((n) => n.label.title).sort()).toEqual(["Important", "Inbox 2"]);
  });

  it("survives a parent cycle and a missing parent", () => {
    const b = buildLabels([
      mailbox({ id: "p", name: "P", parentId: "q" }),
      mailbox({ id: "q", name: "Q", parentId: "p" }),
      mailbox({ id: "orphan", name: "Orphan", parentId: "gone" }),
      mailbox({ id: "inbox", name: "Inbox", role: "inbox" }),
      mailbox({ id: "sub", name: "Sub", parentId: "inbox" }),
    ]);
    const ids = (nodes: typeof b.tree): string[] => nodes.flatMap((n) => [n.label.id, ...ids(n.children)]);
    expect(ids(b.tree).sort()).toEqual(["orphan", "p", "q", "sub"]);
    expect(b.tree.find((n) => n.label.id === "sub")?.label.path).toBe("Inbox/Sub");
  });
});

describe("resolveLabelRoute", () => {
  const built = buildLabels(ALICE);

  it("resolves system labels by role, Starred to the $flagged keyword", () => {
    expect(resolveLabelRoute({ kind: "system", view: "spam" }, built)).toMatchObject({ title: "Spam", mailboxId: "c", view: "spam" });
    expect(resolveLabelRoute({ kind: "system", view: "starred" }, built)).toMatchObject({ title: "Starred", mailboxId: undefined, keyword: "$flagged" });
  });

  it("resolves user labels by id, and an unknown id to null", () => {
    expect(resolveLabelRoute({ kind: "label", labelId: "j" }, built)).toMatchObject({ title: "Clients", mailboxId: "j", view: null });
    expect(resolveLabelRoute({ kind: "label", labelId: "nope" }, built)).toBeNull();
  });

  it("gives a system mailbox reached by id its Gmail title", () => {
    expect(resolveLabelRoute({ kind: "label", labelId: "c" }, built)).toMatchObject({ title: "Spam", view: "spam" });
  });
});

// ---- The store ---------------------------------------------------------------

type Handler = (args: Record<string, unknown>) => unknown;

function fakeServer(handlers: Record<string, Handler>) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const caller: MethodCaller = {
    call: (async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const handler = handlers[name];
      if (!handler) throw new Error(`unexpected ${name}`);
      return handler(args);
    }) as MethodCaller["call"],
    request: () => {
      throw new Error("not used");
    },
  };
  return { caller, calls };
}

function change(state: string): StateChange {
  return { "@type": "StateChange", changed: { A: { Mailbox: state } } };
}

describe("LabelsStore", () => {
  it("loads every mailbox, then follows Mailbox/changes", async () => {
    let inbox = ALICE.find((m) => m.id === "a")!;
    const { caller, calls } = fakeServer({
      "Mailbox/get": (args) =>
        args["ids"] === null ? { accountId: "A", state: "s1", list: ALICE, notFound: [] } : { accountId: "A", state: "s2", list: [inbox], notFound: [] },
      "Mailbox/changes": () => ({ accountId: "A", oldState: "s1", newState: "s2", hasMoreChanges: false, created: [], updated: ["a"], destroyed: [], updatedProperties: null }),
    });
    const store = new LabelsStore(caller, () => "A");
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getSnapshot().status));
    expect(store.getSnapshot()).toBe(INITIAL_LABELS);

    await store.sync();
    expect(store.getSnapshot().status).toBe("ready");
    expect(store.getSnapshot().system.inbox.badge).toBe(127);
    expect(store.state).toBe("s1");
    expect(store.mailboxIdForRole("junk")).toBe("c");
    expect(store.mailboxIdForRole("archive")).toBe("h");

    inbox = { ...inbox, unreadThreads: 126 };
    await store.applyStateChange(change("s1")); // same state: nothing to do
    expect(calls.filter((c) => c.name === "Mailbox/changes")).toHaveLength(0);
    await store.applyStateChange({ "@type": "StateChange", changed: { OTHER: { Mailbox: "s9" } } }); // another account
    expect(calls.filter((c) => c.name === "Mailbox/changes")).toHaveLength(0);

    await store.applyStateChange(change("s2"));
    expect(calls.map((c) => c.name)).toEqual(["Mailbox/get", "Mailbox/changes", "Mailbox/get"]);
    expect(calls[2]!.args["ids"]).toEqual(["a"]);
    expect(store.getSnapshot().system.inbox.badge).toBe(126);
    expect(store.state).toBe("s2");
    expect(seen).toEqual(["ready", "ready"]);
  });

  it("loads everything again when the server cannot calculate changes", async () => {
    let loads = 0;
    const { caller } = fakeServer({
      "Mailbox/get": () => ({ accountId: "A", state: `s${++loads}`, list: loads === 1 ? ALICE : ALICE.filter((m) => m.id !== "m"), notFound: [] }),
      "Mailbox/changes": () => {
        throw new JmapMethodError("Mailbox/changes", "c0", { type: "cannotCalculateChanges" });
      },
    });
    const store = new LabelsStore(caller, () => "A");
    await store.sync();
    expect(store.getSnapshot().byId.has("m")).toBe(true);
    await store.sync();
    expect(loads).toBe(2);
    expect(store.getSnapshot().byId.has("m")).toBe(false);
    expect(store.getSnapshot().status).toBe("ready");
  });

  it("shares a running sync and runs one more after it", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let gets = 0;
    let changes = 0;
    const { caller } = fakeServer({
      "Mailbox/get": async () => {
        gets++;
        await gate;
        return { accountId: "A", state: "s1", list: ALICE, notFound: [] };
      },
      "Mailbox/changes": () => {
        changes++;
        return { accountId: "A", oldState: "s1", newState: "s1", hasMoreChanges: false, created: [], updated: [], destroyed: [], updatedProperties: null };
      },
    });
    const store = new LabelsStore(caller, () => "A");
    const first = store.sync();
    const second = store.sync();
    const third = store.sync();
    release();
    await Promise.all([first, second, third]);
    expect(gets).toBe(1);
    expect(changes).toBe(1);
  });

  it("reports a network failure as offline, keeping the labels it has", async () => {
    let fail = false;
    const { caller } = fakeServer({
      "Mailbox/get": () => ({ accountId: "A", state: "s1", list: ALICE, notFound: [] }),
      "Mailbox/changes": () => {
        if (fail) throw new JmapNetworkError("down");
        return { accountId: "A", oldState: "s1", newState: "s1", hasMoreChanges: false, created: [], updated: [], destroyed: [], updatedProperties: null };
      },
    });
    const store = new LabelsStore(caller, () => "A");
    await store.sync();
    fail = true;
    await store.sync();
    expect(store.getSnapshot()).toMatchObject({ status: "ready", offline: true });
    expect(store.getSnapshot().labels).toHaveLength(ALICE.length);
    fail = false;
    await store.sync();
    expect(store.getSnapshot()).toMatchObject({ status: "ready", offline: false, error: null });
  });

  it("is an error state when the first load fails", async () => {
    const { caller } = fakeServer({
      "Mailbox/get": () => {
        throw new JmapNetworkError("down");
      },
    });
    const store = new LabelsStore(caller, () => "A");
    await store.sync();
    expect(store.getSnapshot()).toMatchObject({ status: "error", offline: true });
  });

  it("stays quiet about an expired session (the sign-in layer shows that)", async () => {
    const { caller } = fakeServer({
      "Mailbox/get": () => {
        throw new SessionExpiredError();
      },
    });
    const store = new LabelsStore(caller, () => "A");
    await store.sync();
    expect(store.getSnapshot()).toBe(INITIAL_LABELS);
  });

  it("stops publishing once disposed", async () => {
    const { caller } = fakeServer({ "Mailbox/get": () => ({ accountId: "A", state: "s1", list: ALICE, notFound: [] }) });
    const store = new LabelsStore(caller, () => "A");
    store.dispose();
    await store.sync();
    expect(store.getSnapshot()).toBe(INITIAL_LABELS);
    store.activate();
    await store.sync();
    expect(store.getSnapshot().status).toBe("ready");
  });
});
