// Stalwart's verification codes, as the service worker hands them over
// (brief 16). The worker posts every PushVerification to Postern's open
// windows; the page that created the subscription waits here for its id.
// A code can arrive before PushSubscription/set has answered, so codes are
// kept (a few, briefly) until asked for.

const KEEP = 8;

export class VerificationTimeoutError extends Error {
  constructor(id: string) {
    super(`No verification code arrived for push subscription ${id}`);
    this.name = "VerificationTimeoutError";
  }
}

export class VerificationInbox {
  #codes = new Map<string, string>();
  #waiting = new Map<string, Set<(code: string) => void>>();

  /** A code from the worker. */
  receive(pushSubscriptionId: string, verificationCode: string): void {
    const waiters = this.#waiting.get(pushSubscriptionId);
    if (waiters?.size) {
      this.#waiting.delete(pushSubscriptionId);
      for (const resolve of waiters) resolve(verificationCode);
      return;
    }
    this.#codes.delete(pushSubscriptionId);
    this.#codes.set(pushSubscriptionId, verificationCode);
    while (this.#codes.size > KEEP) this.#codes.delete(this.#codes.keys().next().value as string);
  }

  /** The code for this subscription: one already here, or the next to arrive. Rejects after `ms`. */
  waitFor(pushSubscriptionId: string, ms: number, signal?: AbortSignal): Promise<string> {
    const held = this.#codes.get(pushSubscriptionId);
    if (held !== undefined) {
      this.#codes.delete(pushSubscriptionId);
      return Promise.resolve(held);
    }
    return new Promise((resolve, reject) => {
      const waiters = this.#waiting.get(pushSubscriptionId) ?? new Set();
      this.#waiting.set(pushSubscriptionId, waiters);
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        waiters.delete(settle);
        if (waiters.size === 0 && this.#waiting.get(pushSubscriptionId) === waiters) this.#waiting.delete(pushSubscriptionId);
      };
      const settle = (code: string) => {
        done();
        resolve(code);
      };
      const onAbort = () => {
        done();
        reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      };
      const timer = setTimeout(() => {
        done();
        reject(new VerificationTimeoutError(pushSubscriptionId));
      }, ms);
      signal?.addEventListener("abort", onAbort, { once: true });
      waiters.add(settle);
    });
  }
}

/** The page's one inbox: register.ts feeds it from the worker's messages. */
export const verificationInbox = new VerificationInbox();
