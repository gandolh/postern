// Mailbox (RFC 8621 §2) and Thread (§3).

import type { CallArgs } from "../request.js";
import type { ChangesResponse, GetResponse, Id, QueryChangesResponse, QueryResponse, SetResponse } from "../types/core.js";
import type { Mailbox, MailboxChangesResponse, MailboxRole, Thread } from "../types/mail.js";
import type { CallOptions, ChangesOptions, MethodCaller } from "./caller.js";

/** Mailbox methods. The UI calls mailboxes labels. */
export class MailboxMethods {
  readonly #c: MethodCaller;
  constructor(caller: MethodCaller) {
    this.#c = caller;
  }

  /** `Mailbox/get`. All mailboxes when `ids` is omitted. */
  get(args: CallArgs<"Mailbox/get"> = {}, options?: CallOptions): Promise<GetResponse<Mailbox>> {
    return this.#c.call("Mailbox/get", args, options);
  }

  /** Every mailbox in the account, with its counts. */
  async all(options?: CallOptions): Promise<Mailbox[]> {
    return (await this.get({ ids: null }, options)).list;
  }

  /** `Mailbox/changes`. `updatedProperties` lists only counts when nothing else changed. */
  changes(sinceState: string, options: ChangesOptions = {}): Promise<MailboxChangesResponse> {
    return this.#c.call("Mailbox/changes", { sinceState, maxChanges: options.maxChanges }, options);
  }

  /** `Mailbox/query`. */
  query(args: CallArgs<"Mailbox/query"> = {}, options?: CallOptions): Promise<QueryResponse> {
    return this.#c.call("Mailbox/query", args, options);
  }

  /** `Mailbox/queryChanges`. */
  queryChanges(args: CallArgs<"Mailbox/queryChanges">, options?: CallOptions): Promise<QueryChangesResponse> {
    return this.#c.call("Mailbox/queryChanges", args, options);
  }

  /** `Mailbox/set`: create, rename, move, destroy. */
  set(args: CallArgs<"Mailbox/set">, options?: CallOptions): Promise<SetResponse<Mailbox>> {
    return this.#c.call("Mailbox/set", args, options);
  }
}

/** Thread methods. A thread is a conversation. */
export class ThreadMethods {
  readonly #c: MethodCaller;
  constructor(caller: MethodCaller) {
    this.#c = caller;
  }

  /** `Thread/get`: each conversation's message ids, oldest first. */
  get(args: CallArgs<"Thread/get">, options?: CallOptions): Promise<GetResponse<Thread>> {
    return this.#c.call("Thread/get", args, options);
  }

  /** `Thread/changes`. */
  changes(sinceState: string, options: ChangesOptions = {}): Promise<ChangesResponse> {
    return this.#c.call("Thread/changes", { sinceState, maxChanges: options.maxChanges }, options);
  }
}

/** The mailbox with a role (inbox, sent, drafts, junk, trash, archive). Never find system mailboxes by name. */
export function findByRole<M extends Pick<Mailbox, "role">>(mailboxes: readonly M[], role: MailboxRole): M | undefined {
  return mailboxes.find((m) => m.role === role);
}

/** A mailbox's path from the root, `Work/Clients`, following `parentId`. */
export function mailboxPath<M extends Pick<Mailbox, "id" | "name" | "parentId">>(
  mailbox: M,
  all: readonly M[],
  separator = "/",
): string {
  const byId = new Map<Id, M>(all.map((m) => [m.id, m]));
  const parts = [mailbox.name];
  const seen = new Set<Id>([mailbox.id]);
  let parent = mailbox.parentId;
  while (parent && !seen.has(parent)) {
    const p = byId.get(parent);
    if (!p) break;
    parts.unshift(p.name);
    seen.add(p.id);
    parent = p.parentId;
  }
  return parts.join(separator);
}
