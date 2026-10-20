// The request builder: batch method calls, link them with back-references,
// send them as few POSTs as the server's limits allow, and read typed results.
//
//   const r = client.request();
//   const q = r.call("Email/query", { filter: { inMailbox }, collapseThreads: true, limit: 50 });
//   const g = r.call("Email/get", { ids: q.ref("/ids"), properties: ["threadId", "subject"] });
//   const res = await r.send();
//   res.get(g).list; // Email[]; throws JmapMethodError if Email/get failed

import { Capability, capabilityOf, takesAccountId } from "./capabilities.js";
import { JmapError, JmapProtocolError, methodError, type JmapMethodError } from "./errors.js";
import type { Session } from "./session.js";
import { expandCalls, mergeGetResponses, mergeSetResponses, partitionCalls, type WireCall } from "./split.js";
import type { Id, Invocation, JmapRequestBody, JmapResponseBody, ResultReferenceObject } from "./types/core.js";
import type { MethodArgs, MethodName, MethodResponse } from "./types/methods.js";

/**
 * A back-reference to part of an earlier call's result (RFC 8620 §3.7). Put it
 * where the value would go: `{ ids: query.ref("/ids") }` is sent as
 * `"#ids": { resultOf, name, path }`.
 */
export class ResultRef<T = unknown> {
  readonly resultOf: string;
  readonly name: string;
  readonly path: string;
  /** Type-only: the value the path resolves to. */
  declare readonly __value?: T;

  constructor(resultOf: string, name: string, path: string) {
    this.resultOf = resultOf;
    this.name = name;
    this.path = path;
  }

  toJSON(): ResultReferenceObject {
    return { resultOf: this.resultOf, name: this.name, path: this.path };
  }
}

type OptionalAccount<A> = A extends { accountId: Id } ? Omit<A, "accountId"> & { accountId?: Id } : A;

/** Each argument may be its value or a back-reference to one. */
export type Refable<A> = { [K in keyof A]: A[K] | ResultRef<Exclude<A[K], null | undefined>> };

/** The explicit `"#name": ref` spelling is accepted too. */
export type HashRefs<A> = { [K in keyof A as K extends string ? `#${K}` : never]?: ResultRef | ResultReferenceObject };

/** Arguments for `call(name, args)`: the method's arguments, `accountId` optional (the session's primary account for the method's capability is filled in), back-references allowed. */
export type CallArgs<N extends MethodName> = Refable<OptionalAccount<MethodArgs<N>>> & HashRefs<MethodArgs<N>>;

/** The response type for a method name; untyped for `callRaw`. */
export type ResponseOf<N extends string> = N extends MethodName ? MethodResponse<N> : Record<string, unknown>;

/** A call added to a builder. Use it to make back-references and to read its result. */
export class CallHandle<N extends string = MethodName> {
  readonly name: N;
  readonly id: string;

  constructor(name: N, id: string) {
    this.name = name;
    this.id = id;
  }

  /** A back-reference to a top-level result property, typed: `query.ref("/ids")`. */
  ref<K extends keyof ResponseOf<N> & string>(path: `/${K}`): ResultRef<ResponseOf<N>[K]>;
  /** A back-reference to any JSON pointer, e.g. `/list/*\/threadId`. The type comes from where it is used. */
  ref<T = unknown>(path: string): ResultRef<T>;
  ref(path: string): ResultRef<unknown> {
    return new ResultRef(this.id, this.name, path);
  }
}

/** What the builder needs from the client: a session and a way to POST. */
export interface RequestExecutor {
  ensureSession(signal?: AbortSignal): Promise<Session>;
  post(session: Session, body: JmapRequestBody, signal?: AbortSignal): Promise<JmapResponseBody>;
}

interface PendingCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  deps: string[];
}

function isRefObject(value: unknown): value is ResultReferenceObject {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ResultReferenceObject).resultOf === "string" &&
    typeof (value as ResultReferenceObject).name === "string" &&
    typeof (value as ResultReferenceObject).path === "string"
  );
}

/** Collects calls; `send()` posts them. A builder sends once. */
export class RequestBuilder {
  readonly #executor: RequestExecutor;
  readonly #calls: PendingCall[] = [];
  readonly #using = new Set<string>([Capability.Core]);
  #sent = false;

  constructor(executor: RequestExecutor) {
    this.#executor = executor;
  }

  /** How many calls have been added. */
  get length(): number {
    return this.#calls.length;
  }

  /** Add capabilities to `using` beyond those inferred from the method names. */
  using(...capabilities: string[]): this {
    for (const urn of capabilities) this.#using.add(urn);
    return this;
  }

  /** Add a typed method call. */
  call<N extends MethodName>(name: N, args: CallArgs<N>): CallHandle<N> {
    return this.#add(name, args as Record<string, unknown>, capabilityOf(name));
  }

  /** Add a call to a method this package does not type. Name its capability if it is not core. */
  callRaw(name: string, args: Record<string, unknown>, capability?: string): CallHandle<string> {
    return this.#add(name, args, capability ?? capabilityOf(name));
  }

