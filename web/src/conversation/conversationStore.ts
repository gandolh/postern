// One open conversation's data, kept current. Framework-free; React reads it
// through useSyncExternalStore (useConversation.ts).
//
//   load / refresh   Thread/get + Email/get of every message (headers, keywords,
//                    labels, attachments, Authentication-Results), in one request
//   loadBodies(ids)  Email/get of the body values, for the messages shown open;
//                    a body is fetched once (message content never changes)
//   inline images    each raster cid: part the HTML refers to, downloaded with
//                    Authorization and kept as a data: URL (a blob: URL does not
//                    load inside the opaque-origin sandboxed frame; checked in
//                    Chrome, 2026-10-20)
//
// Freshness: every action's optimistic patch (actions/bus) applies at once;
// "settled", a push StateChange that moves the Email state (brief 11:
// applyConversationStateChange), window focus and coming online refresh.
// A refresh's answer may predate a write still in flight (a star sent a
// moment ago), so the patches still pending, and those published while the
// request was out, go back on top of it: the star stays on until its own
// write settles.

import {
  isAbortError,
  type DownloadParams,
  type Email,
  type EmailBodyPart,
  type GetResponse,
  type Id,
  type MethodCaller,
  type PatchObject,
  type StateChange,
  type Thread,
} from "@postern/jmap";
import { pendingPatches, subscribeMailChanges } from "../actions/bus";
import type { ConversationMessage } from "../actions/conversation";
import { applyPatch } from "../actions/patches";
import { isQuietError } from "../actions/runner";
import { cidPartsToInline, findCids, MAX_INLINE_ON_REQUEST_BYTES } from "../attachments/inline";

/** The Authentication-Results headers, topmost (our server's) first. */
export const AUTH_RESULTS_PROPERTY = "header:Authentication-Results:asText:all";

/** Everything the cards need, fetched for every message of the conversation. */
export const MESSAGE_META_PROPERTIES = [
  "id",
  "blobId",
  "threadId",
  "mailboxIds",
  "keywords",
  "size",
  "receivedAt",
  "messageId",
  "inReplyTo",
  "references",
  "sender",
  "from",
  "to",
  "cc",
  "bcc",
  "replyTo",
  "subject",
  "sentAt",
  "hasAttachment",
  "preview",
  "attachments",
  AUTH_RESULTS_PROPERTY,
] as const;

/** The body part lists and decoded values, fetched for the messages shown open. */
export const MESSAGE_BODY_PROPERTIES = ["id", "htmlBody", "textBody", "bodyValues", "attachments"] as const;

/** Bodies larger than this come back truncated (isTruncated); "Show original" has the rest. */
export const MAX_BODY_VALUE_BYTES = 1_000_000;

/** A message of the open conversation. */
export interface ConvMessage extends ConversationMessage {
  blobId: Id;
  size: number;
  messageId: string[] | null;
  inReplyTo: string[] | null;
  references: string[] | null;
  sender: Email["sender"];
  cc: Email["cc"];
  bcc: Email["bcc"];
  replyTo: Email["replyTo"];
  subject: string;
  sentAt: string | null;
  hasAttachment: boolean;
  preview: string;
  attachments: EmailBodyPart[];
  /** Authentication-Results headers as text, topmost first. */
  authResults: string[];
}

/** A message body, ready for the renderer. */
export type MessageBody =
  | {
      kind: "html";
      /** The HTML as the message has it (sanitised at render time). */
      html: string;
      /** Bare cid → data: URL for the raster inline images the HTML refers to. */
      cidUrls: ReadonlyMap<string, string>;
      /** Content-IDs shown inline (their parts are not listed as attachments). */
      inlineCids: ReadonlySet<string>;
      /** Inline images past the per-message budget, not fetched until loadInlineImages(). */
      deferredCids: ReadonlySet<string>;
      deferredBytes: number;
      truncated: boolean;
      encodingProblem: boolean;
    }
  | { kind: "text"; text: string; truncated: boolean; encodingProblem: boolean }
  | { kind: "empty" };

export type BodyState = { status: "loading" } | { status: "ready"; body: MessageBody } | { status: "error" };

export interface ConversationSnapshot {
  status: "loading" | "ready" | "missing" | "error";
  error: unknown;
  /** Every message of the conversation, oldest first (the view filters by scope). */
  messages: readonly ConvMessage[];
  bodies: ReadonlyMap<Id, BodyState>;
}

