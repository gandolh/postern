import { SessionExpiredError, type JmapClient, type MethodCaller } from "@postern/jmap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAllMail } from "./allMail";
import { subscribeMailChanges, type MailChange } from "./bus";
import type { Conversation, ConversationMessage, ConversationScope } from "./conversation";
import { fakeEmail, FakeMail, MAILBOXES, ROLES, type FakeEmail } from "./fakeMail";
import { createMailActions, type MailActions } from "./runner";
import { clearUndo, peekUndo, undoLast } from "./undo";

const scope: ConversationScope = { kind: "normal", roles: { ...ROLES } };

function conversations(mail: FakeMail, ...threadIds: string[]): Conversation[] {
  return threadIds.map((id) => ({
    id,
    messages: [...mail.emails.values()]
      .filter((e) => e.threadId === id)
      .sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1))
      .map((e): ConversationMessage => ({ id: e.id, threadId: e.threadId, mailboxIds: { ...e.mailboxIds }, keywords: { ...e.keywords }, receivedAt: e.receivedAt })),
  }));
}

function snapshot(mail: FakeMail): Record<string, Pick<FakeEmail, "mailboxIds" | "keywords">> {
  return Object.fromEntries([...mail.emails].map(([id, e]) => [id, { mailboxIds: { ...e.mailboxIds }, keywords: { ...e.keywords } }]));
}

interface Harness {
  mail: FakeMail;
  client: JmapClient;
  actions: MailActions;
  toasts: { message: string; action?: { label: string; onClick: () => void } }[];
  changes: MailChange[];
  syncLabels: ReturnType<typeof vi.fn>;
  roles: Record<string, string>;
}

let unsubscribe: (() => void) | null = null;

async function harness(
  emails: FakeEmail[],
  options: { roles?: Record<string, string>; maxObjectsInSet?: number; caller?: MethodCaller; noun?: () => "conversation" | "message" } = {},
): Promise<Harness> {
  const mailboxes = options.roles && !options.roles["archive"] ? MAILBOXES.filter((m) => m.role !== "archive") : MAILBOXES;
  const mail = new FakeMail({ mailboxes, emails, maxObjectsInSet: options.maxObjectsInSet });
  const client = await mail.connect();
  const toasts: Harness["toasts"] = [];
  const changes: MailChange[] = [];
  unsubscribe = subscribeMailChanges((c) => changes.push(c));
  const roles: Record<string, string> = { ...(options.roles ?? ROLES) };
  const syncLabels = vi.fn();
  const labels = {
    mailboxIdForRole: (role: string) => roles[role],
    sync: async () => {
      const archive = mail.mailboxes.find((m) => m.role === "archive");
      if (archive) roles["archive"] = archive.id;
    },
  };
  const caller = options.caller ?? client;
  const actions = createMailActions({
    caller,
    roles: () => ({ ...roles }),
    ensureAllMail: () => ensureAllMail(caller, labels),
    syncLabels,
    toast: { show: (t) => void toasts.push(t) },
    ...(options.noun ? { noun: options.noun } : {}),
  });
  return { mail, client, actions, toasts, changes, syncLabels, roles };
}

beforeEach(() => clearUndo());
afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
});

