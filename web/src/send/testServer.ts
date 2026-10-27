// A small in-memory JMAP server for the composer's tests, behind a real
// JmapClient. Test-only: nothing in the app imports it.
//
// It does what drafts and sending need: Identity/get, Email/get, Email/set
// (create, update by patch, destroy), EmailSubmission/set (with
// onSuccessUpdateEmail on create, as Stalwart; an update cancels), Thread/get,
// Mailbox/query by role, Email/query by mailbox or keyword,
// EmailSubmission/query and /get, blob upload and download. `calls` records
// every method call. With `maxDelayedSend` it advertises FUTURERELEASE and
// holds a submission with HOLDUNTIL until `release(id)` (brief 23).

import { JmapClient, type Id, type SessionObject } from "@postern/jmap";

type Args = Record<string, unknown>;
type Invocation = [string, Args, string];

export interface StoredEmail {
  id: Id;
  threadId: Id;
  mailboxIds: Record<Id, true>;
  keywords: Record<string, true>;
  [property: string]: unknown;
}

export const MAILBOXES = { inbox: "a", trash: "b", junk: "c", drafts: "d", sent: "e" } as const;

const ACCOUNT = "A";

function session(maxDelayedSend: number): SessionObject {
  const submission = maxDelayedSend > 0 ? { maxDelayedSend, submissionExtensions: { FUTURERELEASE: [] } } : {};
  return {
    capabilities: {
      "urn:ietf:params:jmap:core": {
        maxSizeUpload: 1000,
        maxConcurrentUpload: 4,
        maxSizeRequest: 10_000_000,
        maxConcurrentRequests: 4,
        maxCallsInRequest: 16,
        maxObjectsInGet: 500,
        maxObjectsInSet: 500,
        collationAlgorithms: [],
      },
      "urn:ietf:params:jmap:mail": {},
      "urn:ietf:params:jmap:submission": {},
    },
    accounts: { [ACCOUNT]: { name: "alice@postern.test", isPersonal: true, isReadOnly: false, accountCapabilities: { "urn:ietf:params:jmap:mail": {}, "urn:ietf:params:jmap:submission": submission } } },
    primaryAccounts: { "urn:ietf:params:jmap:mail": ACCOUNT, "urn:ietf:params:jmap:core": ACCOUNT, "urn:ietf:params:jmap:submission": ACCOUNT },
    username: "alice@postern.test",
    apiUrl: "http://fake/jmap/",
    downloadUrl: "http://fake/download/{accountId}/{blobId}/{name}?accept={type}",
    uploadUrl: "http://fake/upload/{accountId}/",
    eventSourceUrl: "http://fake/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
    state: "session-0",
  } as unknown as SessionObject;
}

function applyPatch(target: StoredEmail, patch: Record<string, unknown>): void {
  for (const [path, value] of Object.entries(patch)) {
    const parts = path.split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (parts.length === 1) {
      (target as Record<string, unknown>)[parts[0] as string] = value;
      continue;
    }
    const [head, key] = parts as [string, string];
    const obj = ((target as Record<string, unknown>)[head] ??= {}) as Record<string, unknown>;
    if (value === null) delete obj[key];
    else obj[key] = value;
  }
}

/** A submission as the server keeps it. */
export interface StoredSubmission {
  id: Id;
  emailId: Id;
  threadId: Id;
  sendAt: string;
  undoStatus: "pending" | "final" | "canceled";
}

export class ComposeTestServer {
  readonly emails = new Map<Id, StoredEmail>();
  readonly blobs = new Map<Id, { type: string; bytes: Uint8Array }>();
  readonly calls: Invocation[] = [];
  readonly submissions: Args[] = [];
  /** Every submission, by id. One without HOLDUNTIL is final at once. */
  readonly held = new Map<Id, StoredSubmission>();
  readonly #maxDelayedSend: number;

  constructor(options: { maxDelayedSend?: number } = {}) {
    this.#maxDelayedSend = options.maxDelayedSend ?? 0;
  }

