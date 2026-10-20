// Web Push for one signed-in session (brief 16): subscribe this browser with
// the PushManager, register it with Stalwart as a JMAP PushSubscription,
// complete the verification handshake, keep it alive, and end it.
//
// Rules it keeps (corpus/wiki/security.md, Tokens):
//   - the token never leaves the page: the service worker gets push payloads
//     only, and Stalwart encrypts those to this browser's subscription keys;
//   - off by default, per device and per account (settings.ts);
//   - sign-out ends the subscription (forget() while the tokens still work,
//     dropBrowserSubscription() after any sign-out, which needs no token).
//
// Stalwart 0.16.25 facts it relies on (probed 2026-10-20):
//   - PushSubscription/get never returns url or keys, so this device finds its
//     own by deviceClientId (device.ts);
//   - `expires` is capped at 7 days, so every sign-in extends it;
//   - verification pushes are rate limited to one a minute per account, so the
//     wait for a code is long enough to cover a deferred one;
//   - `emailPush` (urn:ietf:params:jmap:emailpush) puts sender and subject in
//     the encrypted payload, so the worker can name them without a token.
//
// Everything browser- or server-shaped comes in through WebPushDeps, so the
// flows are tested with fakes (webPush.test.ts).

import { JmapSetError, type EmailPushConfig, type Id, type PushSubscription, type PushSubscriptionCreate } from "@postern/jmap";
import { TimeoutError, withDeadline, withTimeout } from "./deadline";
import { base64UrlToBytes, deviceClientId, sameKey } from "./device";
import { readChoice, writeChoice } from "./settings";
import { VerificationTimeoutError, type VerificationInbox } from "./verification";

/** Stalwart caps a subscription at 7 days; ask for all of it. */
export const EXPIRES_MS = 7 * 24 * 3600 * 1000;
/** A verification push can be deferred up to a minute (one per account per minute), then has to travel. */
export const VERIFY_TIMEOUT_MS = 90_000;
/** Only new mail: Stalwart sends EmailDelivery (or EmailPush) and nothing for archive, read or label changes. */
export const PUSH_TYPES: readonly string[] = ["EmailDelivery"];
/** What an EmailPush carries: enough for "Bob Baker: Lunch?" and the click, never a body or preview. */
export const EMAIL_PUSH_PROPERTIES: readonly string[] = ["id", "threadId", "from", "subject"];
/**
 * The browser's push service answers a subscribe in a second or two. It never
 * answers when the browser cannot reach it (Chrome started with
 * --disable-background-networking, as automation does; a network that blocks
 * Google's or Mozilla's push servers), and the promise would hang for ever.
 */
export const SUBSCRIBE_TIMEOUT_MS = 20_000;
/** The part of sign-out spent on the server; the browser's own unsubscribe follows. */
const FORGET_SERVER_MS = 1500;

/** The browser's subscription, as far as this code needs it. */
export interface BrowserSubscription {
  endpoint: string;
  options?: { applicationServerKey: ArrayBuffer | null } | undefined;
  toJSON(): { keys?: Record<string, string> | undefined };
  unsubscribe(): Promise<boolean>;
}

export interface PushManagerLike {
  getSubscription(): Promise<BrowserSubscription | null>;
  subscribe(options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array<ArrayBuffer> }): Promise<BrowserSubscription>;
}

export interface BrowserPush {
  /** The service worker's push manager; null without a worker (the dev server, an old browser). */
  pushManager(): Promise<PushManagerLike | null>;
  permission(): NotificationPermission | "unsupported";
  requestPermission(): Promise<NotificationPermission>;
}

/** PushSubscription/* through @postern/jmap (JmapClient.pushSubscription). */
export interface PushServer {
  get(args: { properties: (keyof PushSubscription)[] }, options?: { signal?: AbortSignal }): Promise<{ list: Partial<PushSubscription>[] }>;
  set(args: { destroy: Id[] }, options?: { signal?: AbortSignal }): Promise<unknown>;
  create(subscription: PushSubscriptionCreate, options?: { signal?: AbortSignal }): Promise<{ id: Id }>;
  verify(id: Id, code: string, options?: { signal?: AbortSignal }): Promise<void>;
  update(id: Id, patch: { expires: string }, options?: { signal?: AbortSignal }): Promise<void>;
}

export interface WebPushDeps {
  username: string;
  /** The session's urn:ietf:params:jmap:webpush-vapid applicationServerKey; null = Web Push unsupported. */
  vapidKey: string | null;
  server: PushServer;
  browser: BrowserPush;
  inbox: VerificationInbox;
  /** The emailPush config to ask for (sender and subject in the push), or null for bare StateChanges. */
  emailPush: () => Promise<Record<Id, EmailPushConfig> | null>;
  now?: () => number;
  verifyTimeoutMs?: number;
  subscribeTimeoutMs?: number;
}

