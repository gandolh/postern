import { buildDraftEmail, JmapLimitError, JmapNetworkError, JmapSetError, type UploadRequest } from "@postern/jmap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosaver, type SaveStatus } from "./autosave";
import { destroyDrafts, saveDraft } from "./drafts";
import { explainSaveError, explainSendError, explainUploadError } from "./errors";
import { Outbox } from "./outbox";
import { sentPatch, submitDraft } from "./submit";
import { ComposeTestServer, MAILBOXES } from "./testServer";
import { getUndoSendDelay, setUndoSendDelay, DEFAULT_UNDO_SEND_DELAY_MS } from "./undoDelay";
import { uploadFile, xhrUploadTransport } from "./upload";

const alice = { name: "Alice Archer", email: "alice@postern.test" };
const bob = { name: "Bob Baker", email: "bob@postern.test" };

function draft(text: string) {
  return buildDraftEmail({ from: alice, to: [bob], cc: [], bcc: [], subject: "Hi", html: null, text, attachments: [], messageId: "m1@postern.test" }, { draftsMailboxId: MAILBOXES.drafts });
}

describe("saving a draft", () => {
  it("creates the new copy and destroys the old one in one request", async () => {
    const server = new ComposeTestServer();
    const client = await server.connect();
    const first = await saveDraft(client, draft("one"), []);
    const second = await saveDraft(client, draft("two"), [first.id]);
    expect(server.emails.has(first.id)).toBe(false);
    expect(server.emails.get(second.id)?.["bodyValues"]).toEqual({ text: { value: "two" } });
    // Same Message-ID: the copy stays in the conversation.
    expect(second.threadId).toBe(first.threadId);
    const last = server.calls[server.calls.length - 1]!;
    expect(last[0]).toBe("Email/set");
    expect(last[1]["destroy"]).toEqual([first.id]);
    expect(Object.keys(last[1]["create"] as object)).toEqual(["draft"]);
  });

  it("does not mind an old copy that is already gone", async () => {
    const server = new ComposeTestServer();
    const client = await server.connect();
    const saved = await saveDraft(client, draft("x"), ["gone"]);
    expect(saved.leftOver).toEqual([]);
  });

  it("throws when the server refuses the draft", async () => {
    const server = new ComposeTestServer();
    const client = await server.connect();
    server.failWith = (name) => (name === "Email/set" ? ["Email/set", { accountId: "A", notCreated: { draft: { type: "overQuota" } } }] : undefined);
    const err = await saveDraft(client, draft("x"), []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JmapSetError);
    expect(explainSaveError(err)).toBe("Not saved: your mailbox is full.");
  });

  it("discards every copy", async () => {
    const server = new ComposeTestServer();
    const client = await server.connect();
    const a = await saveDraft(client, draft("a"), []);
    await destroyDrafts(client, [a.id, "gone"]);
    expect(server.emails.size).toBe(0);
  });
});