  /** The held message goes out: its submission is final. */
  release(id: Id): void {
    const sub = this.held.get(id);
    if (sub?.undoStatus === "pending") sub.undoStatus = "final";
  }
  identities: Args[] = [{ id: "I1", name: "Alice Archer", email: "alice@postern.test", replyTo: null, bcc: null, textSignature: "", htmlSignature: "", mayDelete: false }];
  /** Make a call answer this instead (a method error or a refusal). */
  failWith: ((name: string, args: Args) => [string, Args] | "network" | undefined) | null = null;
  #next = 1;

  add(email: Partial<StoredEmail> & { id: Id }): void {
    this.emails.set(email.id, { threadId: `T-${email.id}`, mailboxIds: { [MAILBOXES.inbox]: true }, keywords: {}, ...email });
  }

  names(): string[] {
    return this.calls.map((c) => c[0]);
  }

  async connect(): Promise<JmapClient> {
    const client = new JmapClient({ baseUrl: "http://fake", auth: { authorization: () => "Basic test" }, fetch: this.fetch });
    await client.connect();
    return client;
  }

  readonly fetch = async (input: unknown, init: { method?: string; body?: unknown } = {}): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/jmap/session")) return Response.json(session(this.#maxDelayedSend));
    if (url.startsWith("http://fake/download/")) {
      const blobId = decodeURIComponent(url.split("/")[5] ?? "");
      const blob = this.blobs.get(blobId);
      return blob ? new Response(blob.bytes.slice().buffer, { headers: { "content-type": blob.type } }) : new Response("not found", { status: 404 });
    }
    const body = JSON.parse(String(init.body)) as { methodCalls: Invocation[] };
    const responses: Invocation[] = [];
    for (const [name, rawArgs, id] of body.methodCalls) {
      const args = this.#resolve(rawArgs, responses);
      this.calls.push([name, args, id]);
      const failure = this.failWith?.(name, args);
      if (failure === "network") throw new TypeError("fetch failed");
      if (failure) {
        responses.push([failure[0], failure[1], id]);
        continue;
      }
      for (const r of this.#call(name, args)) responses.push([r[0], r[1], id]);
    }
    return Response.json({ methodResponses: responses, sessionState: "session-0" });
  };

  /** Store an upload (tests call it from a fake transport). */
  upload(bytes: Uint8Array, type: string): Id {
    const blobId = `B${this.#next++}`;
    this.blobs.set(blobId, { type, bytes });
    return blobId;
  }

