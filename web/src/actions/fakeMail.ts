// A small in-memory JMAP mail server for unit tests, behind a real JmapClient
// (so back-references, /set splitting and errors go through the real code).
// Test-only: nothing in the app imports it.
//
//   const mail = new FakeMail({ mailboxes, emails });
//   const client = await mail.connect();
//   mail.posts            every API request sent, for counting round trips
//   mail.failWith = ...   make a call fail (network, method error, refusals)
//
// It implements just what the list and the actions use: Email/query (with
// collapseThreads, inMailbox, inMailboxOtherThan, hasKeyword, notKeyword,
// AND/OR/NOT), Email/get, Email/set (patches, destroy), Email/changes,
// Email/queryChanges, Thread/get, Mailbox/get, Mailbox/set, SearchSnippet/get.

import { JmapClient, type EmailAddress, type Id, type SessionObject } from "@postern/jmap";

export interface FakeEmail {
  id: Id;
  threadId: Id;
  mailboxIds: Record<Id, true>;
  keywords: Record<string, true>;
  receivedAt: string;
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  subject: string;
  preview: string;
  hasAttachment: boolean;
}

export interface FakeMailbox {
  id: Id;
  name: string;
  role: string | null;
  parentId: Id | null;
}

type Args = Record<string, unknown>;
type Invocation = [string, Args, string];

/** A call's override: return a response tuple, "network" to fail the whole request, or undefined to run normally. */
export type FakeFailure = (name: string, args: Args) => [string, Args] | "network" | undefined;

const ACCOUNT = "A";

