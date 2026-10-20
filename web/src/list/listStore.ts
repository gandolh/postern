// One conversation list's data, kept current. Framework-free; React reads it
// through useSyncExternalStore (useListStore).
//
// Pages: one request per page of 50, four calls linked by back-references:
//   Email/query (collapseThreads, newest first) → Email/get of the row
//   messages → Thread/get (#ids /list/*/threadId) → Email/get of every message
//   in those conversations (#ids /list/*/emailIds), minimal properties.
// Pages are a contiguous run from the top (the jmap QueryStore), so
// Email/queryChanges applies exactly even though Stalwart ignores upToId.
//
// Freshness: refresh() runs Email/changes (the messages held) and
// Email/queryChanges (the ids held), then fetches rows that came in. When
// the server cannot calculate changes, the held pages are loaded again from
// the top, the old rows staying on screen meanwhile. applyStateChange(change)
// is the same, for brief 11's push.
//
// Actions: every patch an action publishes (actions/bus) is applied to the
// messages held at once, and a row whose messages no longer match the list
// (archived out of the Inbox) leaves until the server confirms or undo
// brings it back.

import {
  ObjectStore,
  QueryStore,
  syncObjects,
  syncQuery,
  type Email,
  type EmailComparator,
  type EmailProperty,
  type GetResponse,
  type Id,
  type MethodCaller,
  type PatchObject,
  type QueryResponse,
  type SearchSnippet,
  type StateChange,
  type Thread,
} from "@postern/jmap";
import { subscribeMailChanges } from "../actions/bus";
import { applyPatch } from "../actions/patches";
import { isQuietError } from "../actions/runner";
import type { ConversationRow, ListQuery, ListSnapshot, RowMessage } from "./types";

export const PAGE_SIZE = 50;

/** The row's own message: subject, snippet, date, attachment. */
export const ROW_PROPERTIES = ["threadId", "from", "subject", "preview", "receivedAt", "keywords", "mailboxIds", "hasAttachment"] as const satisfies readonly EmailProperty[];

/** Every message of a conversation: enough for senders, unread, stars, labels and actions. */
export const MESSAGE_PROPERTIES = ["threadId", "from", "to", "keywords", "mailboxIds", "receivedAt"] as const satisfies readonly EmailProperty[];

export const NEWEST_FIRST: EmailComparator[] = [{ property: "receivedAt", isAscending: false }];

/** After a page fails, scrolling waits this long before asking again (Try again does not). */
const RETRY_AFTER_MS = 3000;

const INITIAL: ListSnapshot = Object.freeze({ status: "loading", error: null, rows: [], total: 0, complete: false });

interface RowBase {
  emailId: Id;
  threadId: Id;
  subject: string;
  preview: string;
  receivedAt: string;
  hasAttachment: boolean;
  snippet?: SearchSnippet;
}

/** A row message as Email/get returns it. */
type RowEmail = Partial<Pick<Email, "id" | "threadId" | "subject" | "preview" | "receivedAt" | "hasAttachment">>;

interface Page {
  query: QueryResponse;
  rows: RowEmail[];
  threads: Thread[];
  messages: GetResponse<RowMessage>;
  snippets: SearchSnippet[];
}

type PageOutcome = "ok" | "stale" | "failed";

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export interface ListStoreOptions {
  /** The mail account, for push StateChanges. */
  accountId?: () => Id | undefined;
  pageSize?: number;
}

export class ListStore {
  readonly query: ListQuery;
  readonly #caller: MethodCaller;
  readonly #accountId: () => Id | undefined;
  readonly #pageSize: number;
  readonly #ids: QueryStore;
  readonly #messages = new ObjectStore<RowMessage>("Email");
  /** Row message id → the row's own data. */
  readonly #bases = new Map<Id, RowBase>();
  /** Conversation id → its message ids, oldest first. */
  readonly #threads = new Map<Id, Id[]>();
  #rows = new Map<Id, ConversationRow>();
  /** Conversations changed locally since the server last confirmed. */
  readonly #pending = new Set<Id>();
  #localVersion = 0;
  #snapshot: ListSnapshot = INITIAL;
  readonly #listeners = new Set<() => void>();
  #queue: Promise<unknown> = Promise.resolve();
  #wanted = 0;
  #pumping = false;
  #started = false;
  #disposed = false;
  #silent = false;
  #failedAt = 0;
  #refreshQueued: Promise<void> | null = null;
  #unsubscribeBus: (() => void) | null = null;

