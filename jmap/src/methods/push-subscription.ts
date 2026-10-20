// PushSubscription (RFC 8620 §7.2): Web Push registrations, for brief 16.
//
// The flow: create the subscription with the browser's push endpoint and
// keys; the server POSTs a PushVerification to that endpoint; the service
// worker hands its `verificationCode` to `verify()`. Until then the server
// sends nothing else.

import { JmapProtocolError, JmapSetError } from "../errors.js";
import type { CallArgs } from "../request.js";
import type { Id, UTCDate } from "../types/core.js";
import type { PushSubscriptionGetResponse, PushSubscriptionSetResponse } from "../types/methods.js";
import type { PushSubscription, PushSubscriptionCreate, PushVerification } from "../types/push.js";
import type { CallOptions, MethodCaller } from "./caller.js";

/** What the server set on a new subscription. */
export interface CreatedPushSubscription {
  id: Id;
  expires: UTCDate | null;
}

export class PushSubscriptionMethods {
  readonly #c: MethodCaller;
  constructor(caller: MethodCaller) {
    this.#c = caller;
  }

  /** `PushSubscription/get`: the subscriptions made with these credentials. */
  get(args: CallArgs<"PushSubscription/get"> = {}, options?: CallOptions): Promise<PushSubscriptionGetResponse> {
    return this.#c.call("PushSubscription/get", args, options);
  }

  /** `PushSubscription/set`, raw. */
  set(args: CallArgs<"PushSubscription/set">, options?: CallOptions): Promise<PushSubscriptionSetResponse> {
    return this.#c.call("PushSubscription/set", args, options);
  }

  /** Register a push endpoint. The server then sends a PushVerification to it. @throws JmapSetError */
  async create(subscription: PushSubscriptionCreate, options?: CallOptions): Promise<CreatedPushSubscription> {
    const res = await this.set({ create: { sub: subscription } }, options);
    const error = res.notCreated?.["sub"];
    if (error) throw new JmapSetError("PushSubscription/set", "sub", error);
    const created = res.created?.["sub"];
    if (!created?.id) throw new JmapProtocolError("PushSubscription/set created nothing");
    return { id: created.id, expires: created.expires ?? null };
  }

  /** Complete the handshake with the code from the PushVerification. @throws JmapSetError */
  verify(id: Id, verificationCode: string, options?: CallOptions): Promise<void> {
    return this.#update(id, { verificationCode }, options);
  }

  /** Extend or change a subscription. @throws JmapSetError */
  update(id: Id, patch: Partial<Pick<PushSubscription, "expires" | "types">>, options?: CallOptions): Promise<void> {
    return this.#update(id, patch, options);
  }

  /** Remove a subscription. @throws JmapSetError */
  async destroy(id: Id, options?: CallOptions): Promise<void> {
    const res = await this.set({ destroy: [id] }, options);
    const error = res.notDestroyed?.[id];
    if (error) throw new JmapSetError("PushSubscription/set", id, error);
  }

  async #update(id: Id, patch: Partial<PushSubscription>, options?: CallOptions): Promise<void> {
    const res = await this.set({ update: { [id]: patch } }, options);
    const error = res.notUpdated?.[id];
    if (error) throw new JmapSetError("PushSubscription/set", id, error);
  }
}

/** True if a push payload is the verification message (as opposed to a StateChange). */
export function isPushVerification(value: unknown): value is PushVerification {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { "@type"?: unknown })["@type"] === "PushVerification" &&
    typeof (value as PushVerification).verificationCode === "string"
  );
}