/** Why turning it on did not work. */
export type WebPushProblem = "denied" | "unavailable" | "pushService" | "timeout" | "failed";

export interface WebPushSnapshot {
  /** The person's choice on this device (stays on across sign-outs; the subscription does not). */
  on: boolean;
  busy: boolean;
  problem: WebPushProblem | null;
}

function problemOf(err: unknown): WebPushProblem {
  if (err instanceof VerificationTimeoutError) return "timeout";
  if (err instanceof TimeoutError) return "pushService";
  return "failed";
}

function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sameTypes(a: readonly string[] | null | undefined, b: readonly string[]): boolean {
  return JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...b].sort());
}

export class WebPush {
  readonly #d: WebPushDeps;
  readonly #listeners = new Set<() => void>();
  #snapshot: WebPushSnapshot;
  #abort = new AbortController();

  constructor(deps: WebPushDeps) {
    this.#d = deps;
    this.#snapshot = { on: readChoice(deps.username).on, busy: false, problem: null };
  }

  /** Web Push can work in this session: the server has a VAPID key and the browser a Notification API. */
  get supported(): boolean {
    return this.#d.vapidKey !== null && this.#d.browser.permission() !== "unsupported";
  }

  getSnapshot = (): WebPushSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #set(patch: Partial<WebPushSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const l of [...this.#listeners]) l();
  }

  /** The person turns it on: permission, subscribe, register, verify. The outcome is in the snapshot. */
  async enable(): Promise<void> {
    if (this.#snapshot.busy) return;
    this.#renew();
    this.#set({ busy: true, problem: null });
    let problem: WebPushProblem | null = null;
    try {
      // Asked first, inside the click: Safari only shows the prompt for a user gesture.
      const permission = this.#d.browser.permission() === "granted" ? "granted" : await this.#d.browser.requestPermission();
      const manager = permission === "granted" && this.supported ? await this.#d.browser.pushManager() : null;
      if (permission !== "granted") problem = "denied";
      else if (!manager) problem = "unavailable";
      else {
        await this.#register(manager, this.#abort.signal);
        writeChoice(this.#d.username, { on: true });
      }
    } catch (err) {
      problem = problemOf(err);
    }
    this.#set({ busy: false, problem, on: readChoice(this.#d.username).on });
  }

  /** A sign-out cancels work in flight; React's development double mount then starts again. */
  #renew(): void {
    if (this.#abort.signal.aborted) this.#abort = new AbortController();
  }

  /** The person turns it off: the server forgets this device and the browser unsubscribes. */
  async disable(): Promise<void> {
    if (this.#snapshot.busy) return;
    this.#set({ busy: true, problem: null });
    try {
      await this.#forget(this.#abort.signal);
    } catch {
      // Off is off: the subscription expires within 7 days even if the server missed the destroy.
    }
    writeChoice(this.#d.username, { on: false, verified: null });
    this.#set({ on: false, busy: false });
  }

  /** After sign-in: if it is on here, make sure this browser is subscribed and extend it 7 days. */
  async refresh(): Promise<void> {
    const choice = readChoice(this.#d.username);
    if (!choice.on || !this.supported || this.#d.browser.permission() !== "granted") return;
    this.#renew();
    this.#set({ busy: true, problem: null });
    try {
      const manager = await this.#d.browser.pushManager();
      if (manager) await this.#register(manager, this.#abort.signal);
    } catch (err) {
      if (!this.#abort.signal.aborted) this.#set({ problem: problemOf(err) });
    } finally {
      this.#set({ busy: false });
    }
  }

  /** Before a sign-out, while the tokens still work: destroy this device's subscription, then unsubscribe. */
  async forget(): Promise<void> {
    if (!readChoice(this.#d.username).on) return;
    this.#abort.abort();
    const manager = await this.#d.browser.pushManager().catch(() => null);
    const sub = await manager?.getSubscription().catch(() => null);
    if (!sub) return;
    await withDeadline(this.#destroyMine(sub), FORGET_SERVER_MS);
    await sub.unsubscribe().catch(() => false);
    writeChoice(this.#d.username, { verified: null });
  }

  /**
   * After any sign-out (the idle timeout too, which gives no chance to call
   * forget()): no token is needed to stop this browser receiving pushes. The
   * server's copy then fails delivery until the next sign-in here destroys it,
   * or it expires within 7 days.
   */
  async dropBrowserSubscription(): Promise<void> {
    this.#abort.abort();
    if (!readChoice(this.#d.username).on) return;
    const manager = await this.#d.browser.pushManager().catch(() => null);
    const sub = await manager?.getSubscription().catch(() => null);
    if (!sub) return;
    await sub.unsubscribe().catch(() => false);
    // The `verified` marker stays: it is how the next sign-in here finds the
    // server's leftover copy (no token now to destroy it) and destroys it.
  }

  async #forget(signal: AbortSignal): Promise<void> {
    const manager = await this.#d.browser.pushManager();
    const sub = await manager?.getSubscription();
    if (!sub) return;
    try {
      await this.#destroyMine(sub, signal);
    } finally {
      await sub.unsubscribe().catch(() => false);
    }
  }

  async #destroyMine(sub: BrowserSubscription, signal?: AbortSignal): Promise<void> {
    const mine = await deviceClientId(this.#d.username, sub.endpoint);
    const previous = readChoice(this.#d.username).verified;
    const { list } = await this.#d.server.get({ properties: ["id", "deviceClientId"] }, { signal });
    const ids = list.filter((s) => s.id && (s.deviceClientId === mine || (previous !== null && s.deviceClientId === previous))).map((s) => s.id as Id);
    if (ids.length) await this.#d.server.set({ destroy: ids }, { signal });
  }

  /** Subscribe the browser (or reuse its subscription) and make sure Stalwart has it, verified. */
  async #register(manager: PushManagerLike, signal: AbortSignal): Promise<void> {
    const { username, server, inbox, vapidKey } = this.#d;
    if (vapidKey === null) throw new Error("No VAPID key");
    const key = base64UrlToBytes(vapidKey);
    let sub = await manager.getSubscription();
    if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
      // Made for another server key (Stalwart's key changed): it would never receive.
      await sub.unsubscribe().catch(() => false);
      sub = null;
    }
    sub ??= await withTimeout(manager.subscribe({ userVisibleOnly: true, applicationServerKey: key }), this.#d.subscribeTimeoutMs ?? SUBSCRIBE_TIMEOUT_MS, "Subscribing to the browser's push service");
    const keys = sub.toJSON().keys;
    if (!keys?.["p256dh"] || !keys["auth"]) throw new Error("The browser gave a subscription without encryption keys");

    const id = await deviceClientId(username, sub.endpoint);
    const emailPush = await this.#d.emailPush();
    const expires = isoSeconds((this.#d.now ?? Date.now)() + EXPIRES_MS);
    const choice = readChoice(username);
    const { list } = await server.get({ properties: ["id", "deviceClientId", "types", "emailPush"] }, { signal });
    const mine = list.filter((s) => s.id && s.deviceClientId === id);
    const stale = choice.verified !== null && choice.verified !== id ? list.filter((s) => s.id && s.deviceClientId === choice.verified) : [];

    // Already registered and verified from here, asking for the same things: extend it.
    const current = mine.length === 1 ? mine[0] : undefined;
    if (current?.id && choice.verified === id && sameTypes(current.types, PUSH_TYPES) && Boolean(current.emailPush) === Boolean(emailPush)) {
      await server.update(current.id, { expires }, { signal });
      if (stale.length) await server.set({ destroy: stale.map((s) => s.id as Id) }, { signal });
      return;
    }

    // Otherwise start clean: one subscription per device and account.
    const drop = [...mine, ...stale].map((s) => s.id as Id);
    if (drop.length) await server.set({ destroy: drop }, { signal });
    writeChoice(username, { verified: null });
    const created = await server.create(
      {
        deviceClientId: id,
        url: sub.endpoint,
        keys: { p256dh: keys["p256dh"], auth: keys["auth"] },
        types: [...PUSH_TYPES],
        expires,
        ...(emailPush ? { emailPush } : {}),
      },
      { signal },
    );
    try {
      // Stalwart pushes the code to the endpoint; the worker posts it here (register.ts -> inbox).
      const timeout = this.#d.verifyTimeoutMs ?? VERIFY_TIMEOUT_MS;
      const deadline = Date.now() + timeout;
      const code = await inbox.waitFor(created.id, timeout, signal);
      try {
        await server.verify(created.id, code, { signal });
      } catch (err) {
        // Stalwart reuses ids: a late code for an earlier subscription with the
        // same id can be waiting here. Refused, so wait for this one's.
        if (!(err instanceof JmapSetError)) throw err;
        const next = await inbox.waitFor(created.id, Math.max(0, deadline - Date.now()), signal);
        await server.verify(created.id, next, { signal });
      }
    } catch (err) {
      // An unverified subscription never receives anything: don't leave it behind.
      await server.set({ destroy: [created.id] }).catch(() => undefined);
      throw err;
    }
    writeChoice(username, { verified: id });
  }
}