  constructor(caller: MethodCaller, query: ListQuery, options: ListStoreOptions = {}) {
    this.#caller = caller;
    this.query = query;
    this.#accountId = options.accountId ?? (() => undefined);
    this.#pageSize = options.pageSize ?? PAGE_SIZE;
    this.#ids = new QueryStore(QueryStore.keyOf(this.#queryArgs()));
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): ListSnapshot => this.#snapshot;

  get pageSize(): number {
    return this.#pageSize;
  }

  /** The Email state the held messages are at (null before the first page). */
  get emailState(): string | null {
    return this.#messages.state;
  }

  /** Begin: load the first page, and hear actions' patches. Safe to call again. */
  start(): void {
    this.#listen();
    if (this.#started) return;
    this.#started = true;
    this.ensureLoaded(this.#pageSize);
  }

  /** Make sure the first `count` conversations are loaded (or all, if fewer), page by page. */
  ensureLoaded(count: number): void {
    this.#wanted = Math.max(this.#wanted, count);
    // Scrolling asks on every frame: after a failed page, wait a moment before asking the server again.
    if (Date.now() - this.#failedAt < RETRY_AFTER_MS) return;
    void this.#pump();
  }

  /** After a failed first load: try again. */
  retry(): void {
    this.#failedAt = 0;
    if (this.#snapshot.status === "error") this.#publish({ ...INITIAL });
    void this.#pump();
  }

  /** Catch up with the server: Email/changes and Email/queryChanges. Concurrent calls share one run. */
  refresh(): Promise<void> {
    if (this.#snapshot.status !== "ready") {
      void this.#pump();
      return Promise.resolve();
    }
    this.#refreshQueued ??= this.#exclusive(async () => {
      this.#refreshQueued = null;
      await this.#refreshNow();
    });
    return this.#refreshQueued;
  }

  /** Brief 11: a push StateChange. Refreshes when it names an Email state other than the one held. */
  applyStateChange(change: StateChange): Promise<void> {
    const accountId = this.#accountId();
    const next = accountId === undefined ? undefined : change.changed[accountId]?.["Email"];
    if (next === undefined || next === this.#messages.state) return Promise.resolve();
    return this.refresh();
  }

  /**
   * Every conversation in the list, with its messages: what "Select all N
   * conversations" acts on. Fetched in chunks (the client splits /get by
   * maxObjectsInGet).
   */
  async allConversations(): Promise<ConversationRow[]> {
    const { filter, sort } = this.#queryArgs();
    const repIds: Id[] = [];
    for (let position = 0; ; ) {
      const res = await this.#caller.call("Email/query", { filter, sort, collapseThreads: true, position, limit: 1000 });
      repIds.push(...res.ids);
      position += res.ids.length;
      if (res.ids.length === 0 || res.ids.length < (res.limit ?? 1000) || (res.total !== undefined && position >= res.total)) break;
    }
    if (repIds.length === 0) return [];
    const reps = await this.#caller.call("Email/get", { ids: repIds, properties: [...ROW_PROPERTIES] });
    const threadIds = [...new Set(reps.list.map((e) => e.threadId))];
    const threads = await this.#caller.call("Thread/get", { ids: threadIds });
    const messages = await this.#getMessages(threads.list.flatMap((t) => t.emailIds));
    const byId = new Map(messages.list.map((m) => [m.id, m]));
    const emailsOf = new Map(threads.list.map((t) => [t.id, t.emailIds]));
    const repById = new Map(reps.list.map((e) => [e.id, e]));
    const seen = new Set<Id>();
    const out: ConversationRow[] = [];
    for (const id of repIds) {
      const rep = repById.get(id);
      if (!rep || seen.has(rep.threadId)) continue;
      seen.add(rep.threadId);
      const list = (emailsOf.get(rep.threadId) ?? []).flatMap((m) => (byId.has(m) ? [byId.get(m) as RowMessage] : []));
      out.push({
        id: rep.threadId,
        emailId: rep.id,
        subject: rep.subject ?? "",
        preview: rep.preview ?? "",
        receivedAt: rep.receivedAt ?? "",
        hasAttachment: rep.hasAttachment ?? false,
        messages: list,
      });
    }
    return out;
  }

  /** Stop: no more notifications or bus patches. In-flight requests finish unseen. */
  dispose(): void {
    this.#disposed = true;
    this.#unsubscribeBus?.();
    this.#unsubscribeBus = null;
  }

  /** Undo `dispose` (React StrictMode mounts twice in development). */
  activate(): void {
    this.#disposed = false;
    if (this.#started) {
      this.#listen();
      void this.#pump();
    }
  }

  // ---- Internals ------------------------------------------------------------

  #listen(): void {
    this.#unsubscribeBus ??= subscribeMailChanges((change) => {
      if (change.kind === "patch") this.#applyLocal(change.update);
      else void this.refresh();
    });
  }