  #resolve(args: Args, responses: Invocation[]): Args {
    const out: Args = {};
    for (const [key, value] of Object.entries(args)) {
      if (!key.startsWith("#")) {
        out[key] = value;
        continue;
      }
      const ref = value as { resultOf: string; path: string };
      const target = responses.find((r) => r[2] === ref.resultOf);
      const parts = ref.path.split("/").slice(1);
      const walk = (v: unknown, i: number): unknown => {
        if (i === parts.length) return v;
        const k = parts[i] as string;
        if (k === "*") return (v as unknown[]).flatMap((item) => [walk(item, i + 1)].flat());
        return walk((v as Record<string, unknown>)[k], i + 1);
      };
      out[key.slice(1)] = walk(target?.[1], 0);
    }
    return out;
  }

  #call(name: string, args: Args): [string, Args][] {
    switch (name) {
      case "Mailbox/get": {
        const list = Object.entries(MAILBOXES).map(([role, id], i) => ({
          id,
          name: role[0]!.toUpperCase() + role.slice(1),
          parentId: null,
          role,
          sortOrder: i,
          totalEmails: [...this.emails.values()].filter((e) => e.mailboxIds[id]).length,
          unreadEmails: 0,
          totalThreads: 0,
          unreadThreads: 0,
          myRights: { mayReadItems: true, mayAddItems: true, mayRemoveItems: true, maySetSeen: true, maySetKeywords: true, mayCreateChild: true, mayRename: true, mayDelete: true, maySubmit: true },
          isSubscribed: true,
        }));
        return [[name, { accountId: ACCOUNT, state: "m1", list, notFound: [] }]];
      }
      case "Mailbox/changes":
        return [[name, { accountId: ACCOUNT, oldState: args["sinceState"], newState: "m1", hasMoreChanges: false, created: [], updated: [], destroyed: [], updatedProperties: null }]];
      case "Identity/get":
        return [[name, { accountId: ACCOUNT, state: "i1", list: this.identities, notFound: [] }]];
      case "Mailbox/query": {
        const role = (args["filter"] as { role?: string } | undefined)?.role as keyof typeof MAILBOXES | undefined;
        return [[name, { accountId: ACCOUNT, ids: role && MAILBOXES[role] ? [MAILBOXES[role]] : [], position: 0, queryState: "q", canCalculateChanges: false }]];
      }
      case "Email/query": {
        const filter = args["filter"] as { inMailbox?: Id; hasKeyword?: string; notKeyword?: string } | undefined;
        const ids = [...this.emails.values()]
          .filter((e) => !filter?.inMailbox || e.mailboxIds[filter.inMailbox])
          .filter((e) => !filter?.hasKeyword || e.keywords[filter.hasKeyword])
          .filter((e) => !filter?.notKeyword || !e.keywords[filter.notKeyword])
          .map((e) => e.id);
        return [[name, { accountId: ACCOUNT, ids, position: 0, queryState: "q", canCalculateChanges: false }]];
      }
      case "Email/get": {
        const ids = (args["ids"] as Id[] | null) ?? [...this.emails.keys()];
        const list = ids.map((id) => this.emails.get(id)).filter((e): e is StoredEmail => !!e).map((e) => structuredClone(e));
        return [[name, { accountId: ACCOUNT, state: "e1", list, notFound: ids.filter((id) => !this.emails.has(id)) }]];
      }
      case "Thread/get": {
        const ids = (args["ids"] as Id[]) ?? [];
        const list = ids.map((id) => ({ id, emailIds: [...this.emails.values()].filter((e) => e.threadId === id).map((e) => e.id) }));
        return [[name, { accountId: ACCOUNT, state: "t1", list, notFound: [] }]];
      }
      case "Email/set":
        return [[name, this.#emailSet(args)]];
      case "EmailSubmission/set": {
        const create = (args["create"] as Record<string, Args>) ?? {};
        const created: Record<string, Args> = {};
        const notCreated: Record<string, Args> = {};
        const out: [string, Args][] = [];
        const updates: Record<Id, Record<string, unknown>> = {};
        for (const [key, sub] of Object.entries(create)) {
          const email = this.emails.get(sub["emailId"] as Id);
          if (!email) {
            notCreated[key] = { type: "invalidProperties", properties: ["emailId"] };
            continue;
          }
          if ("sendAt" in sub) {
            notCreated[key] = { type: "invalidProperties", description: "Field could not be set.", properties: ["sendAt"] };
            continue;
          }
          const hold = (sub["envelope"] as { mailFrom?: { parameters?: Record<string, string> | null } } | undefined)?.mailFrom?.parameters?.["HOLDUNTIL"];
          if (hold && this.#maxDelayedSend === 0) {
            notCreated[key] = { type: "invalidEmail", description: "FUTURERELEASE is not supported" };
            continue;
          }
          this.submissions.push(sub);
          const id = `S${this.#next++}`;
          const sendAt = hold ?? "2026-10-27T12:00:00Z";
          this.held.set(id, { id, emailId: email.id, threadId: email.threadId, sendAt, undoStatus: hold ? "pending" : "final" });
          created[key] = { id, sendAt, undoStatus: "pending" };
          const patch = (args["onSuccessUpdateEmail"] as Record<string, Record<string, unknown>> | undefined)?.[`#${key}`];
          if (patch) updates[email.id] = patch;
        }
        const updated: Record<Id, null> = {};
        const notUpdated: Record<Id, Args> = {};
        for (const [id, patch] of Object.entries((args["update"] as Record<Id, Args>) ?? {})) {
          const sub = this.held.get(id);
          if (!sub) notUpdated[id] = { type: "notFound" };
          else if (patch["undoStatus"] === "canceled" && sub.undoStatus === "pending") {
            sub.undoStatus = "canceled";
            updated[id] = null;
          } else notUpdated[id] = { type: "cannotUnsend", description: "The requested message is no longer in the queue." };
        }
        out.push([
          name,
          {
            accountId: ACCOUNT,
            oldState: "s0",
            newState: "s1",
            created: Object.keys(created).length ? created : null,
            notCreated: Object.keys(notCreated).length ? notCreated : null,
            updated: Object.keys(updated).length ? updated : null,
            notUpdated: Object.keys(notUpdated).length ? notUpdated : null,
          },
        ]);
        if (Object.keys(updates).length) out.push(["Email/set", this.#emailSet({ update: updates })]);
        return out;
      }
      case "EmailSubmission/query": {
        const filter = args["filter"] as { emailIds?: Id[]; undoStatus?: string } | undefined;
        const ids = [...this.held.values()]
          .filter((s) => !filter?.emailIds || filter.emailIds.includes(s.emailId))
          .filter((s) => !filter?.undoStatus || s.undoStatus === filter.undoStatus)
          .map((s) => s.id);
        return [[name, { accountId: ACCOUNT, ids, position: 0, queryState: "sq", canCalculateChanges: false }]];
      }
      case "EmailSubmission/get": {
        const ids = (args["ids"] as Id[] | null) ?? [...this.held.keys()];
        const list = ids.map((id) => this.held.get(id)).filter((s): s is StoredSubmission => !!s).map((s) => ({ ...s }));
        return [[name, { accountId: ACCOUNT, state: "s1", list, notFound: ids.filter((id) => !this.held.has(id)) }]];
      }
      default:
        return [["error", { type: "unknownMethod" }]];
    }
  }

  #emailSet(args: Args): Args {
    const created: Record<string, Args> = {};
    const notCreated: Record<string, Args> = {};
    for (const [key, email] of Object.entries((args["create"] as Record<string, Args>) ?? {})) {
      for (const field of ["to", "cc", "bcc", "replyTo"]) {
        if (field in email && email[field] === null) notCreated[key] = { type: "invalidProperties", properties: [field] };
      }
      if (notCreated[key]) continue;
      const id = `M${this.#next++}`;
      const messageId = (email["messageId"] as string[] | undefined)?.[0];
      const sameThread = messageId ? [...this.emails.values()].find((e) => (e["messageId"] as string[] | undefined)?.[0] === messageId) : undefined;
      const replyTo = (email["inReplyTo"] as string[] | undefined)?.[0];
      const parent = replyTo ? [...this.emails.values()].find((e) => (e["messageId"] as string[] | undefined)?.[0] === replyTo) : undefined;
      const threadId = sameThread?.threadId ?? parent?.threadId ?? `T-${id}`;
      this.emails.set(id, { ...structuredClone(email), id, threadId } as StoredEmail);
      created[key] = { id, threadId, blobId: `blob-${id}`, size: 1 };
    }
    const updated: Record<Id, null> = {};
    for (const [id, patch] of Object.entries((args["update"] as Record<Id, Record<string, unknown>>) ?? {})) {
      const email = this.emails.get(id);
      if (email) {
        applyPatch(email, patch);
        updated[id] = null;
      }
    }
    const destroyed: Id[] = [];
    const notDestroyed: Record<Id, Args> = {};
    for (const id of (args["destroy"] as Id[]) ?? []) {
      if (this.emails.delete(id)) destroyed.push(id);
      else notDestroyed[id] = { type: "notFound" };
    }
    return {
      accountId: ACCOUNT,
      oldState: "e0",
      newState: "e1",
      created: Object.keys(created).length ? created : null,
      notCreated: Object.keys(notCreated).length ? notCreated : null,
      updated: Object.keys(updated).length ? updated : null,
      destroyed: destroyed.length ? destroyed : null,
      notDestroyed: Object.keys(notDestroyed).length ? notDestroyed : null,
    };
  }
}