function session(maxObjectsInSet: number, maxObjectsInGet: number): SessionObject {
  return {
    capabilities: {
      "urn:ietf:params:jmap:core": {
        maxSizeUpload: 50_000_000,
        maxConcurrentUpload: 4,
        maxSizeRequest: 10_000_000,
        maxConcurrentRequests: 4,
        maxCallsInRequest: 16,
        maxObjectsInGet,
        maxObjectsInSet,
        collationAlgorithms: [],
      },
      "urn:ietf:params:jmap:mail": {},
    },
    accounts: { [ACCOUNT]: { name: "alice@postern.test", isPersonal: true, isReadOnly: false, accountCapabilities: { "urn:ietf:params:jmap:mail": {} } } },
    primaryAccounts: { "urn:ietf:params:jmap:mail": ACCOUNT, "urn:ietf:params:jmap:core": ACCOUNT },
    username: "alice@postern.test",
    apiUrl: "http://fake/jmap/",
    downloadUrl: "http://fake/download/{accountId}/{blobId}/{name}?accept={type}",
    uploadUrl: "http://fake/upload/{accountId}/",
    eventSourceUrl: "http://fake/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
    state: "session-0",
  } as unknown as SessionObject;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** RFC 8620 §3.7 result-reference paths, with `*` over arrays. */
function evaluatePointer(value: unknown, path: string): unknown {
  const parts = path.split("/").slice(1).map(unescapePointer);
  const walk = (v: unknown, i: number): unknown => {
    if (i === parts.length) return v;
    const key = parts[i] as string;
    if (key === "*") {
      if (!Array.isArray(v)) throw new Error(`* on a non-array at ${path}`);
      return v.flatMap((item) => {
        const r = walk(item, i + 1);
        return Array.isArray(r) ? r : [r];
      });
    }
    if (v === null || typeof v !== "object") throw new Error(`bad path ${path}`);
    return walk((v as Record<string, unknown>)[key], i + 1);
  };
  return walk(value, 0);
}

export class FakeMail {
  mailboxes: FakeMailbox[];
  emails = new Map<Id, FakeEmail>();
  /** Every API request: its method calls. */
  readonly posts: Invocation[][] = [];
  failWith: FakeFailure | null = null;
  readonly maxObjectsInSet: number;
  readonly maxObjectsInGet: number;

  #state = 0;
  #history = new Map<number, Map<Id, FakeEmail>>();
  #log: { state: number; created: Id[]; updated: Id[]; destroyed: Id[] }[] = [];
  #mailboxState = 0;
  #nextId = 1;

  constructor(options: { mailboxes: FakeMailbox[]; emails: FakeEmail[]; maxObjectsInSet?: number; maxObjectsInGet?: number }) {
    this.mailboxes = clone(options.mailboxes);
    for (const e of options.emails) this.emails.set(e.id, clone(e));
    this.maxObjectsInSet = options.maxObjectsInSet ?? 500;
    this.maxObjectsInGet = options.maxObjectsInGet ?? 500;
    this.#snapshot();
  }

  get state(): string {
    return `s${this.#state}`;
  }

  /** A connected client on this server. */
  async connect(): Promise<JmapClient> {
    const client = new JmapClient({ baseUrl: "http://fake", auth: { authorization: () => "Basic test" }, fetch: this.fetch });
    await client.connect();
    return client;
  }

  /** Method names of every call sent, request by request. */
  calls(): string[][] {
    return this.posts.map((p) => p.map((c) => c[0]));
  }

  /** Change emails as another client would (new mail, another tab): bumps the state. */
  mutate(fn: (emails: Map<Id, FakeEmail>) => { created?: Id[]; updated?: Id[]; destroyed?: Id[] }): void {
    const change = fn(this.emails);
    this.#commit(change.created ?? [], change.updated ?? [], change.destroyed ?? []);
  }

  readonly fetch = async (input: unknown, init: { method?: string; body?: unknown } = {}): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/jmap/session")) return Response.json(session(this.maxObjectsInSet, this.maxObjectsInGet));
    if ((init.method ?? "GET") !== "POST") throw new Error(`FakeMail: unexpected ${url}`);
    const body = JSON.parse(String(init.body)) as { methodCalls: Invocation[] };
    this.posts.push(clone(body.methodCalls));
    const responses: Invocation[] = [];
    for (const [name, rawArgs, id] of body.methodCalls) {
      let args: Args;
      try {
        args = this.#resolve(rawArgs, responses);
      } catch (err) {
        responses.push(["error", { type: "invalidResultReference", description: String(err) }, id]);
        continue;
      }
      const failure = this.failWith?.(name, args);
      if (failure === "network") throw new TypeError("fetch failed");
      if (failure) {
        responses.push([failure[0], failure[1], id]);
        continue;
      }
      try {
        responses.push([name, this.#call(name, args), id]);
      } catch (err) {
        const type = err instanceof MethodError ? err.type : "serverFail";
        responses.push(["error", { type, description: String(err) }, id]);
      }
    }
    return Response.json({ methodResponses: responses, sessionState: "session-0" });
  };

  #resolve(args: Args, responses: Invocation[]): Args {
    const out: Args = {};
    for (const [key, value] of Object.entries(args)) {
      if (!key.startsWith("#")) {
        out[key] = value;
        continue;
      }
      const ref = value as { resultOf: string; name: string; path: string };
      const target = responses.find((r) => r[2] === ref.resultOf);
      if (!target || target[0] !== ref.name) throw new Error(`no ${ref.name} result for ${ref.resultOf}`);
      out[key.slice(1)] = evaluatePointer(target[1], ref.path);
    }
    return out;
  }

  #call(name: string, args: Args): Args {
    switch (name) {
      case "Email/query":
        return this.#query(args);
      case "Email/queryChanges":
        return this.#queryChanges(args);
      case "Email/get":
        return this.#emailGet(args);
      case "Email/set":
        return this.#emailSet(args);
      case "Email/changes":
        return this.#emailChanges(args);
      case "Thread/get":
        return this.#threadGet(args);
      case "Mailbox/get":
        return { accountId: ACCOUNT, state: `m${this.#mailboxState}`, list: clone(this.mailboxes), notFound: [] };
      case "Mailbox/set":
        return this.#mailboxSet(args);
      case "SearchSnippet/get":
        return {
          accountId: ACCOUNT,
          list: ((args["emailIds"] as Id[]) ?? []).map((id) => ({ emailId: id, subject: `<mark>${this.emails.get(id)?.subject ?? ""}</mark>`, preview: null })),
          notFound: null,
        };
      default:
        throw new MethodError("unknownMethod");
    }
  }

  // ---- Email/query -------------------------------------------------------

  #matches(e: FakeEmail, filter: unknown): boolean {
    if (!filter) return true;
    const f = filter as Record<string, unknown>;
    if (typeof f["operator"] === "string") {
      const conditions = f["conditions"] as unknown[];
      if (f["operator"] === "AND") return conditions.every((c) => this.#matches(e, c));
      if (f["operator"] === "OR") return conditions.some((c) => this.#matches(e, c));
      return !conditions.some((c) => this.#matches(e, c));
    }
    if (typeof f["inMailbox"] === "string" && !e.mailboxIds[f["inMailbox"]]) return false;
    if (Array.isArray(f["inMailboxOtherThan"])) {
      const not = new Set(f["inMailboxOtherThan"] as Id[]);
      if (!Object.keys(e.mailboxIds).some((id) => !not.has(id))) return false;
    }
    if (typeof f["hasKeyword"] === "string" && !e.keywords[f["hasKeyword"]]) return false;
    if (typeof f["notKeyword"] === "string" && e.keywords[f["notKeyword"]]) return false;
    if (typeof f["subject"] === "string" && !e.subject.toLowerCase().includes(f["subject"].toLowerCase())) return false;
    return true;
  }

  #results(emails: Map<Id, FakeEmail>, args: Args): Id[] {
    const sort = (args["sort"] as { property: string; isAscending?: boolean }[] | undefined)?.[0];
    const ascending = sort?.isAscending ?? false;
    const list = [...emails.values()]
      .filter((e) => this.#matches(e, args["filter"]))
      .sort((a, b) => (a.receivedAt === b.receivedAt ? (a.id < b.id ? 1 : -1) : (a.receivedAt < b.receivedAt ? -1 : 1) * (ascending ? 1 : -1)));
    if (!args["collapseThreads"]) return list.map((e) => e.id);
    const seen = new Set<Id>();
    return list.filter((e) => (seen.has(e.threadId) ? false : (seen.add(e.threadId), true))).map((e) => e.id);
  }

  #query(args: Args): Args {
    const ids = this.#results(this.emails, args);
    const position = (args["position"] as number | undefined) ?? 0;
    const limit = (args["limit"] as number | undefined) ?? ids.length;
    return {
      accountId: ACCOUNT,
      queryState: this.state,
      canCalculateChanges: true,
      position,
      ids: ids.slice(position, position + limit),
      total: ids.length,
    };
  }

  #queryChanges(args: Args): Args {
    const since = Number(String(args["sinceQueryState"]).slice(1));
    const before = this.#history.get(since);
    if (!before) throw new MethodError("cannotCalculateChanges");
    const old = this.#results(before, args);
    const now = this.#results(this.emails, args);
    const oldSet = new Set(old);
    const nowSet = new Set(now);
    return {
      accountId: ACCOUNT,
      oldQueryState: String(args["sinceQueryState"]),
      newQueryState: this.state,
      total: now.length,
      removed: old.filter((id) => !nowSet.has(id)),
      added: now.flatMap((id, index) => (oldSet.has(id) ? [] : [{ id, index }])),
    };
  }

  // ---- Email/get, Thread/get ------------------------------------------

  #emailGet(args: Args): Args {
    const ids = (args["ids"] as Id[] | null | undefined) ?? [...this.emails.keys()];
    if (ids.length > this.maxObjectsInGet) throw new MethodError("requestTooLarge");
    const properties = args["properties"] as string[] | undefined;
    const list: Args[] = [];
    const notFound: Id[] = [];
    for (const id of ids) {
      const e = this.emails.get(id);
      if (!e) {
        notFound.push(id);
        continue;
      }
      const all = clone(e) as unknown as Args;
      list.push(properties ? Object.fromEntries([["id", e.id], ...properties.map((p) => [p, all[p]])]) : all);
    }
    return { accountId: ACCOUNT, state: this.state, list, notFound };
  }

  #threadGet(args: Args): Args {
    const ids = [...new Set((args["ids"] as Id[]) ?? [])];
    if (ids.length > this.maxObjectsInGet) throw new MethodError("requestTooLarge");
    const list = ids.flatMap((id) => {
      const emails = [...this.emails.values()].filter((e) => e.threadId === id).sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1));
      return emails.length ? [{ id, emailIds: emails.map((e) => e.id) }] : [];
    });
    return { accountId: ACCOUNT, state: this.state, list, notFound: ids.filter((id) => !list.some((t) => t.id === id)) };
  }

  // ---- Email/set, Email/changes ------------------------------------------

  #emailSet(args: Args): Args {
    const update = (args["update"] as Record<Id, Record<string, unknown>> | undefined) ?? {};
    const destroy = (args["destroy"] as Id[] | undefined) ?? [];
    if (Object.keys(update).length + destroy.length > this.maxObjectsInSet) throw new MethodError("requestTooLarge");
    const oldState = this.state;
    const updated: Record<Id, null> = {};
    const notUpdated: Record<Id, Args> = {};
    for (const [id, patch] of Object.entries(update)) {
      const e = this.emails.get(id);
      if (!e) {
        notUpdated[id] = { type: "notFound" };
        continue;
      }
      const next = clone(e);
      for (const [path, value] of Object.entries(patch)) {
        if (path === "mailboxIds") next.mailboxIds = clone(value as Record<Id, true>);
        else if (path === "keywords") next.keywords = clone(value as Record<string, true>);
        else {
          const [prop, key] = [path.slice(0, path.indexOf("/")), unescapePointer(path.slice(path.indexOf("/") + 1))];
          const target = prop === "mailboxIds" ? next.mailboxIds : prop === "keywords" ? next.keywords : null;
          if (!target) {
            notUpdated[id] = { type: "invalidProperties", properties: [path] };
            break;
          }
          if (value === true) target[key] = true;
          else if (value === null) delete target[key];
          else notUpdated[id] = { type: "invalidPatch" };
        }
      }
      if (notUpdated[id]) continue;
      if (Object.keys(next.mailboxIds).length === 0) {
        notUpdated[id] = { type: "invalidProperties", properties: ["mailboxIds"] };
        continue;
      }
      if (next.mailboxIds && Object.keys(next.mailboxIds).some((m) => !this.mailboxes.some((b) => b.id === m))) {
        notUpdated[id] = { type: "invalidProperties", properties: ["mailboxIds"] };
        continue;
      }
      this.emails.set(id, next);
      updated[id] = null;
    }
    const destroyed: Id[] = [];
    const notDestroyed: Record<Id, Args> = {};
    for (const id of destroy) {
      if (this.emails.delete(id)) destroyed.push(id);
      else notDestroyed[id] = { type: "notFound" };
    }
    if (Object.keys(updated).length || destroyed.length) this.#commit([], Object.keys(updated), destroyed);
    return {
      accountId: ACCOUNT,
      oldState,
      newState: this.state,
      created: null,
      updated: Object.keys(updated).length ? updated : null,
      destroyed: destroyed.length ? destroyed : null,
      notCreated: null,
      notUpdated: Object.keys(notUpdated).length ? notUpdated : null,
      notDestroyed: Object.keys(notDestroyed).length ? notDestroyed : null,
    };
  }

  #emailChanges(args: Args): Args {
    const since = Number(String(args["sinceState"]).slice(1));
    if (!this.#history.has(since)) throw new MethodError("cannotCalculateChanges");
    const created = new Set<Id>();
    const updated = new Set<Id>();
    const destroyed = new Set<Id>();
    for (const entry of this.#log.filter((l) => l.state > since)) {
      for (const id of entry.created) created.add(id);
      for (const id of entry.updated) if (!created.has(id)) updated.add(id);
      for (const id of entry.destroyed) {
        if (created.delete(id)) continue;
        updated.delete(id);
        destroyed.add(id);
      }
    }
    return {
      accountId: ACCOUNT,
      oldState: String(args["sinceState"]),
      newState: this.state,
      hasMoreChanges: false,
      created: [...created],
      updated: [...updated],
      destroyed: [...destroyed],
    };
  }

  /** Forget the change history, so the next /changes from an old state cannot be calculated. */
  forgetHistory(): void {
    for (const key of [...this.#history.keys()]) if (key !== this.#state) this.#history.delete(key);
  }

  // ---- Mailbox/set -------------------------------------------------------

  #mailboxSet(args: Args): Args {
    const create = (args["create"] as Record<Id, Partial<FakeMailbox>> | undefined) ?? {};
    const update = (args["update"] as Record<Id, Partial<FakeMailbox>> | undefined) ?? {};
    const created: Record<Id, Args> = {};
    const notCreated: Record<Id, Args> = {};
    for (const [key, m] of Object.entries(create)) {
      if (this.mailboxes.some((b) => b.parentId === (m.parentId ?? null) && b.name === m.name)) {
        notCreated[key] = { type: "alreadyExists" };
        continue;
      }
      const id = `mb${this.#nextId++}`;
      this.mailboxes.push({ id, name: m.name ?? "", role: m.role ?? null, parentId: m.parentId ?? null });
      created[key] = { id };
    }
    const updated: Record<Id, null> = {};
    for (const [id, patch] of Object.entries(update)) {
      const m = this.mailboxes.find((b) => b.id === id);
      if (m) {
        Object.assign(m, patch);
        updated[id] = null;
      }
    }
    this.#mailboxState++;
    return {
      accountId: ACCOUNT,
      oldState: `m${this.#mailboxState - 1}`,
      newState: `m${this.#mailboxState}`,
      created: Object.keys(created).length ? created : null,
      updated: Object.keys(updated).length ? updated : null,
      destroyed: null,
      notCreated: Object.keys(notCreated).length ? notCreated : null,
      notUpdated: null,
      notDestroyed: null,
    };
  }

  #commit(created: Id[], updated: Id[], destroyed: Id[]): void {
    this.#state++;
    this.#log.push({ state: this.#state, created, updated, destroyed });
    this.#snapshot();
  }

  #snapshot(): void {
    this.#history.set(this.#state, new Map([...this.emails].map(([id, e]) => [id, clone(e)])));
  }
}