  #add<N extends string>(name: N, input: Record<string, unknown>, capability: string | undefined): CallHandle<N> {
    if (this.#sent) throw new JmapError("This request was already sent; start a new one with client.request()");
    if (capability) this.#using.add(capability);
    const id = String(this.#calls.length);
    const args: Record<string, unknown> = {};
    const deps = new Set<string>();
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      if (value instanceof ResultRef) {
        args[`#${key.replace(/^#/, "")}`] = value.toJSON();
        deps.add(this.#checkRef(value, name));
      } else if (key.startsWith("#") && isRefObject(value)) {
        args[key] = { resultOf: value.resultOf, name: value.name, path: value.path };
        deps.add(this.#checkRef(value, name));
      } else {
        args[key] = value;
      }
    }
    this.#calls.push({ id, name, args, deps: [...deps] });
    return new CallHandle(name, id);
  }

  #checkRef(ref: ResultReferenceObject, from: string): string {
    const target = this.#calls.find((c) => c.id === ref.resultOf);
    if (!target) throw new JmapError(`${from} references call ${ref.resultOf}, which is not earlier in this request`);
    if (target.name !== ref.name) throw new JmapError(`${from} references ${ref.name} but call ${ref.resultOf} is ${target.name}`);
    return target.id;
  }

  /**
   * Send the calls. Splits them over several POSTs if they exceed the
   * session's limits (in order, carrying `createdIds` across). Method errors do
   * not reject: read them per call from the result.
   *
   * @throws JmapRequestError, JmapHttpError, JmapUnauthorizedError, JmapNetworkError for the request as a whole;
   *         JmapLimitError if the calls cannot be fitted into the limits.
   */
  async send(options: { signal?: AbortSignal } = {}): Promise<RequestResult> {
    if (this.#sent) throw new JmapError("This request was already sent");
    this.#sent = true;
    const session = await this.#executor.ensureSession(options.signal);
    // accountId goes first: Stalwart 0.16 parses arguments in order, and a bad
    // state string seen before the accountId fails the whole request
    // (notRequest) instead of just that call (invalidArguments).
    const wire: WireCall[] = this.#calls.map((c) => {
      const args = takesAccountId(c.name)
        ? { accountId: c.args["accountId"] ?? session.accountIdFor(capabilityOf(c.name)), ...c.args }
        : { ...c.args };
      return { id: c.id, name: c.name, args, deps: c.deps };
    });

    const { calls, splits } = expandCalls(wire, session.limits);
    const batches = calls.length === 0 ? [] : partitionCalls(calls, session.limits.maxCallsInRequest);
    const using = [...this.#using];
    const byId = new Map<string, Invocation[]>();
    let createdIds: Record<Id, Id> | undefined = batches.length > 1 ? {} : undefined;
    let sessionState = session.state;

    for (const batch of batches) {
      const body: JmapRequestBody = { using, methodCalls: batch.map((c): Invocation => [c.name, c.args, c.id]) };
      if (createdIds) body.createdIds = createdIds;
      const res = await this.#executor.post(session, body, options.signal);
      if (!Array.isArray(res.methodResponses)) throw new JmapProtocolError("Response has no methodResponses");
      for (const inv of res.methodResponses) {
        const list = byId.get(inv[2]) ?? [];
        list.push(inv);
        byId.set(inv[2], list);
      }
      if (createdIds && res.createdIds) createdIds = { ...createdIds, ...res.createdIds };
      sessionState = res.sessionState ?? sessionState;
    }

    for (const [id, split] of splits) {
      const call = this.#calls.find((c) => c.id === id);
      const parts = split.partIds.map((p) => byId.get(p)?.[0]);
      const failed = parts.find((p) => p?.[0] === "error");
      if (failed) {
        byId.set(id, [failed]);
      } else if (!call || parts.some((p) => !p)) {
        byId.set(id, []);
      } else {
        const args = parts.map((p) => (p as Invocation)[1]);
        byId.set(id, [[call.name, split.kind === "get" ? mergeGetResponses(args) : mergeSetResponses(args), id]]);
      }
    }
    return new RequestResult(byId, sessionState, createdIds ?? {});
  }
}

/** The answers to a sent request, read per call handle. */
export class RequestResult {
  readonly #byId: Map<string, Invocation[]>;
  /** The server's session state at the time of the (last) response. */
  readonly sessionState: string;
  /** Creation id → server id, when the request was split over several POSTs. */
  readonly createdIds: Readonly<Record<Id, Id>>;

  constructor(byId: Map<string, Invocation[]>, sessionState: string, createdIds: Record<Id, Id>) {
    this.#byId = byId;
    this.sessionState = sessionState;
    this.createdIds = createdIds;
  }

  #primary(handle: CallHandle<string>): Invocation {
    const list = this.#byId.get(handle.id) ?? [];
    const inv = list.find((i) => i[0] === "error" || i[0] === handle.name) ?? list[0];
    if (!inv) throw new JmapProtocolError(`No response for ${handle.name} (call ${handle.id})`);
    return inv;
  }

  /** The call's response. @throws JmapMethodError (or JmapCannotCalculateChangesError) if the call failed. */
  get<N extends string>(handle: CallHandle<N>): ResponseOf<N> {
    const inv = this.#primary(handle);
    if (inv[0] === "error") throw methodError(handle.name, handle.id, inv[1]);
    return inv[1] as ResponseOf<N>;
  }

  /** The call's error, or undefined if it succeeded. */
  error(handle: CallHandle<string>): JmapMethodError | undefined {
    const inv = this.#primary(handle);
    return inv[0] === "error" ? methodError(handle.name, handle.id, inv[1]) : undefined;
  }

  /** Every invocation the server returned for this call (a method may answer more than once, e.g. an implicit Email/set). */
  all(handle: CallHandle<string>): readonly Invocation[] {
    return this.#byId.get(handle.id) ?? [];
  }
}