describe("sending", () => {
  it("submits the draft and files it in Sent without $draft", async () => {
    const server = new ComposeTestServer();
    const client = await server.connect();
    const saved = await saveDraft(client, draft("hello"), []);
    await submitDraft(client, { emailId: saved.id, identityId: "I1", draftsMailboxId: MAILBOXES.drafts, sentMailboxId: MAILBOXES.sent });
    const call = server.calls.find((c) => c[0] === "EmailSubmission/set")!;
    expect(call[1]["create"]).toEqual({ send: { identityId: "I1", emailId: saved.id } });
    expect(call[1]["onSuccessUpdateEmail"]).toEqual({ "#send": { "keywords/$draft": null, "mailboxIds/e": true, "mailboxIds/d": null } });
    const sent = server.emails.get(saved.id)!;
    expect(sent.mailboxIds).toEqual({ e: true });
    expect(sent.keywords).toEqual({ $seen: true });
  });

  it("keeps a message in Drafts when there is no Sent label", () => {
    expect(sentPatch("d", undefined)).toEqual({ "keywords/$draft": null });
  });

  it("explains a refused submission", async () => {
    const server = new ComposeTestServer();
    const client = await server.connect();
    server.failWith = (name) =>
      name === "EmailSubmission/set" ? ["EmailSubmission/set", { accountId: "A", notCreated: { send: { type: "invalidRecipients", invalidRecipients: ["x@nowhere.invalid"] } } }] : undefined;
    const err = await submitDraft(client, { emailId: "M1", identityId: "I1", draftsMailboxId: "d", sentMailboxId: "e" }).catch((e: unknown) => e);
    expect(explainSendError(err)).toBe("The mail server refused these addresses: x@nowhere.invalid.");
    expect(explainSendError(new JmapSetError("EmailSubmission/set", "send", { type: "forbiddenFrom" }))).toMatch(/won't send from this address/);
    expect(explainSendError(new JmapNetworkError("down"))).toMatch(/Can't reach the mail server/);
    expect(explainUploadError(new JmapLimitError("maxSizeUpload", "big"))).toBe("Too large for the mail server.");
  });
});

describe("autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves once, a moment after the last change", async () => {
    const save = vi.fn(async () => {});
    const statuses: SaveStatus[] = [];
    const saver = new Autosaver(save, { delayMs: 1000, onStatus: (s) => statuses.push(s) });
    saver.touch();
    await vi.advanceTimersByTimeAsync(600);
    saver.touch();
    await vi.advanceTimersByTimeAsync(600);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses.slice(-2)).toEqual(["saving", "saved"]);
  });

  it("saves changes made during a save after it, one save at a time", async () => {
    let release: () => void = () => {};
    let running = 0;
    let most = 0;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          running++;
          most = Math.max(most, running);
          release = () => {
            running--;
            resolve();
          };
        }),
    );
    const saver = new Autosaver(save, { delayMs: 100 });
    saver.touch();
    await vi.advanceTimersByTimeAsync(150);
    expect(save).toHaveBeenCalledTimes(1);
    saver.touch();
    const flushed = saver.flush();
    release();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await flushed;
    expect(save).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });

  it("flush rejects when the save fails, and keeps the changes to retry", async () => {
    const save = vi.fn(async (): Promise<void> => {
      throw new JmapNetworkError("down");
    });
    const saver = new Autosaver(save, { delayMs: 100, retryMs: 1000 });
    saver.touch();
    await expect(saver.flush()).rejects.toBeInstanceOf(JmapNetworkError);
    expect(saver.status).toBe("error");
    expect(saver.dirty).toBe(true);
    save.mockImplementation(async () => {});
    await vi.advanceTimersByTimeAsync(1100);
    expect(saver.status).toBe("saved");
  });

  it("does not save what is not worth saving", async () => {
    const save = vi.fn(async () => {});
    const saver = new Autosaver(save, { delayMs: 10, shouldSave: () => false });
    saver.touch();
    await vi.advanceTimersByTimeAsync(20);
    expect(save).not.toHaveBeenCalled();
    expect(saver.status).toBe("idle");
  });
});

describe("the outbox (undo send)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the message, then sends it", async () => {
    const outbox = new Outbox();
    const send = vi.fn(async () => "ok");
    const onSent = vi.fn();
    outbox.hold({ key: "k", label: "Hi", delayMs: 5000, send, onSent });
    expect(outbox.getSnapshot()).toMatchObject([{ key: "k", status: "held" }]);
    await vi.advanceTimersByTimeAsync(4900);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledWith("ok");
    expect(outbox.busy).toBe(false);
  });

  it("Undo during the hold: nothing is sent", async () => {
    const outbox = new Outbox();
    const send = vi.fn(async () => "ok");
    outbox.hold({ key: "k", label: "Hi", delayMs: 5000, send });
    await vi.advanceTimersByTimeAsync(3000);
    expect(outbox.undo("k")).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).not.toHaveBeenCalled();
    expect(outbox.undo("k")).toBe(false);
  });

  it("reports a failed send and lets go of it", async () => {
    const outbox = new Outbox();
    const onFailed = vi.fn();
    outbox.hold({ key: "k", label: "Hi", delayMs: 0, send: async () => Promise.reject(new Error("no")), onFailed });
    await vi.advanceTimersByTimeAsync(0);
    expect(onFailed).toHaveBeenCalled();
    expect(outbox.has("k")).toBe(false);
  });

  it("drops held messages at sign-out without sending them", async () => {
    const outbox = new Outbox();
    const send = vi.fn(async () => "ok");
    outbox.hold({ key: "k", label: "Hi", delayMs: 5000, send });
    expect(outbox.dispose()).toEqual(["k"]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).not.toHaveBeenCalled();
  });

  it("has a 5-second default delay that brief 12 can change", () => {
    expect(getUndoSendDelay()).toBe(DEFAULT_UNDO_SEND_DELAY_MS);
    setUndoSendDelay(20_000);
    expect(getUndoSendDelay()).toBe(20_000);
    setUndoSendDelay(99_000);
    expect(getUndoSendDelay()).toBe(30_000);
    setUndoSendDelay(DEFAULT_UNDO_SEND_DELAY_MS);
  });
});

