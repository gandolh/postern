// One composer: the draft being written, wherever it is shown (a docked
// window, full screen, minimised, or inline under a conversation). It holds
// the recipients, subject, identity, files and save state; the editor's DOM
// holds the body while it is mounted, and the session reads it through a
// bridge when it saves.
//
// Plain object + subscribe/getSnapshot, so React reads it with
// useSyncExternalStore and the window can move (inline → docked) without
// losing anything.

import {
  buildDraftEmail,
  draftParts,
  forwardAttachments,
  forwardQuote,
  forwardSubject,
  newMessageId,
  parseAddressList,
  replyIdentityEmail,
  replyQuote,
  replyRecipients,
  replySubject,
  textToHtml,
  threadingHeaders,
  type DraftAttachment,
  type DraftContent,
  type Email,
  type EmailAddress,
  type Id,
  type Identity,
  type JmapClient,
  type Quote,
} from "@postern/jmap";
import { htmlBodyText } from "../conversation/quoting";
import { sanitizeMessageHtml } from "../render/sanitize";
import { Autosaver, type SaveStatus } from "../send/autosave";
import { destroyDrafts, htmlBody, loadComposeSource, plainBody, saveDraft } from "../send/drafts";
import { explainSaveError, explainUploadError } from "../send/errors";
import { uploadFile, type UploadFileOptions } from "../send/upload";
import type { ComposeMode, ComposeOptions } from "./compose";
import { sanitizeForEditor } from "./editor/sanitize";
import { serializeEditor, type SerializedBody } from "./editor/serialize";

export type Placement = "docked" | "minimised" | "fullscreen" | "inline";
export type RecipientField = "to" | "cc" | "bcc";

/** A recipient chip. Invalid ones stay visible (marked) and are never sent. */
export interface Recipient {
  key: string;
  name: string | null;
  email: string;
  valid: boolean;
  /** What was typed, for an invalid chip. */
  raw: string;
}

/** A file in the attachment tray, or an inline image in the body. */
export interface FileItem {
  key: string;
  name: string;
  type: string;
  size: number;
  status: "uploading" | "done" | "error";
  /** Bytes uploaded so far. */
  loaded: number;
  blobId: Id | null;
  error: string | null;
  /** Inline images: the Content-ID the body uses, and the object URL the editor shows. */
  cid: string | null;
  url: string | null;
}

export interface ComposeSnapshot {
  key: string;
  mode: ComposeMode;
  status: "loading" | "ready" | "failed";
  loadError: string | null;
  placement: Placement;
  identities: readonly Identity[];
  identityId: Id | null;
  to: readonly Recipient[];
  cc: readonly Recipient[];
  bcc: readonly Recipient[];
  showCc: boolean;
  showBcc: boolean;
  subject: string;
  /** Plain-text mode: the body is `text`, sent as text/plain only. */
  plain: boolean;
  text: string;
  /** Rich mode: the body as last loaded (outgoing form, cid: images). The editor loads it on mount and when `revision` changes. */
  html: string;
  revision: number;
  /** The quoted original under a reply, folded ("Show trimmed content"). */
  quote: Quote | null;
  files: readonly FileItem[];
  inline: readonly FileItem[];
  draftId: Id | null;
  threadId: Id | null;
  /** The message replied to or forwarded. */
  sourceId: Id | null;
  save: SaveStatus;
  saveError: string | null;
  sendError: string | null;
  /** Held in the outbox or being submitted: the window is hidden. */
  sending: boolean;
  /** A request to move focus into the window (bumped `n` each time). */
  focus: { target: FocusTarget; n: number } | null;
}

/** Where focus goes when a window opens or comes back: the To field, the body, or the window itself. */
export type FocusTarget = "to" | "body" | "window";

/** What the editor offers the session while it is mounted. */
export interface EditorBridge {
  read(): SerializedBody;
  /** Replace the signature block (null removes it). */
  setSignature(html: string | null): void;
  /** Add HTML at the end (the unfolded quote). */
  append(html: string): void;
  /** Put an inline image at the caret (or the end). */
  insertImage(cid: string, url: string, alt: string): void;
  focus(): void;
}