  #queryArgs() {
    return {
      filter: this.query.filter,
      sort: this.query.sort ?? NEWEST_FIRST,
      collapseThreads: true,
      calculateTotal: true,
    };
  }

  /** Run store mutations one at a time, in order. */
  #exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(fn);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #pump(): Promise<void> {
    if (this.#pumping) return;
    this.#pumping = true;
    let stale = 0;
    try {
      while (!this.#disposed && this.#snapshot.status !== "error") {
        const loaded = this.#ids.queryState !== null;
        const total = this.#ids.total ?? Infinity;
        if (loaded && (this.#ids.ids.length >= total || this.#ids.ids.length >= this.#wanted)) break;
        const outcome = await this.#exclusive(async () => {
          const result = await this.#loadPage();
          // The list moved on since the pages held: catch up, then continue from its new end.
          if (result === "stale") await this.#refreshNow();
          return result;
        });
        if (outcome === "failed") break;
        stale = outcome === "stale" ? stale + 1 : 0;
        if (stale > 5) break;
      }
    } finally {
      this.#pumping = false;
    }
  }

  /** Load the next page and add it. "stale" when the server's list changed since the pages held. */
  async #loadPage(): Promise<PageOutcome> {
    const position = this.#ids.queryState === null ? 0 : this.#ids.ids.length;
    let page: Page;
    try {
      page = await this.#fetchPage(position);
    } catch (err) {
      this.#fail(err);
      return "failed";
    }
    if (this.#ids.queryState !== null && page.query.queryState !== this.#ids.queryState) return "stale";
    this.#ids.applyQuery(page.query);
    this.#messages.put(page.messages);
    this.#addRows(page.rows, page.threads, page.snippets);
    this.#publish();
    return "ok";
  }

  async #fetchPage(position: number): Promise<Page> {
    const r = this.#caller.request();
    const args = this.#queryArgs();
    const q = r.call("Email/query", { ...args, position, limit: this.#pageSize });
    const g = r.call("Email/get", { ids: q.ref("/ids"), properties: [...ROW_PROPERTIES] });
    const t = r.call("Thread/get", { ids: g.ref<Id[]>("/list/*/threadId") });
    const m = r.call("Email/get", { ids: t.ref<Id[]>("/list/*/emailIds"), properties: [...MESSAGE_PROPERTIES] });
    const s = this.query.searchSnippets ? r.call("SearchSnippet/get", { filter: args.filter, emailIds: q.ref("/ids") }) : null;
    const res = await r.send();
    const query = res.get(q);
    const rows = res.get(g).list;
    const threads = res.get(t).list;
    // Long conversations can pass maxObjectsInGet in one back-referenced get: fetch those in chunks.
    const messages = res.error(m) ? await this.#getMessages(threads.flatMap((x) => x.emailIds)) : (res.get(m) as unknown as GetResponse<RowMessage>);
    const snippets = s && !res.error(s) ? res.get(s).list : [];
    return { query, rows, threads, messages, snippets };
  }

  async #getMessages(ids: Id[]): Promise<GetResponse<RowMessage>> {
    return (await this.#caller.call("Email/get", { ids, properties: [...MESSAGE_PROPERTIES] })) as unknown as GetResponse<RowMessage>;
  }

  /** Fetch rows that came into the list, and conversations that gained a message. One request. */
  async #fetchRows(repIds: readonly Id[], threadIds: readonly Id[]): Promise<void> {
    for (let i = 0; i < Math.max(repIds.length, threadIds.length ? 1 : 0); i += this.#pageSize) {
      const chunk = repIds.slice(i, i + this.#pageSize);
      const r = this.#caller.request();
      const g = chunk.length ? r.call("Email/get", { ids: [...chunk], properties: [...ROW_PROPERTIES] }) : null;
      const t = g ? r.call("Thread/get", { ids: g.ref<Id[]>("/list/*/threadId") }) : null;
      const m = t ? r.call("Email/get", { ids: t.ref<Id[]>("/list/*/emailIds"), properties: [...MESSAGE_PROPERTIES] }) : null;
      const s = g && this.query.searchSnippets ? r.call("SearchSnippet/get", { filter: this.query.filter, emailIds: [...chunk] }) : null;
      const more = i === 0 && threadIds.length ? r.call("Thread/get", { ids: [...threadIds] }) : null;
      const moreMessages = more ? r.call("Email/get", { ids: more.ref<Id[]>("/list/*/emailIds"), properties: [...MESSAGE_PROPERTIES] }) : null;
      const res = await r.send();
      const threads: Thread[] = [];
      if (g && t && m) {
        threads.push(...res.get(t).list);
        const messages = res.error(m) ? await this.#getMessages(res.get(t).list.flatMap((x) => x.emailIds)) : (res.get(m) as unknown as GetResponse<RowMessage>);
        this.#messages.put(messages);
        this.#addRows(res.get(g).list, res.get(t).list, s && !res.error(s) ? res.get(s).list : []);
      }
      if (more && moreMessages) {
        const list = res.get(more).list;
        const messages = res.error(moreMessages)
          ? await this.#getMessages(list.flatMap((x) => x.emailIds))
          : (res.get(moreMessages) as unknown as GetResponse<RowMessage>);
        this.#messages.put(messages);
        for (const thread of list) this.#threads.set(thread.id, thread.emailIds);
      }
    }
  }

  #addRows(rows: readonly RowEmail[], threads: readonly Thread[], snippets: readonly SearchSnippet[]): void {
    for (const thread of threads) this.#threads.set(thread.id, thread.emailIds);
    const snippetOf = new Map(snippets.map((s) => [s.emailId, s]));
    for (const row of rows) {
      if (!row.id || !row.threadId) continue;
      const snippet = snippetOf.get(row.id);
      this.#bases.set(row.id, {
        emailId: row.id,
        threadId: row.threadId,
        subject: row.subject ?? "",
        preview: row.preview ?? "",
        receivedAt: row.receivedAt ?? "",
        hasAttachment: row.hasAttachment ?? false,
        ...(snippet ? { snippet } : {}),
      });
    }
  }

  async #refreshNow(): Promise<void> {
    if (this.#ids.queryState === null || this.#messages.state === null) return;
    const held = this.#ids.ids.length;
    const localAtStart = this.#localVersion;
    try {
      const objects = await syncObjects(this.#caller, "Email", this.#messages, { properties: [...MESSAGE_PROPERTIES] });
      if (objects.status === "cannotCalculateChanges") return await this.#reloadNow(held);
      const query = await syncQuery(this.#caller, "Email/query", this.#queryArgs(), this.#ids);
      if (query.status === "cannotCalculateChanges") return await this.#reloadNow(held);

      const threadsToFetch = new Set<Id>();
      if (objects.status === "changed") {
        for (const id of objects.created) {
          const message = this.#messages.get(id);
          if (message && this.#threads.has(message.threadId)) threadsToFetch.add(message.threadId);
        }
        if (objects.destroyed.length > 0) {
          const gone = new Set(objects.destroyed);
          for (const [threadId, ids] of this.#threads) {
            if (ids.some((id) => gone.has(id))) this.#threads.set(threadId, ids.filter((id) => !gone.has(id)));
          }
        }
      }
      const missing = this.#ids.ids.filter((id) => !this.#bases.has(id));
      if (missing.length > 0 || threadsToFetch.size > 0) await this.#fetchRows(missing, [...threadsToFetch]);
    } catch (err) {
      this.#fail(err);
      return;
    }
    if (this.#localVersion === localAtStart) this.#pending.clear();
    this.#publish();
  }

  /** The server cannot say what changed: load the held pages again from the top, rows staying on screen meanwhile. */
  async #reloadNow(held: number): Promise<void> {
    const target = Math.max(held, this.#pageSize);
    this.#ids.clear();
    this.#messages.clear();
    this.#threads.clear();
    this.#silent = true;
    try {
      for (let attempts = 0; attempts < 5; ) {
        const total = this.#ids.total ?? Infinity;
        if (this.#ids.queryState !== null && this.#ids.ids.length >= Math.min(target, total)) break;
        const outcome = await this.#loadPage();
        if (outcome === "failed") return;
        if (outcome === "stale") {
          attempts++;
          this.#ids.clear();
          this.#messages.clear();
          this.#threads.clear();
        }
      }
    } finally {
      this.#silent = false;
    }
    this.#pending.clear();
    this.#publish();
  }

  #applyLocal(update: Readonly<Record<Id, PatchObject>>): void {
    const state = this.#messages.state;
    if (state === null) return;
    let touched = false;
    for (const [id, patch] of Object.entries(update)) {
      const message = this.#messages.get(id);
      if (!message) continue;
      const next = applyPatch(message, patch);
      if (next === message) continue;
      this.#messages.put({ state, list: [next], notFound: [] });
      this.#pending.add(message.threadId);
      touched = true;
    }
    if (!touched) return;
    this.#localVersion++;
    this.#publish();
  }

  #fail(err: unknown): void {
    // Session trouble is the sign-in layer's to show; the next refresh (focus, push) tries again.
    if (isQuietError(err)) return;
    this.#failedAt = Date.now();
    this.#publish(this.#snapshot.status === "ready" ? { ...this.#snapshot, error: err } : { ...INITIAL, status: "error", error: err });
  }

  #build(): ListSnapshot {
    const rows: ConversationRow[] = [];
    const next = new Map<Id, ConversationRow>();
    const seen = new Set<Id>();
    let hidden = 0;
    for (const repId of this.#ids.ids) {
      const base = this.#bases.get(repId);
      if (!base || seen.has(base.threadId)) continue;
      seen.add(base.threadId);
      const ids = this.#threads.get(base.threadId) ?? [repId];
      const messages = ids.flatMap((id) => {
        const m = this.#messages.get(id);
        return m ? [m] : [];
      });
      if (messages.length === 0) {
        hidden++;
        continue;
      }
      let row = this.#rows.get(repId);
      if (!row || row.snippet !== base.snippet || !sameItems(row.messages, messages)) {
        row = {
          id: base.threadId,
          emailId: repId,
          subject: base.subject,
          preview: base.preview,
          receivedAt: base.receivedAt,
          hasAttachment: base.hasAttachment,
          messages,
          ...(base.snippet ? { snippet: base.snippet } : {}),
        };
      }
      next.set(repId, row);
      const matches = this.query.matches;
      if (matches && this.#pending.has(base.threadId) && !messages.some(matches)) {
        hidden++;
        continue;
      }
      rows.push(row);
    }
    this.#rows = next;
    const serverTotal = this.#ids.total ?? this.#ids.ids.length;
    return {
      status: "ready",
      error: null,
      rows,
      total: Math.max(rows.length, serverTotal - hidden),
      complete: this.#ids.ids.length >= serverTotal,
    };
  }

  #publish(snapshot?: ListSnapshot): void {
    if (this.#disposed || this.#silent) return;
    this.#snapshot = snapshot ?? this.#build();
    for (const listener of [...this.#listeners]) listener();
  }
}
