// The composer windows: which drafts are open, where (docked, minimised, full
// screen, inline under a conversation), and the actions on them: open, close
// (keeps the draft), discard, send with Undo. One store per signed-in session,
// made by ComposerProvider; brief 14's keys reach it through getComposer().

import { isAbortError, type Id, type Identity, type JmapClient } from "@postern/jmap";
import { publishMailChange, type MailChange } from "../actions/bus";
import { DRAFT } from "../actions/conversation";
import { inlineReplySlotId } from "../conversation/inlineReply";
import type { LabelsStore } from "../labels/labelsStore";
import { navigate, type Route } from "../shell/router";
import type { ToastApi } from "../shell/toast";
import { destroyDrafts } from "../send/drafts";
import { explainSaveError, explainSendError } from "../send/errors";
import { Outbox } from "../send/outbox";
import { submitDraft, type Submitted } from "../send/submit";
import { getUndoSendDelay } from "../send/undoDelay";
import type { ComposeOptions } from "./compose";
import type { RecipientSource } from "./recipients";
import { ComposeSession, type ComposeSnapshot, type Placement, type SessionDeps } from "./session";

export interface ComposerDeps {
  client: JmapClient;
  username: string;
  labels: Pick<LabelsStore, "mailboxIdForRole" | "sync">;
  toast: Pick<ToastApi, "show">;
  recipients: RecipientSource;
  publish?: (change: MailChange) => void;
  navigate?: (route: Route) => void;
  /** Whether the conversation `threadId` is on screen with its inline reply slot. */
  hasInlineSlot?: (threadId: Id) => boolean;
  /** The window's width, to fit docked composers side by side. */
  viewportWidth?: () => number;
  /** Passed to every session (tests). */
  session?: Partial<Pick<SessionDeps, "upload" | "unique" | "autosaveDelayMs">>;
}

/** A docked composer's width plus the gap, in px (composer.css). */
export const DOCKED_WIDTH = 560;
/** A minimised composer's width plus the gap. */
export const MINIMISED_WIDTH = 276;

export interface ThreadDrafts {
  /** Every message of the conversation, oldest first: id and whether it is a draft. */
  messages: { id: Id; draft: boolean }[];
}

export class ComposerStore {
  readonly outbox = new Outbox();
  readonly #deps: ComposerDeps;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe = new Map<string, () => void>();
  #sessions: ComposeSession[] = [];
  #snapshot: readonly ComposeSnapshot[] = [];
  #identities: Promise<readonly Identity[]> | null = null;
  /** Drafts closed (or discarded) in this session: not opened again on their own. */
  readonly #closed = new Set<Id>();
  readonly #gone = new Set<Id>();
  #disposed = false;

  constructor(deps: ComposerDeps) {
    this.#deps = deps;
  }

  // ---- React ----------------------------------------------------------------------------