class MethodError extends Error {
  readonly type: string;
  constructor(type: string) {
    super(type);
    this.type = type;
  }
}

// ---- Building test mail -------------------------------------------------

/** The dev account's labels, ids as on the dev Stalwart. */
export const MAILBOXES: FakeMailbox[] = [
  { id: "a", name: "Inbox", role: "inbox", parentId: null },
  { id: "b", name: "Deleted Items", role: "trash", parentId: null },
  { id: "c", name: "Junk Mail", role: "junk", parentId: null },
  { id: "d", name: "Drafts", role: "drafts", parentId: null },
  { id: "e", name: "Sent Items", role: "sent", parentId: null },
  { id: "h", name: "Archive", role: "archive", parentId: null },
  { id: "i", name: "Work", role: null, parentId: null },
];

export const ROLES = { inbox: "a", trash: "b", junk: "c", drafts: "d", sent: "e", archive: "h" } as const;

let counter = 0;

/** A message, with defaults: in the Inbox, unread, from Bob, received at `day` (ISO day) noon UTC. */
export function fakeEmail(partial: Partial<FakeEmail> & { id: Id; threadId: Id }): FakeEmail {
  counter++;
  return {
    mailboxIds: { a: true },
    keywords: {},
    receivedAt: `2026-10-01T12:00:${String(counter % 60).padStart(2, "0")}Z`,
    from: [{ name: "Bob Baker", email: "bob@postern.test" }],
    to: [{ name: "Alice Archer", email: "alice@postern.test" }],
    subject: `Subject ${partial.id}`,
    preview: `Preview of ${partial.id}`,
    hasAttachment: false,
    ...partial,
  };
}

/** `count` one-message conversations in the Inbox, newest first by id order (t0 newest). */
export function inboxThreads(count: number, start = 0): FakeEmail[] {
  return Array.from({ length: count }, (_, i) => {
    const n = start + i;
    const ts = new Date(Date.UTC(2026, 9, 1) - n * 60_000).toISOString();
    return fakeEmail({ id: `m${n}`, threadId: `t${n}`, receivedAt: ts });
  });
}