describe("archive", () => {
  it("applies locally first, sends one Email/set, toasts with Undo, and Undo restores the server exactly", async () => {
    const h = await harness([
      fakeEmail({ id: "1", threadId: "T1", mailboxIds: { a: true } }),
      fakeEmail({ id: "2", threadId: "T1", mailboxIds: { e: true }, keywords: { $seen: true } }),
      fakeEmail({ id: "3", threadId: "T2", mailboxIds: { a: true, i: true }, keywords: { $flagged: true } }),
    ]);
    const before = snapshot(h.mail);
    const requestsBefore = h.mail.posts.length;

    expect(await h.actions.archive(conversations(h.mail, "T1", "T2"), scope)).toBe("done");

    expect(h.changes[0]).toEqual({ kind: "patch", update: { "1": { "mailboxIds/a": null, "mailboxIds/h": true }, "3": { "mailboxIds/a": null } } });
    expect(h.changes.at(-1)).toEqual({ kind: "settled" });
    expect(h.mail.calls().slice(requestsBefore)).toEqual([["Email/set"]]);
    expect(h.mail.emails.get("1")!.mailboxIds).toEqual({ h: true });
    expect(h.mail.emails.get("3")!.mailboxIds).toEqual({ i: true });
    expect(h.syncLabels).toHaveBeenCalled();
    expect(h.toasts).toEqual([{ message: "2 conversations archived.", action: { label: "Undo", onClick: expect.any(Function) } }]);
    expect(peekUndo()).toEqual({ label: "2 conversations archived." });

    h.toasts[0]!.action!.onClick();
    await vi.waitFor(() => expect(h.toasts.at(-1)?.message).toBe("Action undone."));
    expect(snapshot(h.mail)).toEqual(before);
    expect(peekUndo()).toBeNull();
  });

  it("says one conversation in the singular", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1" })]);
    await h.actions.archive(conversations(h.mail, "T1"), scope);
    expect(h.toasts[0]!.message).toBe("Conversation archived.");
  });

  it("counts messages when the list's rows are messages, unless the caller says otherwise (brief 26)", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1" }), fakeEmail({ id: "2", threadId: "T2" })], { noun: () => "message" });
    await h.actions.archive(conversations(h.mail, "T1", "T2"), scope);
    expect(h.toasts[0]!.message).toBe("2 messages archived.");
    expect(peekUndo()?.label).toBe("2 messages archived.");
    await h.actions.markRead(conversations(h.mail, "T1"), scope, { noun: "conversation" });
    expect(h.toasts.at(-1)!.message).toBe("Conversation marked as read.");
  });

  it("creates All Mail on first need, uses it, and syncs the labels", async () => {
    const roles = { inbox: "a", trash: "b", junk: "c", sent: "e", drafts: "d" };
    const h = await harness([fakeEmail({ id: "1", threadId: "T1" }), fakeEmail({ id: "2", threadId: "T2" })], { roles });
    expect(h.mail.mailboxes.some((m) => m.role === "archive")).toBe(false);

    await Promise.all([h.actions.archive(conversations(h.mail, "T1"), scope), h.actions.archive(conversations(h.mail, "T2"), scope)]);

    const created = h.mail.mailboxes.filter((m) => m.role === "archive");
    expect(created).toEqual([{ id: expect.any(String), name: "Archive", role: "archive", parentId: null }]);
    expect(h.mail.emails.get("1")!.mailboxIds).toEqual({ [created[0]!.id]: true });
    expect(h.mail.emails.get("2")!.mailboxIds).toEqual({ [created[0]!.id]: true });
    expect(h.roles["archive"]).toBe(created[0]!.id);
  });

  it("gives an existing top-level Archive folder the role rather than making a second", async () => {
    const mailboxes = [...MAILBOXES.filter((m) => m.role !== "archive"), { id: "z", name: "Archive", role: null, parentId: null }];
    const mail = new FakeMail({ mailboxes, emails: [] });
    const client = await mail.connect();
    const labels = { mailboxIdForRole: () => undefined, sync: vi.fn(async () => {}) };
    expect(await ensureAllMail(client, labels)).toBe("z");
    expect(mail.mailboxes.find((m) => m.id === "z")!.role).toBe("archive");
    expect(labels.sync).toHaveBeenCalledOnce();
  });

  it("does not archive a conversation with a label and no All Mail without asking the server", async () => {
    const roles = { inbox: "a", trash: "b", junk: "c" };
    const h = await harness([fakeEmail({ id: "1", threadId: "T1", mailboxIds: { a: true, i: true } })], { roles });
    await h.actions.archive(conversations(h.mail, "T1"), scope);
    expect(h.mail.calls()).toEqual([["Email/set"]]);
    expect(h.mail.mailboxes.some((m) => m.role === "archive")).toBe(false);
  });

  it("rolls back and explains when the request fails", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1" })]);
    const before = snapshot(h.mail);
    h.mail.failWith = (name) => (name === "Email/set" ? "network" : undefined);

    expect(await h.actions.archive(conversations(h.mail, "T1"), scope)).toBe("failed");

    expect(h.changes.map((c) => c.kind)).toEqual(["patch", "patch", "settled"]);
    expect(h.changes[1]).toEqual({ kind: "patch", update: { "1": { "mailboxIds/a": true, "mailboxIds/h": null } } });
    expect(h.toasts).toEqual([{ message: "Couldn't archive the conversation." }]);
    expect(snapshot(h.mail)).toEqual(before);
    expect(peekUndo()).toBeNull();
  });

  it("keeps what the server took when it refuses some, and puts the rest back", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1" }), fakeEmail({ id: "2", threadId: "T2" })]);
    h.mail.failWith = (name, args) => {
      if (name !== "Email/set") return undefined;
      const update = args["update"] as Record<string, unknown>;
      return ["Email/set", { accountId: "A", oldState: "s0", newState: "s1", updated: { "1": null }, notUpdated: { "2": { type: "forbidden" } }, ...(update ? {} : {}) }];
    };
    expect(await h.actions.archive(conversations(h.mail, "T1", "T2"), scope)).toBe("partial");
    expect(h.changes[1]).toEqual({ kind: "patch", update: { "2": { "mailboxIds/a": true, "mailboxIds/h": null } } });
    expect(h.toasts[0]!.message).toBe("Couldn't archive the conversation.");
    expect(h.toasts[0]!.action?.label).toBe("Undo");
    expect(peekUndo()).toEqual({ label: "Conversation archived." });
  });

  it("stays quiet when the session expired (the sign-in layer shows that)", async () => {
    const mail = new FakeMail({ mailboxes: MAILBOXES, emails: [fakeEmail({ id: "1", threadId: "T1" })] });
    const expired: MethodCaller = {
      call: async () => {
        throw new SessionExpiredError();
      },
      request: () => {
        throw new SessionExpiredError();
      },
    };
    const h = await harness([...mail.emails.values()], { caller: expired });
    expect(await h.actions.archive(conversations(h.mail, "T1"), scope)).toBe("failed");
    expect(h.toasts).toEqual([]);
    expect(h.changes.map((c) => c.kind)).toEqual(["patch", "patch", "settled"]);
  });

  it("splits a big bulk action by maxObjectsInSet", async () => {
    const emails = Array.from({ length: 5 }, (_, i) => fakeEmail({ id: `m${i}`, threadId: `T${i}` }));
    const h = await harness(emails, { maxObjectsInSet: 2 });
    await h.actions.archive(conversations(h.mail, "T0", "T1", "T2", "T3", "T4"), scope);
    expect(h.mail.calls()).toEqual([["Email/set", "Email/set", "Email/set"]]);
    expect([...h.mail.emails.values()].every((e) => e.mailboxIds["h"] && !e.mailboxIds["a"])).toBe(true);
  });
});