  getSnapshot = (): readonly ComposeSnapshot[] => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #emit(): void {
    this.#snapshot = this.#sessions.map((s) => s.state);
    for (const l of [...this.#listeners]) l();
  }

  get recipients(): RecipientSource {
    return this.#deps.recipients;
  }

  get client(): JmapClient {
    return this.#deps.client;
  }

  get(key: string): ComposeSession | undefined {
    return this.#sessions.find((s) => s.key === key);
  }

  /** The open composer holding this draft (any copy of it), if any. */
  forDraft(draftId: Id): ComposeSession | undefined {
    return this.#sessions.find((s) => s.draftIds().includes(draftId));
  }

  /** Drafts closed or discarded in this session (the inline reply offers them instead of opening them). */
  wasClosed(draftId: Id): boolean {
    return this.#closed.has(draftId) || this.#gone.has(draftId);
  }

  isGone(draftId: Id): boolean {
    return this.#gone.has(draftId);
  }

  // ---- Identities ---------------------------------------------------------------------------

  /** Identity/get, once per session (Brief 12 edits them; a new composer after that reads them again). */
  identities(): Promise<readonly Identity[]> {
    if (!this.#identities) {
      const fallback: Identity[] = [{ id: "", name: "", email: this.#deps.username, replyTo: null, bcc: null, textSignature: "", htmlSignature: "", mayDelete: false }];
      this.#identities = this.#deps.client.identity.get().then(
        (res) => (res.list.length ? res.list : fallback),
        () => {
          this.#identities = null;
          return fallback;
        },
      );
    }
    return this.#identities;
  }

  /** Forget the identities (brief 12, after editing them). */
  refreshIdentities(): void {
    this.#identities = null;
  }

  // ---- Opening ---------------------------------------------------------------------------------

  /** Open a composer (or bring back the one already holding that draft or reply). */
  open(options: ComposeOptions = {}): ComposeSession {
    const mode = options.mode ?? "new";
    if (options.draftId) {
      const existing = this.forDraft(options.draftId);
      if (existing) {
        this.#reveal(existing);
        return existing;
      }
    }
    if (mode !== "new" && options.threadId && !options.draftId) {
      const existing = this.#sessions.find((s) => s.state.threadId === options.threadId && s.state.mode === mode && s.state.sourceId === (options.emailId ?? null) && !s.state.sending);
      if (existing) {
        this.#reveal(existing);
        return existing;
      }
    }
    const placement = this.#placementFor(options);
    const session = new ComposeSession(this.#sessionDeps(), {
      mode,
      placement,
      sourceId: options.emailId ?? null,
      threadId: options.threadId ?? null,
      draftId: options.draftId ?? null,
    });
    this.#add(session);
    this.#fit(session);
    void session.load(options).then(() => {
      if (session.disposed) return;
      const needsTo = session.state.to.length === 0 && (mode === "new" || mode === "forward");
      session.requestFocus(needsTo ? "to" : "body");
    });
    return session;
  }

  #placementFor(options: ComposeOptions): Placement {
    if (options.display === "fullscreen") return "fullscreen";
    if (options.display === "docked") return "docked";
    const threadId = options.threadId;
    const inlineWanted = options.display === "inline" || ((options.mode ?? "new") !== "new" && !!threadId);
    if (inlineWanted && threadId && this.#hasInlineSlot(threadId) && !this.#sessions.some((s) => s.state.placement === "inline" && s.state.threadId === threadId)) return "inline";
    return "docked";
  }

  #hasInlineSlot(threadId: Id): boolean {
    if (this.#deps.hasInlineSlot) return this.#deps.hasInlineSlot(threadId);
    return typeof document !== "undefined" && document.getElementById(inlineReplySlotId(threadId)) !== null;
  }

  #reveal(session: ComposeSession): void {
    if (session.state.sending) return;
    if (session.state.placement === "minimised") session.setPlacement("docked");
    if (session.state.placement === "inline" && session.state.threadId && !this.#hasInlineSlot(session.state.threadId)) session.setPlacement("docked");
    this.#fit(session);
    session.requestFocus("body");
  }

  /** Minimise the oldest docked composers when more are open than fit side by side. */
  #fit(keep: ComposeSession): void {
    const width = this.#deps.viewportWidth?.() ?? (typeof window !== "undefined" ? window.innerWidth : 1600);
    const docked = this.#sessions.filter((s) => s.state.placement === "docked" && !s.state.sending);
    const minimised = this.#sessions.filter((s) => s.state.placement === "minimised" && !s.state.sending).length;
    const room = Math.max(1, Math.floor((width - 96 - minimised * MINIMISED_WIDTH) / DOCKED_WIDTH));
    const excess = docked.length - room;
    if (excess <= 0) return;
    for (const s of docked.filter((d) => d !== keep).slice(0, excess)) s.setPlacement("minimised");
  }

  setPlacement(key: string, placement: Placement): void {
    const session = this.get(key);
    if (!session) return;
    const before = session.state.placement;
    session.setPlacement(placement);
    if (placement === "docked") this.#fit(session);
    // Coming back from a title bar, or into / out of full screen: back to the text.
    if (placement !== "minimised" && before !== placement) session.requestFocus("body");
  }

