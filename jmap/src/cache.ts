// A small, framework-free cache of JMAP objects and query results, kept
// current with /changes and /queryChanges. Each store remembers the state
// string its data is at. When the server cannot bridge from that state, sync
// reports `cannotCalculateChanges` and clears the store: the UI refetches.

import { JmapError, JmapMethodError } from "./errors.js";
import type { MethodCaller } from "./methods/caller.js";
import type { CallArgs } from "./request.js";
import type { ChangesResponse, GetResponse, Id, QueryChangesResponse, QueryResponse } from "./types/core.js";
import type { MethodName } from "./types/methods.js";
import type { StateChange } from "./types/push.js";

/** What a sync did. */
export type SyncResult =
  | { status: "unchanged"; state: string }
  | { status: "changed"; state: string; created: Id[]; updated: Id[]; destroyed: Id[] }
  | {
      /**
       * The server cannot get from the cached state to now. The store was
       * cleared; fetch again. `errorType` is the server's type:
       * `cannotCalculateChanges`, `tooManyChanges`, or `invalidArguments` (Stalwart's answer to a state it does not recognise).
       */
      status: "cannotCalculateChanges";
      errorType: string;
      error: JmapMethodError;
    };

/** Method-error types after which the only way forward is a refetch. */
const RESYNC_TYPES = new Set(["cannotCalculateChanges", "tooManyChanges", "invalidArguments"]);

function isResync(err: unknown): err is JmapMethodError {
  return err instanceof JmapMethodError && RESYNC_TYPES.has(err.type);
}

/** Objects of one type, with the state string they are at. */
export class ObjectStore<T extends { id: Id }> {
  readonly type: string;
  #state: string | null = null;
  #objects = new Map<Id, T>();

  constructor(type: string) {
    this.type = type;
  }

  /** The state of the data held; null when empty or cleared. */
  get state(): string | null {
    return this.#state;
  }

  get size(): number {
    return this.#objects.size;
  }

  get(id: Id): T | undefined {
    return this.#objects.get(id);
  }

  has(id: Id): boolean {
    return this.#objects.has(id);
  }

