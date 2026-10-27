// @vitest-environment jsdom
// The composer's store and sessions over a fake JMAP server: drafts autosave
// and replace themselves, close keeps the draft, discard destroys it, send is
// held for Undo and then submitted with onSuccessUpdateEmail, replies and
// forwards carry the right recipients, subject, threading, quote and files.

import { JmapClient, SessionExpiredError } from "@postern/jmap";
import type { ToastOptions } from "../shell/toast";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearUndo, peekUndo, setUndo, undoLast } from "../actions/undo";
import { ComposeTestServer, MAILBOXES } from "../send/testServer";
import { setUndoSendDelay, DEFAULT_UNDO_SEND_DELAY_MS } from "../send/undoDelay";
import { ComposerStore } from "./store";

const alice = { name: "Alice Archer", email: "alice@postern.test" };
const bob = { name: "Bob Baker", email: "bob@postern.test" };
const carol = { name: "Carol", email: "carol@example.org" };
const dave = { name: null, email: "dave@example.org" };

beforeAll(() => {
  let n = 0;
  URL.createObjectURL = () => `blob:test/${n++}`;
  URL.revokeObjectURL = () => {};
});

let server: ComposeTestServer;
let toasts: ToastOptions[];
let published: unknown[];
let navigated: unknown[];
let store: ComposerStore;
let syncs = 0;

async function makeStore(): Promise<ComposerStore> {
  const client = await server.connect();
  return new ComposerStore({
    client,
    username: "alice@postern.test",
    labels: { mailboxIdForRole: (role) => (MAILBOXES as Record<string, string>)[role], sync: async () => void syncs++ },
    toast: {
      show: (options) => {
        toasts.push(options);
        return { dismiss: () => {} };
      },
    },
    recipients: { suggest: async () => [], remember: vi.fn() },
    publish: (change) => published.push(change),
    navigate: (route) => navigated.push(route),
    hasInlineSlot: () => false,
    viewportWidth: () => 2000,
    session: {
      autosaveDelayMs: 20,
      upload: async (_client, file) => ({ blobId: server.upload(new Uint8Array(await file.arrayBuffer()), file.type), type: file.type, size: file.size }),
    },
  });
}

function drafts() {
  return [...server.emails.values()].filter((e) => e.mailboxIds[MAILBOXES.drafts]);
}

const ready = async (key: string) => vi.waitFor(() => expect(store.get(key)?.state.status).toBe("ready"));

beforeEach(async () => {
  server = new ComposeTestServer();
  toasts = [];
  published = [];
  navigated = [];
  syncs = 0;
  store = await makeStore();
  setUndoSendDelay(80);
});

afterEach(() => {
  store.dispose();
  setUndoSendDelay(DEFAULT_UNDO_SEND_DELAY_MS);
});