  #sessionDeps(): SessionDeps {
    return {
      client: this.#deps.client,
      username: this.#deps.username,
      identities: () => this.identities(),
      draftsMailboxId: () => this.#deps.labels.mailboxIdForRole("drafts"),
      onFirstSave: () => void this.#deps.labels.sync(),
      ...this.#deps.session,
    };
  }

  #add(session: ComposeSession): void {
    this.#sessions = [...this.#sessions, session];
    this.#unsubscribe.set(session.key, session.subscribe(() => this.#emit()));
    this.#emit();
  }

  #remove(session: ComposeSession): void {
    this.#unsubscribe.get(session.key)?.();
    this.#unsubscribe.delete(session.key);
    this.#sessions = this.#sessions.filter((s) => s !== session);
    this.#emit();
  }

  #settled(): void {
    (this.#deps.publish ?? publishMailChange)({ kind: "settled" });
    void this.#deps.labels.sync();
  }

  // ---- Closing ---------------------------------------------------------------------------------

  /** Close the window. The draft is saved first (nothing is left behind for an untouched composer). */
  async close(key: string): Promise<void> {
    const session = this.get(key);
    if (!session || session.state.sending) return;
    session.captureBody();
    this.#remove(session);
    if (session.isEmpty() || session.state.status !== "ready") {
      session.dispose();
      return;
    }
    try {
      await session.flush();
    } catch (err) {
      if (session.disposed || this.#disposed) return;
      // Not saved: keep the window (minimised) so nothing is lost.
      session.setPlacement("minimised");
      this.#add(session);
      this.#deps.toast.show({ message: explainSaveError(err) || "Couldn't save the draft." });
      return;
    }
    for (const id of session.draftIds()) this.#closed.add(id);
    session.dispose();
    this.#settled();
  }

  /** Discard the draft (the window asks first). */
  async discard(key: string): Promise<void> {
    const session = this.get(key);
    if (!session) return;
    this.#remove(session);
    const ids = session.draftIds();
    for (const id of ids) this.#gone.add(id);
    session.dispose();
    if (ids.length === 0) {
      this.#deps.toast.show({ message: "Draft discarded." });
      return;
    }
    try {
      await destroyDrafts(this.#deps.client, ids);
      this.#deps.toast.show({ message: "Draft discarded." });
      this.#settled();
    } catch (err) {
      if (isAbortError(err)) return;
      this.#deps.toast.show({ message: "Couldn't discard the draft. It's still in Drafts." });
    }
  }

  // ---- Sending -----------------------------------------------------------------------------------

  /**
   * Send (the window has checked the recipients and asked its questions):
   * save the draft as it stands, hide the window, hold the message for the
   * undo delay, then submit it.
   */
  async send(key: string): Promise<void> {
    const session = this.get(key);
    if (!session || session.state.sending || this.outbox.has(key)) return;
    session.setSendError(null);
    session.captureBody();
    session.setSending(true);
    try {
      await session.flushForSend();
    } catch (err) {
      session.setSending(false);
      session.setSendError(`The draft couldn't be saved, so it wasn't sent. ${explainSaveError(err)}`.trim());
      return;
    }
    const identity = session.identity;
    const emailId = session.draftId;
    if (!identity?.id || !emailId) {
      session.setSending(false);
      session.setSendError("No From address to send as. Reload Postern and try again.");
      return;
    }
    const delay = getUndoSendDelay();
    const recipients = session.content();
    this.outbox.hold<Submitted>({
      key,
      label: session.state.subject,
      delayMs: delay,
      send: () =>
        submitDraft(this.#deps.client, {
          emailId,
          identityId: identity.id,
          draftsMailboxId: this.#deps.labels.mailboxIdForRole("drafts"),
          sentMailboxId: this.#deps.labels.mailboxIdForRole("sent"),
        }),
      onSent: () => {
        const threadId = session.state.threadId;
        this.#remove(session);
        session.dispose();
        if (recipients) this.#deps.recipients.remember([...recipients.to, ...recipients.cc, ...recipients.bcc]);
        this.#settled();
        this.#deps.toast.show({
          message: "Message sent.",
          action: threadId ? { label: "View message", onClick: () => (this.#deps.navigate ?? navigate)({ kind: "system", view: "sent", conversationId: threadId }) } : undefined,
        });
      },
      onFailed: (err) => {
        if (session.disposed || this.#disposed) return;
        session.setSending(false);
        session.setSendError(explainSendError(err));
        if (session.state.placement === "inline" && session.state.threadId && !this.#hasInlineSlot(session.state.threadId)) session.setPlacement("docked");
        if (session.state.placement === "minimised") session.setPlacement("docked");
        session.requestFocus("window");
        this.#deps.toast.show({ message: "Couldn't send the message. It's saved in Drafts." });
      },
    });
    if (delay > 0) {
      this.#deps.toast.show({ message: "Message sent.", action: { label: "Undo", onClick: () => this.undoSend(key) }, duration: null });
    } else {
      this.#deps.toast.show({ message: "Sending…", duration: null });
    }
  }

  /** Undo send: nothing was submitted; the draft comes back in its window. */
  undoSend(key: string): boolean {
    if (!this.outbox.undo(key)) return false;
    const session = this.get(key);
    if (session) {
      session.setSending(false);
      if (session.state.placement === "inline" && session.state.threadId && !this.#hasInlineSlot(session.state.threadId)) session.setPlacement("docked");
      if (session.state.placement === "minimised") session.setPlacement("docked");
      session.requestFocus("body");
    }
    this.#deps.toast.show({ message: "Sending undone." });
    return true;
  }

  // ---- Drafts in a conversation ------------------------------------------------------------------

  /** The messages of a conversation and which are drafts (one request). */
  async threadDrafts(threadId: Id, signal?: AbortSignal): Promise<ThreadDrafts> {
    const r = this.#deps.client.request();
    const t = r.call("Thread/get", { ids: [threadId] });
    const g = r.call("Email/get", { ids: t.ref("/list/*/emailIds"), properties: ["id", "keywords", "mailboxIds"] });
    const res = await r.send({ signal });
    const order = res.get(t).list[0]?.emailIds ?? [];
    const byId = new Map(res.get(g).list.map((e) => [e.id, e]));
    const drafts = this.#deps.labels.mailboxIdForRole("drafts");
    const messages = order
      .map((id) => byId.get(id))
      .filter((e): e is NonNullable<typeof e> => e !== undefined)
      .map((e) => ({ id: e.id, draft: e.keywords?.[DRAFT] === true && (!drafts || e.mailboxIds?.[drafts] === true) }));
    return { messages };
  }

  /** Sign-out: stop every composer. Held messages are not sent (they stay in Drafts). */
  dispose(): void {
    this.#disposed = true;
    this.outbox.dispose();
    for (const s of this.#sessions) s.dispose();
    for (const u of this.#unsubscribe.values()) u();
    this.#unsubscribe.clear();
    this.#sessions = [];
    this.#emit();
  }

  /** StrictMode's dev re-run disposes and activates again; a real unmount leaves it disposed. */
  activate(): void {
    this.#disposed = false;
  }
}