const INITIAL: ConversationSnapshot = Object.freeze({ status: "loading", error: null, messages: [], bodies: new Map() });

type MetaEmail = Pick<Email, (typeof MESSAGE_META_PROPERTIES)[number] extends infer K ? Extract<K, keyof Email> : never> &
  Record<string, unknown>;

function toMessage(e: MetaEmail): ConvMessage {
  const auth = e[AUTH_RESULTS_PROPERTY];
  return {
    id: e.id,
    threadId: e.threadId,
    mailboxIds: e.mailboxIds ?? {},
    keywords: e.keywords ?? {},
    receivedAt: e.receivedAt,
    from: e.from ?? null,
    to: e.to ?? null,
    blobId: e.blobId,
    size: e.size ?? 0,
    messageId: e.messageId ?? null,
    inReplyTo: e.inReplyTo ?? null,
    references: e.references ?? null,
    sender: e.sender ?? null,
    cc: e.cc ?? null,
    bcc: e.bcc ?? null,
    replyTo: e.replyTo ?? null,
    subject: e.subject ?? "",
    sentAt: e.sentAt ?? null,
    hasAttachment: e.hasAttachment ?? false,
    preview: e.preview ?? "",
    attachments: e.attachments ?? [],
    authResults: Array.isArray(auth) ? auth.filter((v): v is string => typeof v === "string") : typeof auth === "string" ? [auth] : [],
  };
}

type BodyEmail = Pick<Email, "id" | "htmlBody" | "textBody" | "bodyValues" | "attachments">;

/** Fetch a blob's bytes (with Authorization). The store downloads inline images through it. */
export type BlobFetcher = (params: DownloadParams, signal: AbortSignal) => Promise<Blob>;

export interface ConversationStoreOptions {
  /** The mail account, for push StateChanges. */
  accountId?: () => Id | undefined;
  /** Downloads inline images; without it, cid: images stay unresolved (tests). */
  fetchBlob?: BlobFetcher;
}

function partText(email: BodyEmail, part: EmailBodyPart): { value: string; truncated: boolean; encodingProblem: boolean } {
  const value = part.partId ? email.bodyValues?.[part.partId] : undefined;
  return { value: value?.value ?? "", truncated: value?.isTruncated ?? false, encodingProblem: value?.isEncodingProblem ?? false };
}

/** The renderable body of a message: its HTML parts (text parts escaped in), else its text parts. */
export function bodyOf(
  email: BodyEmail,
): Omit<Extract<MessageBody, { kind: "html" }>, "cidUrls" | "inlineCids" | "deferredCids" | "deferredBytes"> | Extract<MessageBody, { kind: "text" | "empty" }> {
  const html = email.htmlBody ?? [];
  const text = email.textBody ?? [];
  if (html.some((p) => p.type === "text/html")) {
    let truncated = false;
    let encodingProblem = false;
    const chunks: string[] = [];
    for (const part of html) {
      if (part.type !== "text/html" && part.type !== "text/plain") continue;
      const t = partText(email, part);
      truncated ||= t.truncated;
      encodingProblem ||= t.encodingProblem;
      chunks.push(part.type === "text/html" ? t.value : `<div style="white-space:pre-wrap">${escapeHtml(t.value)}</div>`);
    }
    return { kind: "html", html: chunks.join("\n"), truncated, encodingProblem };
  }
  const parts = text.filter((p) => p.type === "text/plain" || p.type.startsWith("text/"));
  if (parts.length === 0) return { kind: "empty" };
  let truncated = false;
  let encodingProblem = false;
  const chunks = parts.map((p) => {
    const t = partText(email, p);
    truncated ||= t.truncated;
    encodingProblem ||= t.encodingProblem;
    return t.value;
  });
  return { kind: "text", text: chunks.join("\n\n"), truncated, encodingProblem };
}