describe("a new message", () => {
  it("does no network work until a composer opens", async () => {
    expect(server.calls).toHaveLength(0);
    const s = store.open();
    await ready(s.key);
    expect(server.names()).toEqual(["Identity/get"]);
    expect(s.state.identityId).toBe("I1");
    expect(s.state.focus?.target).toBe("to");
  });

  it("leaves nothing behind when closed untouched", async () => {
    const s = store.open();
    await ready(s.key);
    await store.close(s.key);
    expect(server.names()).not.toContain("Email/set");
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it("autosaves one draft and replaces it on each save", async () => {
    const s = store.open();
    await ready(s.key);
    s.addRecipientText("to", "Bob Baker <bob@postern.test>, not an address");
    s.setSubject("Plans");
    await vi.waitFor(() => expect(s.state.save).toBe("saved"));
    const first = s.draftId!;
    expect(drafts().map((d) => d.id)).toEqual([first]);
    s.setSubject("Plans for Thursday");
    await vi.waitFor(() => expect(s.draftId).not.toBe(first));
    await vi.waitFor(() => expect(s.state.save).toBe("saved"));
    const saved = drafts();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ subject: "Plans for Thursday", to: [bob], keywords: { $draft: true, $seen: true }, from: [alice] });
    // The invalid chip stays on screen but is never written to the draft.
    expect(s.state.to.map((r) => r.valid)).toEqual([true, false]);
    expect(syncs).toBeGreaterThan(0);
  });

  it("keeps the draft when the window closes", async () => {
    const s = store.open({ to: [bob], subject: "Hello" });
    await ready(s.key);
    s.setText("x");
    await store.close(s.key);
    expect(drafts()).toHaveLength(1);
    expect(published).toContainEqual({ kind: "settled" });
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it("discards the draft for good", async () => {
    const s = store.open();
    await ready(s.key);
    s.setSubject("Never mind");
    await vi.waitFor(() => expect(s.state.save).toBe("saved"));
    await store.discard(s.key);
    expect(drafts()).toHaveLength(0);
    expect(toasts.at(-1)?.message).toBe("Draft discarded.");
  });
});

describe("sending", () => {
  async function written() {
    const s = store.open();
    await ready(s.key);
    s.addRecipientText("to", "bob@postern.test");
    s.setSubject("Lunch");
    return s;
  }

  it("holds the message for Undo, then submits it and files it in Sent", async () => {
    const s = await written();
    await store.send(s.key);
    expect(s.state.sending).toBe(true);
    expect(toasts.at(-1)).toMatchObject({ message: "Message sent.", action: { label: "Undo" }, duration: null });
    expect(server.submissions).toHaveLength(0);
    await vi.waitFor(() => expect(server.submissions).toHaveLength(1));
    const sent = server.emails.get(s.draftId!)!;
    expect(sent.mailboxIds).toEqual({ [MAILBOXES.sent]: true });
    expect(sent.keywords["$draft"]).toBeUndefined();
    await vi.waitFor(() => expect(toasts.at(-1)?.action?.label).toBe("View message"));
    expect(store.getSnapshot()).toHaveLength(0);
    expect(published).toContainEqual({ kind: "settled" });
    toasts.at(-1)!.action!.onClick();
    expect(navigated.at(-1)).toMatchObject({ kind: "system", view: "sent", conversationId: sent.threadId });
  });

  it("Undo brings the draft back and nothing is submitted", async () => {
    const s = await written();
    await store.send(s.key);
    toasts.at(-1)!.action!.onClick();
    expect(s.state.sending).toBe(false);
    expect(toasts.at(-1)?.message).toBe("Sending undone.");
    await new Promise((r) => setTimeout(r, 200));
    expect(server.submissions).toHaveLength(0);
    expect(drafts()).toHaveLength(1);
    expect(store.get(s.key)).toBe(s);
  });

  it("keeps the draft and explains when the server refuses", async () => {
    server.failWith = (name) => (name === "EmailSubmission/set" ? ["EmailSubmission/set", { accountId: "A", notCreated: { send: { type: "forbiddenFrom" } } }] : undefined);
    const s = await written();
    await store.send(s.key);
    await vi.waitFor(() => expect(s.state.sendError).toMatch(/won't send from this address/));
    expect(s.state.sending).toBe(false);
    expect(drafts()).toHaveLength(1);
    expect(toasts.at(-1)?.message).toBe("Couldn't send the message. It's saved in Drafts.");
  });

  it("does not send when the draft cannot be saved", async () => {
    server.failWith = (name) => (name === "Email/set" ? "network" : undefined);
    const s = await written();
    await store.send(s.key);
    expect(s.state.sending).toBe(false);
    expect(s.state.sendError).toMatch(/couldn't be saved/);
    expect(server.submissions).toHaveLength(0);
  });
});

describe("schedule send (brief 23)", () => {
  beforeEach(async () => {
    store.dispose();
    server = new ComposeTestServer({ maxDelayedSend: 2_592_000 });
    store = await makeStore();
    store.activate();
  });

  async function written() {
    const s = store.open();
    await ready(s.key);
    s.addRecipientText("to", "bob@postern.test");
    s.setSubject("Lunch");
    return s;
  }

  it("is offered only when the server can hold a message", async () => {
    expect(store.canSchedule).toBe(true);
    server = new ComposeTestServer();
    expect((await makeStore()).canSchedule).toBe(false);
  });

  it("saves, submits with HOLDUNTIL, closes the window and keeps the message in Drafts marked $scheduled", async () => {
    const s = await written();
    await store.schedule(s.key, new Date("2026-10-28T08:00:00Z"));
    expect(server.submissions).toHaveLength(1);
    expect(server.submissions[0]).toMatchObject({ emailId: s.draftId, envelope: { mailFrom: { parameters: { HOLDUNTIL: "2026-10-28T08:00:00Z" } }, rcptTo: [{ email: "bob@postern.test" }] } });
    const email = server.emails.get(s.draftId!)!;
    expect(email.mailboxIds).toEqual({ [MAILBOXES.drafts]: true });
    expect(email.keywords).toMatchObject({ $draft: true, $scheduled: true });
    expect(store.getSnapshot()).toHaveLength(0);
    expect(toasts.at(-1)?.message).toMatch(/^Send scheduled for .+\.$/);
    expect(published).toContainEqual({ kind: "settled" });
  });

  it("Undo cancels the send and leaves the draft", async () => {
    const s = await written();
    await store.schedule(s.key, new Date("2026-10-28T08:00:00Z"));
    const id = s.draftId!;
    toasts.at(-1)!.action!.onClick();
    await vi.waitFor(() => expect(toasts.at(-1)?.message).toBe("Send canceled. The message is in Drafts."));
    expect([...server.held.values()][0]!.undoStatus).toBe("canceled");
    expect(server.emails.get(id)!.keywords).toEqual(expect.not.objectContaining({ $scheduled: true }));
  });

  it("keeps the window and explains when the server refuses", async () => {
    server.failWith = (name) => (name === "EmailSubmission/set" ? ["EmailSubmission/set", { accountId: "A", notCreated: { send: { type: "forbiddenFrom" } } }] : undefined);
    const s = await written();
    await store.schedule(s.key, new Date("2026-10-28T08:00:00Z"));
    expect(s.state.sending).toBe(false);
    expect(s.state.sendError).toMatch(/won't send from this address/);
    expect(store.get(s.key)).toBe(s);
    expect(toasts.at(-1)?.message).toBe("Couldn't schedule the message. It's saved in Drafts.");
  });

  it("never opens a scheduled message as a draft to edit", async () => {
    server.add({ id: "O1", threadId: "T1", mailboxIds: { [MAILBOXES.inbox]: true } });
    server.add({ id: "R1", threadId: "T1", mailboxIds: { [MAILBOXES.drafts]: true }, keywords: { $draft: true, $scheduled: true } });
    server.add({ id: "N1", threadId: "T2", mailboxIds: { [MAILBOXES.drafts]: true }, keywords: { $draft: true, $scheduled: true } });
    expect((await store.threadDrafts("T1")).messages.map((m) => [m.id, m.draft])).toEqual([
      ["O1", false],
      ["R1", false],
    ]);
    expect(await store.draftOnlyConversation("T2", null)).toBeNull();
  });
});

describe("reply, reply all and forward", () => {
  beforeEach(() => {
    server.add({
      id: "O1",
      threadId: "T1",
      from: [bob],
      to: [alice, carol],
      cc: [dave],
      replyTo: null,
      subject: "Plans",
      messageId: ["o1@x"],
      inReplyTo: ["r0@x"],
      references: ["r0@x"],
      sentAt: "2026-10-20T10:05:00Z",
      receivedAt: "2026-10-20T10:06:00Z",
      textBody: [{ partId: "1", type: "text/plain" }],
      htmlBody: [{ partId: "1", type: "text/plain" }],
      bodyValues: { "1": { value: "Shall we meet?\nBob" } },
      attachments: [{ partId: "2", blobId: "B-pdf", type: "application/pdf", name: "plan.pdf", size: 9 }],
      keywords: { $seen: true },
    });
  });

  it("replies to all: the right people, Re:, threading headers and a quote", async () => {
    const s = store.open({ mode: "replyAll", emailId: "O1", threadId: "T1" });
    await ready(s.key);
    expect(s.state.to.map((r) => r.email)).toEqual(["bob@postern.test", "carol@example.org"]);
    expect(s.state.cc.map((r) => r.email)).toEqual(["dave@example.org"]);
    expect(s.state.subject).toBe("Re: Plans");
    expect(s.state.quote?.text).toMatch(/^On .*, Bob Baker <bob@postern.test> wrote:\n> Shall we meet\?\n> Bob$/);
    expect(s.state.files).toHaveLength(0);
    s.setText("Yes");
    await store.close(s.key);
    const [draft] = drafts();
    expect(draft).toMatchObject({ inReplyTo: ["o1@x"], references: ["r0@x", "o1@x"], threadId: "T1", subject: "Re: Plans" });
    const values = draft!["bodyValues"] as Record<string, { value: string }>;
    expect(values["text"]?.value).toMatch(/> Shall we meet\?/);
    expect(values["html"]?.value).toContain('class="gmail_quote postern_quote"');
  });

  it("forwards with the original's attachments, by blobId", async () => {
    const s = store.open({ mode: "forward", emailId: "O1", threadId: "T1" });
    await ready(s.key);
    expect(s.state.subject).toBe("Fwd: Plans");
    expect(s.state.to).toHaveLength(0);
    expect(s.state.files.map((f) => [f.blobId, f.name, f.status])).toEqual([["B-pdf", "plan.pdf", "done"]]);
    expect(s.state.focus?.target).toBe("to");
    const content = s.content()!;
    expect(content.attachments).toEqual([{ blobId: "B-pdf", type: "application/pdf", name: "plan.pdf", size: 9 }]);
    expect(content.text).toContain("---------- Forwarded message ---------");
    expect(content.inReplyTo).toEqual(["o1@x"]);
  });

  it("brings back the reply already open instead of a second one", async () => {
    const a = store.open({ mode: "reply", emailId: "O1", threadId: "T1" });
    const b = store.open({ mode: "reply", emailId: "O1", threadId: "T1" });
    expect(b).toBe(a);
    expect(store.getSnapshot()).toHaveLength(1);
  });
});

describe("drafts", () => {
  beforeEach(() => {
    server.add({
      id: "D1",
      threadId: "TD",
      mailboxIds: { [MAILBOXES.drafts]: true },
      keywords: { $draft: true, $seen: true },
      from: [alice],
      to: [bob],
      cc: [carol],
      subject: "Half written",
      messageId: ["d1@postern.test"],
      inReplyTo: null,
      references: null,
      receivedAt: "2026-10-20T10:00:00Z",
      bodyStructure: {
        type: "multipart/mixed",
        subParts: [
          { type: "multipart/alternative", subParts: [{ partId: "1", blobId: "t", type: "text/plain" }, { type: "multipart/related", subParts: [{ partId: "2", blobId: "h", type: "text/html" }, { partId: "3", blobId: "B-img", type: "image/png", cid: "pic@postern", disposition: "inline", name: "pic.png" }] }] },
          { partId: "4", blobId: "B-doc", type: "text/plain", name: "notes.txt", disposition: "attachment", size: 5 },
        ],
      },
      textBody: [{ partId: "1", type: "text/plain" }],
      htmlBody: [{ partId: "2", type: "text/html" }],
      bodyValues: { "1": { value: "Hello [image: pic.png]" }, "2": { value: '<div>Hello <img src="cid:pic@postern" alt="pic.png"></div>' } },
    });
    server.blobs.set("B-img", { type: "image/png", bytes: new Uint8Array([137, 80, 78, 71]) });
  });

  it("reopens a draft with everything in place, and only once", async () => {
    const s = store.open({ draftId: "D1" });
    await ready(s.key);
    expect(s.state).toMatchObject({ subject: "Half written", draftId: "D1", showCc: true, save: "saved", plain: false });
    expect(s.state.to.map((r) => r.email)).toEqual(["bob@postern.test"]);
    expect(s.state.files.map((f) => f.name)).toEqual(["notes.txt"]);
    expect(s.state.inline.map((f) => [f.cid, f.blobId])).toEqual([["pic@postern", "B-img"]]);
    expect(s.cidUrls().get("pic@postern")).toMatch(/^blob:/);
    expect(store.open({ draftId: "D1" })).toBe(s);
    // Saving again keeps the same Message-ID and the inline image.
    s.setSubject("Half written, now more");
    await store.close(s.key);
    const [draft] = drafts();
    expect(draft).toMatchObject({ subject: "Half written, now more", messageId: ["d1@postern.test"] });
    expect(JSON.stringify(draft!["bodyStructure"])).toContain("pic@postern");
    expect(server.emails.has("D1")).toBe(false);
  });

  it("opens the draft when Reply is pressed on it", async () => {
    const s = store.open({ mode: "reply", emailId: "D1", threadId: "TD" });
    await ready(s.key);
    expect(s.state.draftId).toBe("D1");
    expect(s.state.subject).toBe("Half written");
  });

  it("knows which messages of a conversation are drafts", async () => {
    server.add({ id: "R1", threadId: "TD", mailboxIds: { [MAILBOXES.inbox]: true }, keywords: {} });
    const { messages } = await store.threadDrafts("TD");
    expect(messages).toMatchObject([
      { id: "D1", draft: true },
      { id: "R1", draft: false },
    ]);
  });
});

describe("plain text and signatures", () => {
  it("sends only text/plain in plain-text mode", async () => {
    const s = store.open({ to: [bob], subject: "Plain", body: "Line one\nLine two" });
    await ready(s.key);
    s.setPlain(true);
    expect(s.state.plain).toBe(true);
    expect(s.state.text).toBe("Line one\nLine two");
    const content = s.content()!;
    expect(content.html).toBeNull();
    await store.close(s.key);
    expect(drafts()[0]?.["bodyStructure"]).toEqual({ partId: "text", type: "text/plain" });
  });

  it("puts the identity's signature under a new message, and swaps it with the From address", async () => {
    server.identities = [
      { id: "I1", name: "Alice Archer", email: "alice@postern.test", replyTo: null, bcc: null, textSignature: "Alice\nPostern", htmlSignature: "", mayDelete: false },
      { id: "I2", name: "Alice at work", email: "alice@work.test", replyTo: null, bcc: null, textSignature: "", htmlSignature: '<b>Alice</b> <img src="https://evil.test/x.png" onerror="alert(1)">', mayDelete: true },
    ];
    store = await makeStore();
    const s = store.open();
    await ready(s.key);
    expect(s.state.html).toContain('<div class="gmail_signature postern_signature">-- <br><div>Alice</div><div>Postern</div></div>');
    expect(s.content()!.text).toBe("-- \nAlice\nPostern");
    s.setIdentity("I2");
    const content = s.content()!;
    expect(content.from).toEqual({ name: "Alice at work", email: "alice@work.test" });
    expect(content.html).toContain("<b>Alice</b>");
    expect(content.html).not.toMatch(/evil\.test|onerror|Postern/);
  });

  it("replies from the address the message was sent to", async () => {
    server.identities = [
      { id: "I1", name: "Alice Archer", email: "alice@postern.test", replyTo: null, bcc: null, textSignature: "", htmlSignature: "", mayDelete: false },
      { id: "I2", name: "Alice at work", email: "alice@work.test", replyTo: null, bcc: null, textSignature: "", htmlSignature: "", mayDelete: true },
    ];
    store = await makeStore();
    server.add({ id: "W1", threadId: "TW", from: [bob], to: [{ name: null, email: "alice@work.test" }], cc: null, replyTo: null, subject: "Work", messageId: ["w1@x"], receivedAt: "2026-10-20T10:00:00Z", textBody: [], htmlBody: [], bodyValues: {} });
    const s = store.open({ mode: "reply", emailId: "W1", threadId: "TW" });
    await ready(s.key);
    expect(s.state.identityId).toBe("I2");
    expect(s.state.to.map((r) => r.email)).toEqual(["bob@postern.test"]);
  });
});

describe("review fixes", () => {
  async function savedDraft(subject = "Re: x"): Promise<string> {
    const a = store.open({ to: [bob], subject });
    await ready(a.key);
    a.setText("hello");
    await vi.waitFor(() => expect(a.state.save).toBe("saved"));
    const id = a.draftId!;
    await store.close(a.key);
    return id;
  }

  it("keeps one composer per draft, however it is opened (no duplicate drafts)", async () => {
    const d = await savedDraft();
    const inline = store.open({ draftId: d, threadId: "T", display: "inline" });
    await ready(inline.key);
    // Reply pressed on the draft's card: the same composer, not a second one.
    expect(store.open({ mode: "reply", emailId: d, threadId: "T" })).toBe(inline);
    expect(store.getSnapshot()).toHaveLength(1);
    inline.setSubject("edit A");
    await vi.waitFor(() => expect(inline.state.save).toBe("saved"));
    expect(drafts().map((e) => e["subject"])).toEqual(["edit A"]);
  });

  it("closes the second composer when two find the same draft while loading", async () => {
    const d = await savedDraft();
    const a = store.open({ mode: "reply", emailId: d, threadId: "T" });
    const b = store.open({ mode: "replyAll", emailId: d, threadId: "T" });
    expect(b).not.toBe(a);
    await ready(a.key);
    await vi.waitFor(() => expect(store.getSnapshot()).toHaveLength(1));
    expect(store.get(a.key)?.draftId).toBe(d);
    expect(b.disposed).toBe(true);
  });

  it("opens a reply whose original was deleted as a draft on its own, but not in Trash's view", async () => {
    server.add({ id: "O1", threadId: "TX", mailboxIds: { [MAILBOXES.trash]: true }, keywords: { $seen: true } });
    server.add({ id: "D9", threadId: "TX", mailboxIds: { [MAILBOXES.drafts]: true }, keywords: { $draft: true, $seen: true } });
    expect(await store.draftOnlyConversation("TX", null)).toBe("D9");
    expect(await store.draftOnlyConversation("TX", "trash")).toBeNull();
    server.add({ id: "O2", threadId: "TX", mailboxIds: { [MAILBOXES.inbox]: true }, keywords: {} });
    expect(await store.draftOnlyConversation("TX", null)).toBeNull();
  });

  it("waits for uploads before Save & close, then saves the draft with the file", async () => {
    let finish: () => void = () => {};
    store.dispose();
    const client = await server.connect();
    store = new ComposerStore({
      client,
      username: "alice@postern.test",
      labels: { mailboxIdForRole: (role) => (MAILBOXES as Record<string, string>)[role], sync: async () => {} },
      toast: { show: (o) => (toasts.push(o), { dismiss: () => {} }) },
      recipients: { suggest: async () => [], remember: vi.fn() },
      hasInlineSlot: () => false,
      viewportWidth: () => 2000,
      publish: () => {},
      session: {
        autosaveDelayMs: 20,
        upload: async (_c, file) => {
          await new Promise<void>((resolve) => (finish = resolve));
          return { blobId: server.upload(new Uint8Array(await file.arrayBuffer()), file.type), type: file.type, size: file.size };
        },
      },
    });
    const s = store.open({ to: [bob], subject: "With file" });
    await ready(s.key);
    s.setText("see file");
    s.addFiles([new File(["abc"], "report.pdf", { type: "application/pdf" })]);
    await store.close(s.key);
    expect(s.state.closing).toBe(true);
    expect(store.get(s.key)).toBe(s);
    expect(s.disposed).toBe(false);
    finish();
    await vi.waitFor(() => expect(store.getSnapshot()).toHaveLength(0));
    const [draft] = drafts();
    expect(JSON.stringify(draft!["bodyStructure"])).toContain("report.pdf");
  });

  it("does not close when a file fails to upload while closing, and says why", async () => {
    store.dispose();
    let fail: () => void = () => {};
    const client = await server.connect();
    store = new ComposerStore({
      client,
      username: "alice@postern.test",
      labels: { mailboxIdForRole: (role) => (MAILBOXES as Record<string, string>)[role], sync: async () => {} },
      toast: { show: (o) => (toasts.push(o), { dismiss: () => {} }) },
      recipients: { suggest: async () => [], remember: vi.fn() },
      hasInlineSlot: () => false,
      viewportWidth: () => 2000,
      publish: () => {},
      session: { autosaveDelayMs: 20, upload: () => new Promise((_resolve, reject) => (fail = () => reject(new Error("no")))) },
    });
    const s = store.open({ to: [bob], subject: "With file" });
    await ready(s.key);
    s.addFiles([new File(["abc"], "report.pdf", { type: "application/pdf" })]);
    await store.close(s.key);
    fail();
    await vi.waitFor(() => expect(s.state.closing).toBe(false));
    expect(s.state.sendError).toMatch(/report\.pdf.*didn't upload/);
    expect(store.get(s.key)).toBe(s);
  });

  it("never writes a cid: image before its part is uploaded", async () => {
    let finish: () => void = () => {};
    store.dispose();
    const client = await server.connect();
    store = new ComposerStore({
      client,
      username: "alice@postern.test",
      labels: { mailboxIdForRole: (role) => (MAILBOXES as Record<string, string>)[role], sync: async () => {} },
      toast: { show: (o) => (toasts.push(o), { dismiss: () => {} }) },
      recipients: { suggest: async () => [], remember: vi.fn() },
      hasInlineSlot: () => false,
      viewportWidth: () => 2000,
      publish: () => {},
      session: {
        autosaveDelayMs: 20,
        upload: async (_c, file) => {
          await new Promise<void>((resolve) => (finish = resolve));
          return { blobId: server.upload(new Uint8Array(await file.arrayBuffer()), file.type), type: file.type, size: file.size };
        },
      },
    });
    const s = store.open({ to: [bob], subject: "Pic" });
    await ready(s.key);
    s.insertImageFile(new File([new Uint8Array([137, 80, 78, 71])], "pic.png", { type: "image/png" }));
    expect(s.content()!.html).not.toContain("cid:");
    await vi.waitFor(() => expect(s.state.save).toBe("saved"));
    expect(JSON.stringify(drafts()[0]!["bodyValues"])).not.toContain("cid:");
    finish();
    await vi.waitFor(() => expect(s.state.inline[0]?.status).toBe("done"));
    expect(s.content()!.html).toMatch(/<img src="cid:[^"]+@postern"/);
    await vi.waitFor(() => expect(JSON.stringify(drafts()[0]!["bodyStructure"])).toContain("pic.png"));
  });

  it("does not discard a message held for Undo", async () => {
    setUndoSendDelay(150);
    const s = store.open({ to: [bob], subject: "Held" });
    await ready(s.key);
    s.setText("x");
    await store.send(s.key);
    await store.discard(s.key);
    expect(drafts()).toHaveLength(1);
    await vi.waitFor(() => expect(server.submissions).toHaveLength(1));
  });

  it("starts a new message from the default identity (brief 12), and a reply from the address it was sent to", async () => {
    server.identities = [
      { id: "I1", name: "Alice Archer", email: "alice@postern.test", replyTo: null, bcc: null, textSignature: "", htmlSignature: "", mayDelete: false },
      { id: "I2", name: "Alice at work", email: "alice@work.test", replyTo: null, bcc: null, textSignature: "", htmlSignature: "", mayDelete: true },
    ];
    store.dispose();
    const client = await server.connect();
    store = new ComposerStore({
      client,
      username: "alice@postern.test",
      labels: { mailboxIdForRole: (role) => (MAILBOXES as Record<string, string>)[role], sync: async () => {} },
      toast: { show: (o) => (toasts.push(o), { dismiss: () => {} }) },
      recipients: { suggest: async () => [], remember: vi.fn() },
      hasInlineSlot: () => false,
      viewportWidth: () => 2000,
      defaultIdentityId: () => "I2",
    });
    const fresh = store.open();
    await ready(fresh.key);
    expect(fresh.state.identityId).toBe("I2");
    server.add({ id: "P1", threadId: "TP", from: [bob], to: [alice], cc: null, replyTo: null, subject: "Personal", messageId: ["p1@x"], receivedAt: "2026-10-20T10:00:00Z", textBody: [], htmlBody: [], bodyValues: {} });
    const reply = store.open({ mode: "reply", emailId: "P1", threadId: "TP" });
    await ready(reply.key);
    expect(reply.state.identityId).toBe("I1");
  });
});

describe("signing out (user or idle) while the tokens still work", () => {
  beforeEach(() => clearUndo());

  it("submits a message held for Undo at once: the user already saw \"Message sent\"", async () => {
    setUndoSendDelay(60_000);
    const s = store.open({ to: [bob], subject: "Before I go" });
    await ready(s.key);
    s.setText("x");
    await store.send(s.key);
    expect(toasts.at(-1)).toMatchObject({ message: "Message sent.", action: { label: "Undo" } });
    expect(server.submissions).toHaveLength(0);
    const shown = toasts.length;

    await store.flushForSignOut();

    expect(server.submissions).toHaveLength(1);
    expect(server.emails.get(s.draftId!)!.mailboxIds).toEqual({ [MAILBOXES.sent]: true });
    expect(store.outbox.busy).toBe(false);
    // No toasts on the way out, and z no longer reaches the send.
    expect(toasts).toHaveLength(shown);
    expect(peekUndo()).toBeNull();
  });

  it("waits for a Send still saving its draft, then submits it too", async () => {
    setUndoSendDelay(60_000);
    const s = store.open({ to: [bob], subject: "Racing" });
    await ready(s.key);
    s.setText("x");
    const sending = store.send(s.key);
    await store.flushForSignOut();
    await sending;
    expect(server.submissions).toHaveLength(1);
  });

  it("saves a draft typed within the autosave delay", async () => {
    store.dispose();
    const client = await server.connect();
    store = new ComposerStore({
      client,
      username: "alice@postern.test",
      labels: { mailboxIdForRole: (role) => (MAILBOXES as Record<string, string>)[role], sync: async () => {} },
      toast: { show: (o) => (toasts.push(o), { dismiss: () => {} }) },
      recipients: { suggest: async () => [], remember: vi.fn() },
      hasInlineSlot: () => false,
      viewportWidth: () => 2000,
      session: { autosaveDelayMs: 60_000 },
    });
    const s = store.open({ to: [bob], subject: "Half written" });
    await ready(s.key);
    s.setText("the first line");
    expect(s.state.save).toBe("dirty");
    expect(drafts()).toHaveLength(0);

    await store.flushForSignOut();

    expect(drafts()).toHaveLength(1);
    expect(drafts()[0]).toMatchObject({ subject: "Half written", to: [bob] });
    expect(server.submissions).toHaveLength(0);
  });
});

describe("Undo send in the shared undo list (z and the toast)", () => {
  beforeEach(() => clearUndo());

  it("archive, then send: z undoes the send, not the archive", async () => {
    setUndoSendDelay(60_000);
    const archive = { label: "Conversation archived.", undo: vi.fn(async () => {}) };
    setUndo(archive);
    const s = store.open({ to: [bob], subject: "Oops" });
    await ready(s.key);
    s.setText("x");
    await store.send(s.key);
    expect(peekUndo()).toEqual({ label: "Message sent." });

    expect(await undoLast()).toBe(true);

    expect(s.state.sending).toBe(false);
    expect(toasts.at(-1)?.message).toBe("Sending undone.");
    expect(archive.undo).not.toHaveBeenCalled();
    expect(server.submissions).toHaveLength(0);
    // z undid the most recent action; pressing it again does not reach further back.
    expect(await undoLast()).toBe(false);
  });

  it("once the message goes out, z has nothing of it left to undo", async () => {
    const s = await (async () => {
      const x = store.open({ to: [bob], subject: "Gone" });
      await ready(x.key);
      x.setText("x");
      return x;
    })();
    await store.send(s.key);
    expect(peekUndo()).toEqual({ label: "Message sent." });
    await vi.waitFor(() => expect(server.submissions).toHaveLength(1));
    expect(peekUndo()).toBeNull();
  });
});

describe("session trouble is the sign-in layer's to show", () => {
  it("a send refused because the session expired keeps the draft, with no error toast", async () => {
    store.dispose();
    let expired = false;
    const client = new JmapClient({
      baseUrl: "http://fake",
      auth: {
        authorization: () => {
          if (expired) throw new SessionExpiredError();
          return "Basic test";
        },
      },
      fetch: server.fetch,
    });
    await client.connect();
    store = new ComposerStore({
      client,
      username: "alice@postern.test",
      labels: { mailboxIdForRole: (role) => (MAILBOXES as Record<string, string>)[role], sync: async () => {} },
      toast: { show: (o) => (toasts.push(o), { dismiss: () => {} }) },
      recipients: { suggest: async () => [], remember: vi.fn() },
      hasInlineSlot: () => false,
      viewportWidth: () => 2000,
    });
    const s = store.open({ to: [bob], subject: "Late" });
    await ready(s.key);
    s.setText("x");
    await store.send(s.key);
    expired = true;
    await vi.waitFor(() => expect(s.state.sending).toBe(false));
    expect(toasts.map((t) => t.message)).not.toContain("Couldn't send the message. It's saved in Drafts.");
    expect(drafts()).toHaveLength(1);
  });
});