  values(): T[] {
    return [...this.#objects.values()];
  }

  ids(): Id[] {
    return [...this.#objects.keys()];
  }

  /** Replace everything with a full `/get` (ids: null). */
  reset(response: Pick<GetResponse<T>, "state" | "list">): void {
    this.#objects = new Map(response.list.map((o) => [o.id, o]));
    this.#state = response.state;
  }

  /**
   * Store objects from a `/get`. Merges each object over what is held (so a
   * `/get` of a few properties updates just those). Sets the state if the
   * store had none.
   */
  put(response: Pick<GetResponse<T>, "state" | "list" | "notFound">): void {
    for (const o of response.list) this.#objects.set(o.id, { ...this.#objects.get(o.id), ...o });
    for (const id of response.notFound ?? []) this.#objects.delete(id);
    this.#state ??= response.state;
  }

  /**
   * Apply a `/changes` result: drop destroyed objects and move to `newState`.
   * Returns the ids that need fetching (created, and updated ones held).
   * @throws JmapError if the changes do not start from this store's state.
   */
  applyChanges(changes: ChangesResponse): { fetch: Id[] } {
    if (this.#state !== null && changes.oldState !== this.#state) {
      throw new JmapError(`${this.type} changes start at ${changes.oldState}, the store is at ${this.#state}`);
    }
    for (const id of changes.destroyed) this.#objects.delete(id);
    this.#state = changes.newState;
    return { fetch: [...changes.created, ...changes.updated.filter((id) => this.#objects.has(id))] };
  }

  /** Forget everything (after cannotCalculateChanges). */
  clear(): void {
    this.#objects.clear();
    this.#state = null;
  }
}

/** One query's result window, from position 0, with its queryState. */
export class QueryStore {
  /** Identifies the query (filter + sort, serialised). */
  readonly key: string;
  #queryState: string | null = null;
  #ids: Id[] = [];
  #total: number | undefined;
  #canCalculateChanges = false;

  constructor(key: string) {
    this.key = key;
  }

  /** A stable key for a filter and sort, for keying stores. */
  static keyOf(args: { filter?: unknown; sort?: unknown; collapseThreads?: boolean }): string {
    return stableStringify({ filter: args.filter ?? null, sort: args.sort ?? null, collapseThreads: args.collapseThreads ?? false });
  }

  get queryState(): string | null {
    return this.#queryState;
  }

  /** The ids held, in order, from position 0. */
  get ids(): readonly Id[] {
    return this.#ids;
  }

  get total(): number | undefined {
    return this.#total;
  }

  get canCalculateChanges(): boolean {
    return this.#canCalculateChanges;
  }

  /** Store a `/query` result. Position 0 replaces; a later page appends when it starts at the end of what is held. */
  applyQuery(response: QueryResponse): void {
    if (response.position === 0 || response.queryState !== this.#queryState) {
      if (response.position !== 0) throw new JmapError("A query page from a new queryState must start at position 0");
      this.#ids = [...response.ids];
    } else if (response.position === this.#ids.length) {
      this.#ids.push(...response.ids);
    } else {
      throw new JmapError(`Query page at ${response.position} does not continue the ${this.#ids.length} ids held`);
    }
    this.#queryState = response.queryState;
    this.#canCalculateChanges = response.canCalculateChanges;
    if (response.total !== undefined) this.#total = response.total;
  }

  /**
   * Apply a `/queryChanges` result (RFC 8620 §5.6): remove `removed`, then
   * insert `added` in index order. Insertions past the end of the held window
   * are skipped. @throws JmapError if it does not start from this queryState.
   */
  applyQueryChanges(changes: QueryChangesResponse): void {
    if (changes.oldQueryState !== this.#queryState) {
      throw new JmapError(`Query changes start at ${changes.oldQueryState}, the store is at ${this.#queryState}`);
    }
    const removed = new Set(changes.removed);
    const ids = this.#ids.filter((id) => !removed.has(id));
    for (const { id, index } of [...changes.added].sort((a, b) => a.index - b.index)) {
      if (index <= ids.length) ids.splice(index, 0, id);
    }
    this.#ids = ids;
    this.#queryState = changes.newQueryState;
    if (changes.total !== undefined) this.#total = changes.total;
  }

  clear(): void {
    this.#ids = [];
    this.#queryState = null;
    this.#total = undefined;
  }
}

/** Object stores by type, and query stores by key, for one account. */
export class StateCache {
  readonly accountId: Id;
  readonly #objects = new Map<string, ObjectStore<{ id: Id }>>();
  readonly #queries = new Map<string, QueryStore>();

  constructor(accountId: Id) {
    this.accountId = accountId;
  }

  /** The store for a type, created on first use. */
  objects<T extends { id: Id }>(type: string): ObjectStore<T> {
    let store = this.#objects.get(type);
    if (!store) this.#objects.set(type, (store = new ObjectStore(type)));
    return store as unknown as ObjectStore<T>;
  }

  /** The store for a query key (see `QueryStore.keyOf`), created on first use. */
  query(key: string): QueryStore {
    let store = this.#queries.get(key);
    if (!store) this.#queries.set(key, (store = new QueryStore(key)));
    return store;
  }

  /**
   * The types a push StateChange says are newer than what is held. Types with
   * no store, or an empty one, are left out: there is nothing to update.
   */
  staleTypes(change: StateChange): string[] {
    const states = change.changed[this.accountId] ?? {};
    return Object.entries(states)
      .filter(([type, state]) => {
        const store = this.#objects.get(type);
        return store !== undefined && store.state !== null && store.state !== state;
      })
      .map(([type]) => type);
  }

  /** Forget everything (sign-out). */
  clear(): void {
    this.#objects.clear();
    this.#queries.clear();
  }
}

/** Types with standard /changes and /get methods. */
export type SyncableType =
  | "Mailbox"
  | "Thread"
  | "Email"
  | "Identity"
  | "EmailSubmission"
  | "Quota"
  | "AddressBook"
  | "ContactCard";

export interface SyncObjectsOptions {
  /** Properties to fetch for created and updated objects. */
  properties?: string[];
  /** Fetch created objects too (default true). Off for Email, where the list is driven by queries. */
  includeCreated?: boolean;
  /** Per /changes call (default 256); the loop continues while `hasMoreChanges`. */
  maxChanges?: number;
  signal?: AbortSignal;
}

/**
 * Bring an object store up to date: `/changes` from its state, then `/get`
 * for what changed, until `hasMoreChanges` is false. A store with no state is
 * loaded with a full `/get`.
 */
export async function syncObjects<T extends { id: Id }>(
  caller: MethodCaller,
  type: SyncableType,
  store: ObjectStore<T>,
  options: SyncObjectsOptions = {},
): Promise<SyncResult> {
  const getName = `${type}/get` as MethodName;
  const changesName = `${type}/changes` as MethodName;
  const properties = options.properties;

  if (store.state === null) {
    const res = (await caller.call(getName, { ids: null, properties } as CallArgs<MethodName>, options)) as unknown as GetResponse<T>;
    store.reset(res);
    return { status: "changed", state: res.state, created: res.list.map((o) => o.id), updated: [], destroyed: [] };
  }

  const created: Id[] = [];
  const updated: Id[] = [];
  const destroyed: Id[] = [];
  const start = store.state;
  for (;;) {
    let changes: ChangesResponse;
    try {
      changes = (await caller.call(
        changesName,
        { sinceState: store.state, maxChanges: options.maxChanges ?? 256 } as CallArgs<MethodName>,
        options,
      )) as unknown as ChangesResponse;
    } catch (err) {
      if (!isResync(err)) throw err;
      store.clear();
      return { status: "cannotCalculateChanges", errorType: err.type, error: err };
    }
    const wanted = new Set(store.applyChanges(changes).fetch);
    if (options.includeCreated === false) for (const id of changes.created) wanted.delete(id);
    if (wanted.size > 0) {
      const res = (await caller.call(getName, { ids: [...wanted], properties } as CallArgs<MethodName>, options)) as unknown as GetResponse<T>;
      store.put(res);
    }
    created.push(...changes.created);
    updated.push(...changes.updated);
    destroyed.push(...changes.destroyed);
    if (!changes.hasMoreChanges) break;
  }
  const state = store.state ?? start;
  if (state === start) return { status: "unchanged", state };
  return { status: "changed", state, created, updated, destroyed };
}

/** Query methods with a `/queryChanges` counterpart. */
export type QueryMethod = "Email/query" | "Mailbox/query" | "EmailSubmission/query" | "Quota/query" | "ContactCard/query";

/** A query's arguments for `syncQuery`: everything but the window, which the store manages. */
export type QuerySyncArgs<M extends QueryMethod> = Omit<CallArgs<M>, "position" | "anchor" | "anchorOffset" | "#position" | "#anchor" | "#anchorOffset">;

export type QuerySyncResult =
  | { status: "unchanged"; queryState: string }
  | { status: "changed"; queryState: string; removed: Id[]; added: { id: Id; index: number }[] }
  | { status: "cannotCalculateChanges"; errorType: string; error: JmapMethodError };

/**
 * Bring a query store up to date with `/queryChanges`, up to the last id held
 * (`upToId`). A store with no queryState runs the query (first page of `limit`).
 */
export async function syncQuery<M extends QueryMethod>(
  caller: MethodCaller,
  method: M,
  args: QuerySyncArgs<M>,
  store: QueryStore,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<QuerySyncResult> {
  const queryState = store.queryState;
  const { limit, ...rest } = args as { limit?: number | null } & Record<string, unknown>;
  if (queryState === null) {
    const query = { ...rest, position: 0, limit: options.limit ?? limit } as CallArgs<MethodName>;
    const res = (await caller.call(method, query, options)) as QueryResponse;
    store.applyQuery(res);
    return { status: "changed", queryState: res.queryState, removed: [], added: res.ids.map((id, index) => ({ id, index })) };
  }
  const changesMethod = method.replace("/query", "/queryChanges") as MethodName;
  const upToId = store.ids[store.ids.length - 1];
  let res: QueryChangesResponse;
  try {
    res = (await caller.call(changesMethod, { ...rest, sinceQueryState: queryState, upToId } as CallArgs<MethodName>, options)) as unknown as QueryChangesResponse;
  } catch (err) {
    if (!isResync(err)) throw err;
    store.clear();
    return { status: "cannotCalculateChanges", errorType: err.type, error: err };
  }
  store.applyQueryChanges(res);
  if (res.newQueryState === queryState) return { status: "unchanged", queryState };
  return { status: "changed", queryState: res.newQueryState, removed: res.removed, added: res.added };
}

/** JSON with sorted object keys, so equal filters give equal keys. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
