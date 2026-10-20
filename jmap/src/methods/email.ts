// Email (RFC 8621 §4) and SearchSnippet (§5).

import type { CallArgs } from "../request.js";
import type { ChangesResponse, GetResponse, Id, PatchObject, QueryChangesResponse, QueryResponse, SetResponse } from "../types/core.js";
import type { Email, EmailImportResponse, SearchSnippetGetResponse } from "../types/mail.js";
import type { CallOptions, ChangesOptions, MethodCaller } from "./caller.js";

/** The result of `queryAndGet`: the query's answer plus the messages, in query order. */
export interface QueryAndGetResult {
  query: QueryResponse;
  list: Email[];
  notFound: Id[];
}

/** Email methods. An Email is a message. */
export class EmailMethods {
  readonly #c: MethodCaller;
  constructor(caller: MethodCaller) {
    this.#c = caller;
  }

  /**
   * `Email/get`. Ask for body text with `fetchTextBodyValues` /
   * `fetchHTMLBodyValues` and cap it with `maxBodyValueBytes`.
   */
  get(args: CallArgs<"Email/get">, options?: CallOptions): Promise<GetResponse<Email>> {
    return this.#c.call("Email/get", args, options);
  }

  /** `Email/query`. `collapseThreads: true` gives one message per conversation. */
  query(args: CallArgs<"Email/query">, options?: CallOptions): Promise<QueryResponse> {
    return this.#c.call("Email/query", args, options);
  }

  /** `Email/changes`. */
  changes(sinceState: string, options: ChangesOptions = {}): Promise<ChangesResponse> {
    return this.#c.call("Email/changes", { sinceState, maxChanges: options.maxChanges }, options);
  }

  /** `Email/queryChanges`: keep a list in sync without re-running the query. */
  queryChanges(args: CallArgs<"Email/queryChanges">, options?: CallOptions): Promise<QueryChangesResponse> {
    return this.#c.call("Email/queryChanges", args, options);
  }

  /** `Email/set`: drafts, keywords, mailboxIds, destroy. */
  set(args: CallArgs<"Email/set">, options?: CallOptions): Promise<SetResponse<Email>> {
    return this.#c.call("Email/set", args, options);
  }

  /** `Email/import`: add uploaded RFC 5322 blobs as messages. */
  import(args: CallArgs<"Email/import">, options?: CallOptions): Promise<EmailImportResponse> {
    return this.#c.call("Email/import", args, options);
  }

  /**
   * Set or clear keywords on messages in one `Email/set`, as patches:
   * `setKeywords(ids, { $flagged: true })` stars, `{ $seen: false }` marks
   * unread. Inspect `notUpdated` for per-message failures.
   */
  setKeywords(ids: readonly Id[], keywords: Record<string, boolean>, options?: CallOptions): Promise<SetResponse<Email>> {
    const patch: PatchObject = {};
    for (const [keyword, on] of Object.entries(keywords)) patch[`keywords/${escapePointer(keyword)}`] = on ? true : null;
    const update: Record<Id, PatchObject> = {};
    for (const id of ids) update[id] = patch;
    return this.set({ update }, options);
  }

  /**
   * `Email/query` and `Email/get` in one round trip (a back-reference on
   * `/ids`). The list comes back in query order.
   */
  async queryAndGet(
    query: CallArgs<"Email/query">,
    get: Omit<CallArgs<"Email/get">, "ids" | "#ids"> = {},
    options?: CallOptions,
  ): Promise<QueryAndGetResult> {
    const r = this.#c.request();
    const q = r.call("Email/query", query);
    const g = r.call("Email/get", { ...get, ids: q.ref("/ids") });
    const res = await r.send(options);
    const queryRes = res.get(q);
    const got = res.get(g);
    const byId = new Map(got.list.map((e) => [e.id, e]));
    const list = queryRes.ids.map((id) => byId.get(id)).filter((e): e is Email => e !== undefined);
    return { query: queryRes, list, notFound: got.notFound ?? [] };
  }
}

/** SearchSnippet: highlighted subject and preview for search hits. */
export class SearchSnippetMethods {
  readonly #c: MethodCaller;
  constructor(caller: MethodCaller) {
    this.#c = caller;
  }

  /** `SearchSnippet/get`. Pass the same filter as the query. `subject`/`preview` are HTML with `<mark>`. */
  get(args: CallArgs<"SearchSnippet/get">, options?: CallOptions): Promise<SearchSnippetGetResponse> {
    return this.#c.call("SearchSnippet/get", args, options);
  }
}

/** Escape a JSON Pointer segment (RFC 6901): `~` → `~0`, `/` → `~1`. */
export function escapePointer(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