export interface SessionDeps {
  client: JmapClient;
  /** The account's address (Identity/get can come back empty). */
  username: string;
  identities(): Promise<readonly Identity[]>;
  draftsMailboxId(): Id | undefined;
  /** After the first save (the Drafts count changed). */
  onFirstSave(session: ComposeSession): void;
  upload?: (client: JmapClient, file: Blob, options: UploadFileOptions) => Promise<{ blobId: Id; type: string; size: number }>;
  /** Unique strings (Message-ID, cids, keys). */
  unique?: () => string;
  autosaveDelayMs?: number;
}

let counter = 0;
const defaultUnique = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2)}`);

export const SIGNATURE_CLASS = "gmail_signature postern_signature";

/** The signature block for an identity, as editor HTML (sanitised again when the editor loads it), or null. */
export function signatureHtml(identity: Identity | undefined): string | null {
  if (!identity) return null;
  const html = identity.htmlSignature?.trim();
  const text = identity.textSignature?.trim();
  if (!html && !text) return null;
  const inner = html ? html : textToHtml(text as string);
  return `<div class="${SIGNATURE_CLASS}">-- <br>${inner}</div>`;
}

/** The signature for plain-text mode: "-- " and the text (Gmail's separator). */
export function signatureText(identity: Identity | undefined): string | null {
  if (!identity) return null;
  const text = identity.textSignature?.trim();
  if (text) return `-- \n${text}`;
  const html = identity.htmlSignature?.trim();
  if (!html) return null;
  const body = sanitizeMessageHtml(html).body;
  const plain = htmlBodyText(body);
  return plain ? `-- \n${plain}` : null;
}

/** The text of a message to quote: its text/plain body, else the text of its sanitised HTML. */
export function quotableText(email: Pick<Email, "textBody" | "htmlBody" | "bodyValues">): string {
  const html = htmlBody(email);
  const plain = plainBody(email);
  if (plain !== null && plain.trim()) return plain;
  if (html) return htmlBodyText(sanitizeMessageHtml(html).body);
  return plain ?? "";
}

function recipientsFrom(list: readonly EmailAddress[] | null | undefined, key: () => string): Recipient[] {
  return (list ?? []).map((a) => ({ key: key(), name: a.name, email: a.email, valid: true, raw: a.email }));
}

const EMPTY_HTML = "<div><br></div>";

export class ComposeSession {
  readonly key: string;
  readonly #deps: SessionDeps;
  readonly #listeners = new Set<() => void>();
  readonly #saver: Autosaver;
  readonly #unique: () => string;
  readonly #abort = new AbortController();
  #state: ComposeSnapshot;
  #editor: EditorBridge | null = null;
  #body: SerializedBody | null = null;
  #messageId: string | null = null;
  #inReplyTo: string[] | null = null;
  #references: string[] | null = null;
  #leftOver: Id[] = [];
  #saved = false;
  #edited = false;
  #disposed = false;
  #sendRequest: (() => void) | null = null;

  constructor(deps: SessionDeps, options: { mode: ComposeMode; placement: Placement; sourceId?: Id | null; threadId?: Id | null; draftId?: Id | null }) {
    this.#deps = deps;
    this.#unique = deps.unique ?? defaultUnique;
    this.key = `c${this.#unique().replace(/[^A-Za-z0-9]/g, "").slice(0, 16)}`;
    this.#state = {
      key: this.key,
      mode: options.mode,
      status: "loading",
      loadError: null,
      placement: options.placement,
      identities: [],
      identityId: null,
      to: [],
      cc: [],
      bcc: [],
      showCc: false,
      showBcc: false,
      subject: "",
      plain: false,
      text: "",
      html: EMPTY_HTML,
      revision: 0,
      quote: null,
      files: [],
      inline: [],
      draftId: options.draftId ?? null,
      threadId: options.threadId ?? null,
      sourceId: options.sourceId ?? null,
      save: "idle",
      saveError: null,
      sendError: null,
      sending: false,
      focus: null,
    };
    this.#saver = new Autosaver(() => this.#save(), {
      delayMs: deps.autosaveDelayMs,
      shouldSave: () => this.#state.status === "ready" && (this.#state.draftId !== null || this.#edited),
      onStatus: (save, error) => this.#set({ save, saveError: save === "error" ? explainSaveError(error) || null : null }),
    });
  }

  // ---- React ------------------------------------------------------------------------

  getSnapshot = (): ComposeSnapshot => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #set(patch: Partial<ComposeSnapshot>): void {
    if (this.#disposed) return;
    // A new revision replaces the body: what was read from the old one is stale.
    if ("revision" in patch || "plain" in patch) this.#body = null;
    this.#state = { ...this.#state, ...patch };
    for (const l of [...this.#listeners]) l();
  }

  /** A change the user made: the draft should save. */
  #edit(patch: Partial<ComposeSnapshot>): void {
    this.#edited = true;
    this.#set(patch);
    this.#saver.touch();
  }

  get state(): ComposeSnapshot {
    return this.#state;
  }

  get draftId(): Id | null {
    return this.#state.draftId;
  }

  get identity(): Identity | undefined {
    return this.#state.identities.find((i) => i.id === this.#state.identityId) ?? this.#state.identities[0];
  }

  // ---- Loading -------------------------------------------------------------------------

  /** Fill the composer from its options: new, reply / reply all / forward, or an existing draft. */
  async load(options: ComposeOptions): Promise<void> {
    try {
      const identities = await this.#deps.identities();
      this.#set({ identities, identityId: identities[0]?.id ?? null });
      const draftId = options.draftId ?? this.#state.draftId;
      if (draftId) await this.#loadDraft(draftId);
      else if (options.emailId && this.#state.mode !== "new") await this.#loadSource(options.emailId, this.#state.mode, options);
      else this.#loadNew(options);
      this.#set({ status: "ready" });
    } catch (err) {
      if (this.#disposed) return;
      this.#set({ status: "failed", loadError: err instanceof Error && err.message === "gone" ? "That message no longer exists." : "Couldn't load the message. Check your connection and try again." });
    }
  }

  #me(): string[] {
    return [...this.#state.identities.map((i) => i.email), this.#deps.username];
  }

  #newMessageId(): string {
    const from = this.identity?.email ?? this.#deps.username;
    return newMessageId(from, this.#unique());
  }

  #loadNew(options: ComposeOptions): void {
    const key = () => this.#unique();
    const sig = signatureHtml(this.identity);
    const body = options.body ? textToHtml(options.body) : EMPTY_HTML;
    this.#messageId = this.#newMessageId();
    this.#set({
      to: recipientsFrom(options.to, key),
      cc: recipientsFrom(options.cc, key),
      bcc: recipientsFrom(options.bcc, key),
      showCc: !!options.cc?.length,
      showBcc: !!options.bcc?.length,
      subject: options.subject ?? "",
      html: sig ? `${body}<div><br></div>${sig}` : body,
      revision: this.#state.revision + 1,
    });
  }

  async #loadSource(emailId: Id, mode: ComposeMode, options: ComposeOptions): Promise<void> {
    const original = await loadComposeSource(this.#deps.client, emailId, this.#abort.signal);
    if (!original) throw new Error("gone");
    // Reply on one's own draft (the newest message of a conversation can be it): open the draft.
    if (original.keywords?.["$draft"]) {
      this.#set({ draftId: original.id });
      await this.#loadDraft(original.id, original);
      return;
    }
    const key = () => this.#unique();
    const me = this.#me();
    const fromEmail = replyIdentityEmail(original, me);
    const identity = fromEmail ? this.#state.identities.find((i) => i.email.toLowerCase() === fromEmail.toLowerCase()) : undefined;
    if (identity) this.#set({ identityId: identity.id });
    const headers = threadingHeaders(original);
    this.#inReplyTo = headers.inReplyTo;
    this.#references = headers.references;
    this.#messageId = this.#newMessageId();
    const text = quotableText(original);
    const sig = signatureHtml(this.identity);
    const lead = `${EMPTY_HTML}${sig ? `<div><br></div>${sig}` : ""}`;
    if (mode === "forward") {
      const quote = forwardQuote(original, text);
      const files: FileItem[] = forwardAttachments(original.attachments).map((a) => ({
        key: key(),
        name: a.name ?? "attachment",
        type: a.type,
        size: a.size ?? 0,
        status: "done",
        loaded: a.size ?? 0,
        blobId: a.blobId,
        error: null,
        cid: null,
        url: null,
      }));
      this.#set({
        subject: forwardSubject(original.subject),
        to: recipientsFrom(options.to, key),
        html: `${lead}<br>${quote.html}`,
        revision: this.#state.revision + 1,
        files,
        threadId: original.threadId,
      });
      return;
    }
    const recipients = replyRecipients(original, mode === "replyAll" ? "replyAll" : "reply", me);
    this.#set({
      subject: replySubject(original.subject),
      to: recipientsFrom(recipients.to, key),
      cc: recipientsFrom(recipients.cc, key),
      bcc: recipientsFrom(recipients.bcc, key),
      showCc: recipients.cc.length > 0,
      showBcc: recipients.bcc.length > 0,
      html: lead,
      revision: this.#state.revision + 1,
      quote: replyQuote(original, text),
      threadId: original.threadId,
    });
  }

  async #loadDraft(draftId: Id, already?: Email): Promise<void> {
    const draft = already ?? (await loadComposeSource(this.#deps.client, draftId, this.#abort.signal));
    if (!draft) throw new Error("gone");
    const key = () => this.#unique();
    const fromEmail = draft.from?.[0]?.email?.toLowerCase();
    const identity = fromEmail ? this.#state.identities.find((i) => i.email.toLowerCase() === fromEmail) : undefined;
    this.#messageId = draft.messageId?.[0] ?? this.#newMessageId();
    this.#inReplyTo = draft.inReplyTo ?? null;
    this.#references = draft.references ?? null;
    const parts = draftParts(draft.bodyStructure);
    const inline = await Promise.all(parts.inline.map((a) => this.#downloadInline(a)));
    const html = htmlBody(draft);
    const text = plainBody(draft) ?? "";
    const files: FileItem[] = parts.attachments.map((a) => ({
      key: key(),
      name: a.name ?? "attachment",
      type: a.type,
      size: a.size ?? 0,
      status: "done",
      loaded: a.size ?? 0,
      blobId: a.blobId,
      error: null,
      cid: null,
      url: null,
    }));
    const mode: ComposeMode = this.#inReplyTo ? (this.#state.mode === "new" ? "reply" : this.#state.mode) : this.#state.mode;
    this.#saved = true;
    this.#set({
      mode,
      identityId: identity?.id ?? this.#state.identityId,
      draftId: draft.id,
      threadId: draft.threadId,
      to: recipientsFrom(draft.to, key),
      cc: recipientsFrom(draft.cc, key),
      bcc: recipientsFrom(draft.bcc, key),
      showCc: !!draft.cc?.length,
      showBcc: !!draft.bcc?.length,
      subject: draft.subject ?? "",
      plain: html === null,
      text: html === null ? text : "",
      html: html ?? EMPTY_HTML,
      revision: this.#state.revision + 1,
      files,
      inline: inline.filter((i): i is FileItem => i !== null),
      save: "saved",
    });
  }

  async #downloadInline(a: DraftAttachment): Promise<FileItem | null> {
    if (!a.cid) return null;
    try {
      const res = await this.#deps.client.blob.download({ blobId: a.blobId, name: a.name ?? "image", type: a.type }, { signal: this.#abort.signal });
      const blob = new Blob([await res.arrayBuffer()], { type: a.type });
      return { key: this.#unique(), name: a.name ?? "image", type: a.type, size: blob.size, status: "done", loaded: blob.size, blobId: a.blobId, error: null, cid: a.cid.toLowerCase(), url: URL.createObjectURL(blob) };
    } catch {
      return null;
    }
  }

  /** cid → object URL, for the editor to show inline images. */
  cidUrls(): Map<string, string> {
    const out = new Map<string, string>();
    for (const f of this.#state.inline) if (f.cid && f.url) out.set(f.cid, f.url);
    return out;
  }

  // ---- Editing ---------------------------------------------------------------------------

  setRecipients(field: RecipientField, list: readonly Recipient[]): void {
    this.#edit({ [field]: list } as Partial<ComposeSnapshot>);
  }

  /** Add typed or pasted text as chips (valid and invalid). */
  addRecipientText(field: RecipientField, text: string): void {
    const parsed = parseAddressList(text);
    if (parsed.length === 0) return;
    const current = this.#state[field];
    const seen = new Set(current.map((r) => r.email.toLowerCase()));
    const added: Recipient[] = [];
    for (const p of parsed) {
      const k = p.email.toLowerCase();
      if (p.valid && seen.has(k)) continue;
      seen.add(k);
      added.push({ key: this.#unique(), name: p.name, email: p.email, valid: p.valid, raw: p.raw });
    }
    if (added.length) this.setRecipients(field, [...current, ...added]);
  }

  showField(field: "cc" | "bcc"): void {
    this.#set(field === "cc" ? { showCc: true } : { showBcc: true });
  }

  setSubject(subject: string): void {
    this.#edit({ subject });
  }

  setText(text: string): void {
    this.#edit({ text });
  }

  setIdentity(identityId: Id): void {
    const before = this.identity;
    this.#edit({ identityId });
    const after = this.identity;
    if (before?.id === after?.id) return;
    if (this.#state.plain) {
      const oldSig = signatureText(before);
      const newSig = signatureText(after);
      let text = this.#state.text;
      if (oldSig && text.includes(oldSig)) text = text.replace(oldSig, newSig ?? "");
      else if (newSig) text = `${text.replace(/\s+$/, "")}\n\n${newSig}`;
      this.#set({ text });
    } else if (this.#editor) {
      this.#editor.setSignature(signatureHtml(after));
    } else {
      // Not mounted: rewrite the stored body.
      this.#set({ html: replaceSignature(this.#state.html, signatureHtml(after), this.cidUrls()), revision: this.#state.revision + 1 });
    }
  }

  /** Switch plain-text mode. Rich → plain keeps the text; plain → rich turns lines into the editor's lines. */
  setPlain(plain: boolean): void {
    if (plain === this.#state.plain) return;
    if (plain) {
      const body = this.#readBody();
      for (const f of this.#state.inline) if (f.url) URL.revokeObjectURL(f.url);
      this.#edit({ plain: true, text: body.text, inline: [] });
    } else {
      this.#edit({ plain: false, html: textToHtml(this.#state.text), revision: this.#state.revision + 1 });
    }
  }

  /** The editor changed (typing, formatting, paste). */
  bodyChanged(): void {
    this.#body = null;
    this.#edited = true;
    this.#saver.touch();
  }

  /** Unfold the quoted original into the body ("Show trimmed content"). */
  showQuote(): void {
    const quote = this.#state.quote;
    if (!quote) return;
    if (this.#state.plain) this.#edit({ quote: null, text: `${this.#state.text.replace(/\s+$/, "")}\n\n${quote.text}` });
    else if (this.#editor) {
      this.#editor.append(`<br>${quote.html}`);
      this.#edit({ quote: null });
    } else this.#edit({ quote: null, html: `${this.#state.html}<br>${quote.html}`, revision: this.#state.revision + 1 });
  }

  setPlacement(placement: Placement): void {
    this.#set({ placement });
  }

  requestFocus(target: FocusTarget): void {
    this.#set({ focus: { target, n: (this.#state.focus?.n ?? 0) + 1 } });
  }

  clearSendError(): void {
    this.#set({ sendError: null });
  }

  setSendError(sendError: string | null): void {
    this.#set({ sendError });
  }

  setSending(sending: boolean): void {
    this.#set({ sending });
  }

  // ---- The editor bridge ----------------------------------------------------------------------

  bindEditor(bridge: EditorBridge): void {
    this.#editor = bridge;
  }

  /** The editor is going away: keep what it holds. */
  unbindEditor(bridge: EditorBridge): void {
    if (this.#editor !== bridge) return;
    const body = bridge.read();
    this.#body = body;
    this.#editor = null;
    this.#state = { ...this.#state, html: body.html };
  }

  focusEditor(): void {
    this.#editor?.focus();
  }

  /** Read the editor now (before its window closes). */
  captureBody(): void {
    if (this.#editor && !this.#state.plain) {
      this.#body = this.#editor.read();
      this.#state = { ...this.#state, html: this.#body.html };
    }
  }

  #readBody(): SerializedBody {
    if (this.#state.plain) return { html: "", text: this.#state.text, ownText: this.#state.text, cids: [] };
    if (this.#editor) {
      this.#body = this.#editor.read();
      this.#state = { ...this.#state, html: this.#body.html };
      return this.#body;
    }
    if (this.#body) return this.#body;
    // Not mounted: read the stored HTML through the same sanitiser, in a detached element.
    const holder = document.createElement("div");
    holder.append(sanitizeForEditor(this.#state.html, { mode: "load", cidUrls: this.cidUrls() }).fragment);
    this.#body = serializeEditor(holder);
    return this.#body;
  }

  /** Ctrl+Enter from outside the window (brief 14): the mounted form registers how it sends. */
  onSendRequest(handler: (() => void) | null): void {
    this.#sendRequest = handler;
  }

  requestSend(): boolean {
    if (!this.#sendRequest) return false;
    this.#sendRequest();
    return true;
  }

  // ---- Files ---------------------------------------------------------------------------------

  /** Attach files (the tray). Uploads start at once. */
  addFiles(files: readonly File[]): void {
    const items = files.map((file) => this.#fileItem(file, null, null));
    this.#edit({ files: [...this.#state.files, ...items] });
    files.forEach((file, i) => void this.#upload(file, items[i] as FileItem, "files"));
  }

  /** Put an image in the body: returns its cid and the object URL to show while it uploads. */
  addInlineImage(file: File): { cid: string; url: string } {
    const cid = `${this.#unique().replace(/[^A-Za-z0-9]/g, "").slice(0, 20)}@postern`.toLowerCase();
    const url = URL.createObjectURL(file);
    const item = this.#fileItem(file, cid, url);
    this.#edit({ inline: [...this.#state.inline, item] });
    void this.#upload(file, item, "inline");
    return { cid, url };
  }

  /** An image picked with Insert photo: into the body at the caret. */
  insertImageFile(file: File): void {
    const { cid, url } = this.addInlineImage(file);
    if (this.#editor) this.#editor.insertImage(cid, url, file.name);
    else this.#set({ html: `${this.#state.html}<div><img src="cid:${cid}" alt=""></div>`, revision: this.#state.revision + 1 });
  }

  #fileItem(file: File, cid: string | null, url: string | null): FileItem {
    return { key: this.#unique(), name: file.name || "attachment", type: file.type || "application/octet-stream", size: file.size, status: "uploading", loaded: 0, blobId: null, error: null, cid, url };
  }

  #patchFile(list: "files" | "inline", key: string, patch: Partial<FileItem>): void {
    this.#set({ [list]: this.#state[list].map((f) => (f.key === key ? { ...f, ...patch } : f)) } as Partial<ComposeSnapshot>);
  }

  async #upload(file: File, item: FileItem, list: "files" | "inline"): Promise<void> {
    const upload = this.#deps.upload ?? uploadFile;
    try {
      const res = await upload(this.#deps.client, file, {
        signal: this.#abort.signal,
        onProgress: (p) => this.#patchFile(list, item.key, { loaded: p.loaded }),
      });
      if (!this.#state[list].some((f) => f.key === item.key)) return;
      this.#patchFile(list, item.key, { status: "done", blobId: res.blobId, loaded: item.size, type: item.type || res.type });
      this.#saver.touch();
    } catch (err) {
      if (this.#disposed) return;
      this.#patchFile(list, item.key, { status: "error", error: explainUploadError(err) });
    }
  }

  removeFile(key: string): void {
    const inline = this.#state.inline.find((f) => f.key === key);
    if (inline?.url) URL.revokeObjectURL(inline.url);
    this.#edit({ files: this.#state.files.filter((f) => f.key !== key), inline: this.#state.inline.filter((f) => f.key !== key) });
  }

  // ---- Saving -------------------------------------------------------------------------------

  /**
   * Untouched since it opened: what was filled in for the user (reply
   * recipients, "Re:" subject, signature, quote) is not worth a draft, so
   * closing it leaves nothing behind (as in Gmail).
   */
  isEmpty(): boolean {
    return !this.#edited && this.#state.draftId === null;
  }

  /** The body has nothing the user wrote (signature and quote aside): for "send without a subject or text?". */
  bodyIsBlank(): boolean {
    const body = this.#readBody();
    return body.ownText.replace(/\u200b/g, "").trim() === "" && body.cids.length === 0;
  }

  /** The draft as it stands. */
  content(): DraftContent | null {
    const identity = this.identity;
    const from = identity ? { name: identity.name || null, email: identity.email } : { name: null, email: this.#deps.username };
    const s = this.#state;
    const body = this.#readBody();
    const valid = (list: readonly Recipient[]) => list.filter((r) => r.valid).map((r) => ({ name: r.name, email: r.email }));
    const quote = s.quote;
    const usedCids = new Set(body.cids);
    return {
      from,
      to: valid(s.to),
      cc: valid(s.cc),
      bcc: valid(s.bcc),
      replyTo: identity?.replyTo ?? null,
      subject: s.subject,
      html: s.plain ? null : quote ? `${body.html}<br>${quote.html}` : body.html,
      text: quote ? `${body.text}\n\n${quote.text}` : body.text,
      attachments: s.files.filter((f) => f.status === "done" && f.blobId).map((f) => ({ blobId: f.blobId as Id, type: f.type, name: f.name, size: f.size })),
      inline: s.plain ? [] : s.inline.filter((f) => f.status === "done" && f.blobId && f.cid && usedCids.has(f.cid)).map((f) => ({ blobId: f.blobId as Id, type: f.type, name: f.name, cid: f.cid })),
      messageId: this.#messageId,
      inReplyTo: this.#inReplyTo,
      references: this.#references,
    };
  }

  /** What the user wrote themselves (for the "attached" check). */
  ownText(): string {
    return this.#readBody().ownText;
  }

  async #save(): Promise<void> {
    const drafts = this.#deps.draftsMailboxId();
    if (!drafts) throw new Error("No Drafts label");
    const content = this.content();
    if (!content) return;
    const email = buildDraftEmail(content, { draftsMailboxId: drafts });
    const previous = [...(this.#state.draftId ? [this.#state.draftId] : []), ...this.#leftOver];
    const saved = await saveDraft(this.#deps.client, email, previous);
    this.#leftOver = saved.leftOver;
    const first = !this.#saved;
    this.#saved = true;
    if (this.#disposed) {
      // Discarded while saving: take the copy just made away too.
      void destroyDrafts(this.#deps.client, [saved.id]).catch(() => {});
      return;
    }
    this.#set({ draftId: saved.id, threadId: saved.threadId || this.#state.threadId });
    if (first) this.#deps.onFirstSave(this);
  }

  /** Something to save: start the autosave clock. */
  touch(): void {
    this.#saver.touch();
  }

  /** Save now (close, send). Rejects when the save fails. */
  async flush(): Promise<void> {
    if (this.#state.status !== "ready") return;
    if (this.isEmpty()) return;
    if (!this.#saved) this.#saver.touch();
    await this.#saver.flush();
  }

  /** Save now even if untouched (Send on an unedited reply needs a draft to submit). */
  async flushForSend(): Promise<void> {
    this.#edited = true;
    if (!this.#saved || this.#state.draftId === null) this.#saver.touch();
    await this.#saver.flush();
    if (!this.#state.draftId) throw new Error("The draft was not saved");
  }

  /** Every server copy of this draft (to discard them). */
  draftIds(): Id[] {
    return [...(this.#state.draftId ? [this.#state.draftId] : []), ...this.#leftOver];
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  /** Stop saving and uploading, free the image URLs. */
  dispose(): void {
    if (this.#disposed) return;
    this.#saver.dispose();
    this.#abort.abort();
    this.#disposed = true;
    for (const f of this.#state.inline) if (f.url) URL.revokeObjectURL(f.url);
    this.#listeners.clear();
  }
}

/** Swap the signature block in stored editor HTML (the editor not mounted). */
function replaceSignature(html: string, next: string | null, cidUrls: ReadonlyMap<string, string>): string {
  const holder = document.createElement("div");
  holder.append(sanitizeForEditor(html, { mode: "load", cidUrls }).fragment);
  const old = holder.querySelector(".postern_signature");
  if (old) old.remove();
  const body = serializeEditor(holder).html;
  return next ? `${body}${next}` : body;
}