/** `messages` with `updates` applied in order (each a message id → patch map). */
function overlay(messages: ConvMessage[], updates: readonly Readonly<Record<Id, PatchObject>>[]): ConvMessage[] {
  if (updates.length === 0) return messages;
  return messages.map((m) => {
    let next = m;
    for (const update of updates) {
      const patch = update[m.id];
      if (patch) next = applyPatch(next, patch);
    }
    return next;
  });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export class ConversationStore {
  readonly conversationId: Id;
  readonly #caller: MethodCaller;
  readonly #accountId: () => Id | undefined;
  readonly #fetchBlob: BlobFetcher | undefined;
  #snapshot: ConversationSnapshot = INITIAL;
  #emailState: string | null = null;
  readonly #listeners = new Set<() => void>();
  readonly #bodies = new Map<Id, BodyState>();
  /** The part lists of the bodies held, for inline images fetched later. */
  readonly #parts = new Map<Id, Pick<BodyEmail, "attachments" | "htmlBody">>();
  #abort = new AbortController();
  #unsubscribeBus: (() => void) | null = null;
  #refreshing: Promise<void> | null = null;
  #again = false;
  #disposed = false;
  /** The patches heard while a load's request is out, in order. */
  #duringLoad: Readonly<Record<Id, PatchObject>>[] | null = null;

  constructor(caller: MethodCaller, conversationId: Id, options: ConversationStoreOptions = {}) {
    this.#caller = caller;
    this.conversationId = conversationId;
    this.#accountId = options.accountId ?? (() => undefined);
    this.#fetchBlob = options.fetchBlob;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = (): ConversationSnapshot => this.#snapshot;

  /** The Email state the held messages are at. */
  get emailState(): string | null {
    return this.#emailState;
  }

  #set(next: Partial<ConversationSnapshot>): void {
    if (this.#disposed) return;
    this.#snapshot = { ...this.#snapshot, ...next };
    for (const listener of [...this.#listeners]) listener();
  }

  /** Mount: listen to the bus and load. Safe to call again after dispose() (StrictMode). */
  activate(): void {
    this.#disposed = false;
    if (this.#abort.signal.aborted) this.#abort = new AbortController();
    this.#unsubscribeBus ??= subscribeMailChanges((change) => {
      if (change.kind === "patch") this.#applyLocal(change.update);
      else void this.refresh();
    });
    if (this.#snapshot.status !== "ready") void this.refresh();
  }

  dispose(): void {
    this.#disposed = true;
    this.#abort.abort();
    this.#unsubscribeBus?.();
    this.#unsubscribeBus = null;
  }

  #applyLocal(update: Readonly<Record<Id, PatchObject>>): void {
    this.#duringLoad?.push(update);
    let changed = false;
    const messages = this.#snapshot.messages.map((m) => {
      const patch = update[m.id];
      if (!patch) return m;
      changed = true;
      return applyPatch(m, patch);
    });
    if (changed) this.#set({ messages });
  }

  /** Brief 11: refresh if the push says the Email state moved. */
  applyStateChange(change: StateChange): Promise<void> {
    const accountId = this.#accountId();
    const next = accountId === undefined ? undefined : change.changed[accountId]?.["Email"];
    if (next === undefined || next === this.#emailState) return Promise.resolve();
    return this.refresh();
  }

  /** Fetch the conversation's messages again (not their bodies). Concurrent calls share one run and one follow-up. */
  refresh(): Promise<void> {
    if (this.#refreshing) {
      this.#again = true;
      return this.#refreshing;
    }
    const run = (async () => {
      do {
        this.#again = false;
        await this.#load();
      } while (this.#again && !this.#disposed);
    })().finally(() => {
      this.#refreshing = null;
    });
    this.#refreshing = run;
    return run;
  }

  async #load(): Promise<void> {
    const signal = this.#abort.signal;
    // Writes still out when the request leaves, then whatever is published while it is out.
    const held = pendingPatches();
    const during: Readonly<Record<Id, PatchObject>>[] = [];
    this.#duringLoad = during;
    try {
      const r = this.#caller.request();
      const t = r.call("Thread/get", { ids: [this.conversationId] });
      const g = r.call("Email/get", { ids: t.ref<Id[]>("/list/*/emailIds"), properties: [...MESSAGE_META_PROPERTIES] });
      const res = await r.send({ signal });
      const threads = res.get(t);
      const thread: Thread | undefined = threads.list[0];
      if (!thread) {
        this.#set({ status: "missing", messages: [], error: null });
        return;
      }
      let emails: GetResponse<Email>;
      if (res.error(g)) {
        // A very long conversation can pass maxObjectsInGet in one back-referenced get.
        emails = await this.#caller.call("Email/get", { ids: thread.emailIds, properties: [...MESSAGE_META_PROPERTIES] }, { signal });
      } else {
        emails = res.get(g);
      }
      this.#emailState = emails.state;
      const byId = new Map(emails.list.map((e) => [e.id, toMessage(e as unknown as MetaEmail)]));
      const messages = thread.emailIds.map((id) => byId.get(id)).filter((m): m is ConvMessage => m !== undefined);
      if (messages.length === 0) {
        this.#set({ status: "missing", messages: [], error: null });
        return;
      }
      this.#set({ status: "ready", messages: overlay(messages, [...held, ...during]), error: null });
    } catch (err) {
      if (isAbortError(err) || this.#disposed) return;
      if (isQuietError(err)) return;
      // Keep what is on screen; only an empty view shows the error.
      if (this.#snapshot.status !== "ready") this.#set({ status: "error", error: err });
    } finally {
      this.#duringLoad = null;
    }
  }

  /** Fetch the bodies of these messages, if not already held or on the way. */
  async loadBodies(ids: readonly Id[]): Promise<void> {
    const wanted = ids.filter((id) => {
      const held = this.#bodies.get(id);
      return !held || held.status === "error";
    });
    if (wanted.length === 0) return;
    for (const id of wanted) this.#bodies.set(id, { status: "loading" });
    this.#set({ bodies: new Map(this.#bodies) });
    const signal = this.#abort.signal;
    let list: BodyEmail[];
    try {
      const res = await this.#caller.call(
        "Email/get",
        {
          ids: [...wanted],
          properties: [...MESSAGE_BODY_PROPERTIES],
          fetchHTMLBodyValues: true,
          fetchTextBodyValues: true,
          maxBodyValueBytes: MAX_BODY_VALUE_BYTES,
        },
        { signal },
      );
      list = res.list as BodyEmail[];
    } catch (err) {
      if (isAbortError(err) || this.#disposed) {
        // Unmounted mid-way (or StrictMode's rehearsal): ask again next time.
        for (const id of wanted) this.#bodies.delete(id);
        return;
      }
      for (const id of wanted) this.#bodies.set(id, { status: "error" });
      this.#set({ bodies: new Map(this.#bodies) });
      return;
    }
    const got = new Set(list.map((e) => e.id));
    for (const id of wanted) if (!got.has(id)) this.#bodies.set(id, { status: "error" });
    await Promise.all(
      list.map(async (email) => {
        const body = bodyOf(email);
        if (body.kind !== "html") {
          this.#bodies.set(email.id, { status: "ready", body });
          return;
        }
        this.#parts.set(email.id, { attachments: email.attachments, htmlBody: email.htmlBody });
        const inline = await cidPartsToInline(email, findCids(body.html), this.#fetchBlob, signal);
        this.#bodies.set(email.id, {
          status: "ready",
          body: { ...body, cidUrls: inline.urls, inlineCids: inline.cids, deferredCids: inline.deferred, deferredBytes: inline.deferredBytes },
        });
      }),
    );
    if (signal.aborted) {
      for (const id of wanted) if (this.#bodies.get(id)?.status === "loading") this.#bodies.delete(id);
      return;
    }
    this.#set({ bodies: new Map(this.#bodies) });
  }

  /** "Load images": fetch a message's inline images that were past the budget (each up to MAX_INLINE_ON_REQUEST_BYTES). */
  async loadInlineImages(id: Id): Promise<void> {
    const held = this.#bodies.get(id);
    const parts = this.#parts.get(id);
    if (held?.status !== "ready" || held.body.kind !== "html" || held.body.deferredCids.size === 0 || !parts) return;
    const signal = this.#abort.signal;
    const inline = await cidPartsToInline(parts, held.body.deferredCids, this.#fetchBlob, signal, {
      total: Number.POSITIVE_INFINITY,
      perImage: MAX_INLINE_ON_REQUEST_BYTES,
    });
    if (signal.aborted) return;
    const current = this.#bodies.get(id);
    if (current?.status !== "ready" || current.body.kind !== "html") return;
    this.#bodies.set(id, {
      status: "ready",
      body: {
        ...current.body,
        cidUrls: new Map([...current.body.cidUrls, ...inline.urls]),
        inlineCids: new Set([...current.body.inlineCids, ...inline.cids]),
        deferredCids: new Set(),
        deferredBytes: 0,
      },
    });
    this.#set({ bodies: new Map(this.#bodies) });
  }
}
