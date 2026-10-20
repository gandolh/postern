// Sending a plan: one `Email/set` (the client splits it by the server's
// maxObjectsInSet), and which messages the server took or refused.

import { JmapSetError, type Id, type MethodCaller, type SetError } from "@postern/jmap";
import { emptyPlan, isEmptyPlan, subPlan, type MessagePlan } from "./patches";

export interface SendResult {
  /** The plan as sent. */
  plan: MessagePlan;
  /** The part the server applied (undo sends its inverse). */
  done: MessagePlan;
  /** The part it refused, with why. */
  failed: MessagePlan;
  errors: Record<Id, SetError>;
  /** Email state after the change, if anything was sent. */
  newState: string | null;
}

/**
 * Send a plan's updates. Rejects only when the request as a whole fails
 * (network, session, method error); refused messages come back in `failed`.
 */
export async function sendPlan(caller: MethodCaller, plan: MessagePlan, options: { signal?: AbortSignal } = {}): Promise<SendResult> {
  if (isEmptyPlan(plan)) return { plan, done: plan, failed: emptyPlan(), errors: {}, newState: null };
  const res = await caller.call("Email/set", { update: plan.update }, options);
  const errors = res.notUpdated ?? {};
  const refused = new Set(Object.keys(errors));
  const ids = Object.keys(plan.update);
  return {
    plan,
    done: subPlan(plan, ids.filter((id) => !refused.has(id))),
    failed: subPlan(plan, ids.filter((id) => refused.has(id))),
    errors,
    newState: res.newState,
  };
}

export interface DestroyResult {
  destroyed: Id[];
  errors: Record<Id, SetError>;
}

/** Delete messages forever (`Email/set destroy`). Cannot be undone. */
export async function destroyMessages(caller: MethodCaller, ids: readonly Id[], options: { signal?: AbortSignal } = {}): Promise<DestroyResult> {
  if (ids.length === 0) return { destroyed: [], errors: {} };
  const res = await caller.call("Email/set", { destroy: [...ids] }, options);
  return { destroyed: res.destroyed ?? [], errors: res.notDestroyed ?? {} };
}

/** The first refusal as an error, for messages that need one. */
export function firstSetError(errors: Record<Id, SetError>): JmapSetError | undefined {
  const [id, error] = Object.entries(errors)[0] ?? [];
  return id && error ? new JmapSetError("Email/set", id, error) : undefined;
}