describe("uploading", () => {
  it("uploads with the auth header, and retries once after a refreshed 401", async () => {
    const server = new ComposeTestServer();
    const client = await server.connect();
    const seen: UploadRequest[] = [];
    let first = true;
    const transport = {
      async send(req: UploadRequest) {
        seen.push(req);
        req.onProgress?.({ loaded: 3, total: 3 });
        if (first) {
          first = false;
          return { status: 401, body: "", contentType: null };
        }
        return { status: 201, body: JSON.stringify({ blobId: "B9", type: "text/plain", size: 3 }), contentType: "application/json" };
      },
    };
    (client.auth as { onUnauthorized?: () => boolean }).onUnauthorized = () => true;
    const progress: number[] = [];
    const res = await uploadFile(client, new Blob(["abc"], { type: "text/plain" }), { transport, onProgress: (p) => progress.push(p.loaded) });
    expect(res).toEqual({ blobId: "B9", type: "text/plain", size: 3 });
    expect(seen).toHaveLength(2);
    expect(seen[0]?.authorization).toBe("Basic test");
    expect(seen[0]?.url).toBe("http://fake/upload/A/");
    expect(progress).toEqual([3, 3]);
  });

  it("refuses a file over the server's limit before sending it", async () => {
    const server = new ComposeTestServer();
    const client = await server.connect();
    const transport = { send: vi.fn() };
    await expect(uploadFile(client, new Blob([new Uint8Array(2000)]), { transport })).rejects.toBeInstanceOf(JmapLimitError);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("reports XHR upload progress", async () => {
    const events: Record<string, (e?: unknown) => void> = {};
    const fake = {
      upload: {} as { onprogress?: (e: { loaded: number; total: number; lengthComputable: boolean }) => void },
      headers: {} as Record<string, string>,
      status: 0,
      statusText: "",
      responseText: "",
      responseType: "",
      open: vi.fn(),
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      getResponseHeader: () => "application/json",
      abort: vi.fn(),
      send() {
        this.upload.onprogress?.({ loaded: 5, total: 10, lengthComputable: true });
        this.status = 201;
        this.responseText = '{"blobId":"B1"}';
        events["load"]?.();
      },
      set onload(fn: () => void) {
        events["load"] = fn;
      },
      set onerror(fn: () => void) {
        events["error"] = fn;
      },
      set ontimeout(fn: () => void) {
        events["timeout"] = fn;
      },
      set onabort(fn: () => void) {
        events["abort"] = fn;
      },
    };
    const transport = xhrUploadTransport(() => fake as unknown as XMLHttpRequest);
    const progress: [number, number][] = [];
    const res = await transport.send({ url: "http://fake/upload/A/", body: "0123456789", contentType: "text/plain", authorization: "Bearer t", onProgress: (p) => progress.push([p.loaded, p.total]) });
    expect(res.status).toBe(201);
    expect(fake.headers).toEqual({ Authorization: "Bearer t", "Content-Type": "text/plain" });
    expect(progress).toEqual([
      [0, 10],
      [5, 10],
      [10, 10],
    ]);
  });
});