describe("the other actions", () => {
  it("delete moves to Trash and undo puts every label back", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1", mailboxIds: { a: true, i: true } })]);
    const before = snapshot(h.mail);
    await h.actions.trash(conversations(h.mail, "T1"), scope);
    expect(h.mail.emails.get("1")!.mailboxIds).toEqual({ b: true });
    expect(h.toasts[0]!.message).toBe("Conversation moved to Trash.");
    expect(await undoLast()).toBe(true);
    expect(snapshot(h.mail)).toEqual(before);
    expect(await undoLast()).toBe(false);
  });

  it("star without a toast is still undoable with undoLast (z)", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1" }), fakeEmail({ id: "2", threadId: "T1", receivedAt: "2026-10-09T00:00:00Z" })]);
    await h.actions.star(conversations(h.mail, "T1"), scope, { toast: false });
    expect(h.toasts).toEqual([]);
    expect(h.mail.emails.get("2")!.keywords).toEqual({ $flagged: true });
    expect(h.mail.emails.get("1")!.keywords).toEqual({});
    await undoLast();
    expect(h.mail.emails.get("2")!.keywords).toEqual({});
    expect(h.toasts.at(-1)!.message).toBe("Action undone.");
  });

  it("archive, then a quiet star: the toast's Undo undoes the archive, and z the star", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1" }), fakeEmail({ id: "2", threadId: "T2" })]);
    await h.actions.archive(conversations(h.mail, "T1"), scope);
    const archiveToast = h.toasts.at(-1)!;
    expect(archiveToast.message).toBe("Conversation archived.");
    await h.actions.star(conversations(h.mail, "T2"), scope, { toast: false });
    // The archive's toast is still the one on screen; z now means the star.
    expect(h.toasts.at(-1)).toBe(archiveToast);
    expect(peekUndo()).toEqual({ label: "Conversation starred." });

    archiveToast.action!.onClick();
    await vi.waitFor(() => expect(h.mail.emails.get("1")!.mailboxIds).toEqual({ a: true }));
    expect(h.mail.emails.get("2")!.keywords).toEqual({ $flagged: true });
    expect(peekUndo()).toEqual({ label: "Conversation starred." });

    expect(await undoLast()).toBe(true);
    expect(h.mail.emails.get("2")!.keywords).toEqual({});
    expect(h.mail.emails.get("1")!.mailboxIds).toEqual({ a: true });
    expect(peekUndo()).toBeNull();
  });

  it("an entry runs once: after z undid the archive, its toast's Undo does nothing", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1" })]);
    await h.actions.archive(conversations(h.mail, "T1"), scope);
    const archiveToast = h.toasts.at(-1)!;
    expect(await undoLast()).toBe(true);
    const posts = h.mail.posts.length;
    archiveToast.action!.onClick();
    await new Promise((r) => setTimeout(r, 20));
    expect(h.mail.posts.length).toBe(posts);
    expect(h.mail.emails.get("1")!.mailboxIds).toEqual({ a: true });
  });

  it("mark read and unread act on every message shown", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1" }), fakeEmail({ id: "2", threadId: "T1", mailboxIds: { e: true } })]);
    await h.actions.markRead(conversations(h.mail, "T1"), scope);
    expect([...h.mail.emails.values()].map((e) => e.keywords)).toEqual([{ $seen: true }, { $seen: true }]);
    await h.actions.markUnread(conversations(h.mail, "T1"), scope);
    expect([...h.mail.emails.values()].map((e) => e.keywords)).toEqual([{}, {}]);
    expect(h.toasts.map((t) => t.message)).toEqual(["Conversation marked as read.", "Conversation marked as unread."]);
  });

  it("says nothing when there is nothing to do", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1", keywords: { $seen: true } })]);
    expect(await h.actions.markRead(conversations(h.mail, "T1"), scope)).toBe("nothing");
    expect(h.toasts).toEqual([]);
    expect(h.mail.posts).toEqual([]);
  });

  it("delete forever destroys only the messages in Trash, with no undo", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1", mailboxIds: { b: true } }), fakeEmail({ id: "2", threadId: "T1", mailboxIds: { a: true } })]);
    expect(await h.actions.deleteForever(conversations(h.mail, "T1"), { kind: "trash", roles: ROLES })).toBe("done");
    expect([...h.mail.emails.keys()]).toEqual(["2"]);
    expect(h.changes[0]).toEqual({ kind: "patch", update: { "1": { mailboxIds: {} } } });
    expect(h.toasts).toEqual([{ message: "Conversation deleted forever." }]);
    expect(peekUndo()).toBeNull();
  });

  it("report spam and not spam move with the keywords, and undo", async () => {
    const h = await harness([fakeEmail({ id: "1", threadId: "T1", mailboxIds: { a: true, i: true } })]);
    const before = snapshot(h.mail);
    await h.actions.reportSpam(conversations(h.mail, "T1"), scope);
    expect(h.mail.emails.get("1")).toMatchObject({ mailboxIds: { c: true }, keywords: { $junk: true } });
    await undoLast();
    expect(snapshot(h.mail)).toEqual(before);
    await h.actions.reportSpam(conversations(h.mail, "T1"), scope);
    await h.actions.notSpam(conversations(h.mail, "T1"), { kind: "spam", roles: ROLES });
    expect(h.mail.emails.get("1")).toMatchObject({ mailboxIds: { a: true }, keywords: { $notjunk: true } });
  });
});
