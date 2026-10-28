// AuthSession: Postern's sign-in and token holder. It implements the
// client's AuthProvider, so one object signs in, hands out Bearer headers,
// refreshes, expires and signs out, and no token ever leaves it except as the
// Authorization header value and, since brief 27, the refresh token to the
// store the app hands it (`SessionStore`; sessionStorage in the browser, so a
// reload signs in again with one refresh grant and closing the tab ends it).
// The access token lives only in a private field. Neither token goes to
// cookies, BroadcastChannel, postMessage, URLs, logs or error messages
// (corpus/wiki/security.md).

import { JmapError, JmapNetworkError } from "../errors.js";
import type { AuthProvider, FetchLike } from "../http.js";
import { backoffDelay } from "../push/backoff.js";
import { normalizeBase } from "../url.js";
import { SessionExpiredError, SignInError, SignedOutError, TokenEndpointError } from "./errors.js";
import { IdleTimeout } from "./idle.js";
import { createPkce } from "./pkce.js";
import { DEFAULT_SCOPE, POSTERN_CLIENT_ID, exchangeCode, fetchUserInfo, refreshGrant, requestAuthCode, type TokenGrant, type UserInfo } from "./protocol.js";
import type { SessionStore, StoredSession } from "./store.js";

/** Refresh this long before the access token expires (or a quarter of its lifetime, if shorter). */
export const REFRESH_LEAD_MS = 5 * 60 * 1000;

/** A token this close to expiry is refreshed before use rather than sent. */
const EXPIRY_SKEW_MS = 30 * 1000;

/** A 401 this soon after a refresh is a request that left with the old token: retry without refreshing again. */
const RECENT_REFRESH_MS = 5 * 1000;

/** setTimeout's ceiling (2^31 - 1 ms). */
const MAX_DELAY_MS = 2_147_483_647;

/**
 * The stored last activity is brought up to date at most this often: input
 * events come many times a second. A stamp this much behind only makes a
 * reload's idle check sign out that much sooner, never later.
 */
export const ACTIVITY_SAVE_MS = 60 * 1000;

/** Retries after a refresh that failed for a transient reason (network, 5xx, 429). */
const REFRESH_RETRY = { initialMs: 5_000, maxMs: 5 * 60_000 };

/**
 * The longest a sign-out waits on its before-sign-out hooks: long enough for a
 * draft save and a message submission on a slow line, short enough that
 * signing out never feels stuck.
 */
export const BEFORE_SIGN_OUT_MS = 3000;

/**
 * - `signedOut`: no tokens. Before the first sign-in and after `signOut()`.
 * - `active`: tokens in hand; `authorization()` works.
 * - `expired`: a refresh was refused (the refresh token ran out, or the
 *   password changed). The account is remembered so the user can sign in
 *   again without losing the app's state; until then `authorization()` throws
 *   `SessionExpiredError`.
 */
export type AuthStatus = "signedOut" | "active" | "expired";

/** Why the session ended: the user asked, or the idle timeout passed. */
export type SignOutReason = "user" | "idle";

/** Work that needs the tokens one last time, awaited before a sign-out drops them. */
export type BeforeSignOutHook = (reason: SignOutReason) => unknown;

export interface AuthStatusEvent {
  status: AuthStatus;
  /** Set when `status` is `signedOut`. */
  reason?: SignOutReason;
}

/** The signed-in account, from `/auth/userinfo`. */
export interface AuthAccount {
  /** Stalwart's account id (`sub`). */
  id: string;
  /** The address the account signs in with, e.g. `alice@postern.test`. */
  username: string;
  /** The display name (the account's description), if it has one. */
  name: string | undefined;
}

/** `signedIn`, or `mfaRequired`: ask for the TOTP code and call `signIn` again with it. */
export type SignInOutcome = "signedIn" | "mfaRequired";

/**
 * What `resume()` did (brief 27):
 * - `resumed`: signed in from the store, as after `signIn`.
 * - `none`: nothing kept (or not signed out).
 * - `idle`: the idle deadline passed before the reload; the store is cleared.
 * - `refused`: the refresh token was refused (expired, or the password
 *   changed); the store is cleared.
 * - `unreachable`: the server could not be reached or failed; the store is
 *   kept, so a later reload can try again. Nothing is signed in.
 * - `cancelled`: a sign-out (or sign-in) overtook it; the store is untouched.
 */
export type ResumeOutcome = "resumed" | "none" | "idle" | "refused" | "unreachable" | "cancelled";

export interface AuthSessionOptions {
  /** Where Stalwart is: `/webmail-api` in the browser, `http://127.0.0.1:18080` in Node. */
  baseUrl: string;
  /** Same origin as the app, e.g. `${location.origin}/webmail/`. Must be the same on both calls of a sign-in. */
  redirectUri: string;
  /** Default `POSTERN_CLIENT_ID`. */
  clientId?: string;
  /** Default `DEFAULT_SCOPE`. */
  scope?: string;
  /** Defaults to the global fetch. */
  fetch?: FetchLike;
  /** Sign out after this long without `noteActivity()`. Default `IDLE_TIMEOUT_MS` (8 hours); `Infinity` turns it off. */
  idleTimeoutMs?: number;
  /** Default `REFRESH_LEAD_MS`. */
  refreshLeadMs?: number;
  /** How long a sign-out waits on the before-sign-out hooks. Default `BEFORE_SIGN_OUT_MS`. */
  beforeSignOutMs?: number;
  /**
   * Brief 27: where to keep the refresh token, the account and the last
   * activity so a reload can `resume()`. Saved after sign-in and after every
   * refresh that returns a refresh token; cleared on sign-out, the idle
   * timeout, a refused refresh, and before another account signs in. Without
   * one, nothing survives the page.
   */
  store?: SessionStore;
  /** Injected for tests. */
  now?: () => number;
}

export interface SignInOptions {
  /** The TOTP code, on the second call after `mfaRequired`. */
  mfaToken?: string;
  signal?: AbortSignal;
}

/**
 * Signs in through Stalwart (authorization code + PKCE, TOTP when the account
 * has it) and holds the tokens in memory; with a `store`, the refresh token
 * also goes there, so `resume()` can sign in again after a reload (brief 27).
 *
 * ```ts
 * const auth = new AuthSession({ baseUrl: "/webmail-api", redirectUri: `${location.origin}/webmail/` });
 * if ((await auth.signIn(address, password)) === "mfaRequired") await auth.signIn(address, password, { mfaToken: code });
 * const client = new JmapClient({ baseUrl: "/webmail-api", auth });
 * ```
 *
 * Stalwart 0.16.25 cannot revoke tokens, so `signOut()` forgets them; see
 * corpus/wiki/security.md.
 */
export class AuthSession implements AuthProvider {
  readonly baseUrl: string;
  readonly redirectUri: string;
  readonly clientId: string;
  readonly scope: string;
  readonly #fetch: FetchLike;
  readonly #now: () => number;
  readonly #lead: number;
  readonly #idle: IdleTimeout;
  readonly #listeners = new Set<(event: AuthStatusEvent) => void>();
  readonly #beforeSignOut = new Set<BeforeSignOutHook>();
  readonly #beforeSignOutMs: number;
  readonly #store: SessionStore | undefined;

  #status: AuthStatus = "signedOut";
  #account: AuthAccount | undefined;
  #access: string | undefined;
  #refresh: string | undefined;
  #expiresAt = 0;
  #refreshAt = 0;
  #lastRefreshAt = 0;
  /** Bumped whenever the tokens are replaced or dropped, so a late answer cannot resurrect old ones. */
  #generation = 0;
  #refreshing: { generation: number; promise: Promise<boolean> } | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #retryAttempt = 0;
  #signingIn = false;
  /** A sign-out waiting on its hooks; a second sign-out joins it. */
  #ending: Promise<void> | undefined;
  #resuming: { generation: number; promise: Promise<ResumeOutcome> } | undefined;
  /** The last activity time last written to the store. */
  #savedActivity = 0;

  constructor(options: AuthSessionOptions) {
    this.baseUrl = normalizeBase(options.baseUrl);
    this.redirectUri = options.redirectUri;
    this.clientId = options.clientId ?? POSTERN_CLIENT_ID;
    this.scope = options.scope ?? DEFAULT_SCOPE;
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.#now = options.now ?? Date.now;
    this.#lead = options.refreshLeadMs ?? REFRESH_LEAD_MS;
    this.#beforeSignOutMs = options.beforeSignOutMs ?? BEFORE_SIGN_OUT_MS;
    this.#store = options.store;
    this.#idle = new IdleTimeout({
      timeoutMs: options.idleTimeoutMs,
      now: this.#now,
      onIdle: () => void this.#signOut("idle"),
    });
  }

  get status(): AuthStatus {
    return this.#status;
  }

  /** The signed-in account; kept while `expired`, undefined when signed out. */
  get account(): AuthAccount | undefined {
    return this.#account;
  }

  /** Listen for status changes. Returns the unsubscribe function. */
  onStatus(listener: (event: AuthStatusEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Run `hook` before every sign-out, the user's and the idle timeout's,
   * while the tokens still work: save the drafts, send a message held for
   * Undo, destroy this device's push subscription. The hooks run together and
   * the sign-out waits for them for at most `beforeSignOutMs`; one that throws
   * or hangs costs only its own work. A session that is not active (expired,
   * signed out) has no tokens to lend, so its sign-out skips them. Returns
   * the unregister.
   */
  onBeforeSignOut(hook: BeforeSignOutHook): () => void {
    this.#beforeSignOut.add(hook);
    return () => {
      this.#beforeSignOut.delete(hook);
    };
  }

  /**
   * Sign in, or sign in again while `expired` (the same account only: the
   * session-expired dialog). Never retried here: each call is one attempt,
   * and a failed one counts towards Stalwart's ban.
   * @throws SignInError (`rejected` for a wrong password or code), SignedOutError if signed out meanwhile
   */
  async signIn(username: string, password: string, options: SignInOptions = {}): Promise<SignInOutcome> {
    if (this.#status === "active") throw new JmapError("Already signed in; sign out first");
    if (this.#signingIn) throw new JmapError("A sign-in is already running");
    // Signing in again after the idle deadline passed is not allowed: that session is over.
    if (this.checkIdle()) throw new SignedOutError();
    this.#signingIn = true;
    try {
      // What another account kept must not outlive its sign-in page (brief 27).
      const kept = this.#load();
      if (kept && kept.username.trim().toLowerCase() !== username.trim().toLowerCase()) this.#forget();
      const again = this.#status === "expired" ? this.#account : undefined;
      const generation = this.#generation;
      const pkce = await createPkce();
      const answer = await requestAuthCode(
        this.#fetch,
        this.baseUrl,
        {
          accountName: username.trim(),
          accountSecret: password,
          mfaToken: options.mfaToken?.trim(),
          clientId: this.clientId,
          redirectUri: this.redirectUri,
          scope: this.scope,
          codeChallenge: pkce.challenge,
        },
        options.signal,
      );
      if (generation !== this.#generation) throw new SignedOutError();
      if (answer.type === "mfaRequired") return "mfaRequired";

      let grant: TokenGrant;
      try {
        grant = await exchangeCode(
          this.#fetch,
          this.baseUrl,
          { code: answer.code, clientId: this.clientId, redirectUri: this.redirectUri, codeVerifier: pkce.verifier },
          options.signal,
        );
      } catch (err) {
        if (err instanceof TokenEndpointError) {
          throw new SignInError("server", "The mail server refused the authorization code", { status: err.status, cause: err });
        }
        throw err;
      }
      if (generation !== this.#generation) throw new SignedOutError();
      const info = await fetchUserInfo(this.#fetch, this.baseUrl, grant.accessToken, options.signal);

      if (generation !== this.#generation) throw new SignedOutError();
      if (again && again.id !== info.sub) throw new SignInError("rejected", "That is a different account");

      this.#generation++;
      this.#account = { id: info.sub, username: info.email, name: info.name };
      this.#refresh = undefined;
      this.#retryAttempt = 0;
      this.#apply(grant);
      this.#status = "active";
      this.#idle.start();
      this.#persist();
      this.#emit({ status: "active" });
      return "signedIn";
    } finally {
      this.#signingIn = false;
    }
  }

  /** Brief 27: the store holds a session `resume()` can try (signed out only). */
  resumable(): boolean {
    return this.#status === "signedOut" && this.#load() !== undefined;
  }

  /**
   * Brief 27: sign in again from the store after a reload, with one refresh
   * grant and no password, unless the idle deadline passed meanwhile (the
   * clock goes on from the stored last activity). Then the account is read
   * from `/auth/userinfo` with the new access token, which also proves it
   * works. Only from `signedOut`; concurrent calls share one run. Never
   * rejects: see `ResumeOutcome`.
   */
  resume(): Promise<ResumeOutcome> {
    if (this.#status !== "signedOut" || this.#signingIn) return Promise.resolve("none");
    const generation = this.#generation;
    if (this.#resuming?.generation === generation) return this.#resuming.promise;
    const promise = this.#runResume(generation).finally(() => {
      if (this.#resuming?.promise === promise) this.#resuming = undefined;
    });
    this.#resuming = { generation, promise };
    return promise;
  }

  async #runResume(generation: number): Promise<ResumeOutcome> {
    const kept = this.#load();
    if (!kept) return "none";
    const now = this.#now();
    const last = Math.min(kept.lastActivity, now);
    if (Number.isFinite(this.#idle.timeoutMs) && now - last >= this.#idle.timeoutMs) {
      this.#forget();
      return "idle";
    }
    const overtaken = () => generation !== this.#generation || this.#status !== "signedOut";
    let grant: TokenGrant;
    try {
      grant = await refreshGrant(this.#fetch, this.baseUrl, { refreshToken: kept.refreshToken, clientId: this.clientId });
    } catch (err) {
      if (overtaken()) return "cancelled";
      if (err instanceof TokenEndpointError) {
        this.#forget();
        return "refused";
      }
      return "unreachable";
    }
    if (overtaken()) return "cancelled";
    // A renewed refresh token is kept at once, whatever happens next.
    const refreshToken = grant.refreshToken ?? kept.refreshToken;
    if (grant.refreshToken) this.#save({ ...kept, refreshToken });
    let info: UserInfo;
    try {
      info = await fetchUserInfo(this.#fetch, this.baseUrl, grant.accessToken);
    } catch {
      return overtaken() ? "cancelled" : "unreachable";
    }
    if (overtaken()) return "cancelled";
    this.#generation++;
    this.#account = { id: info.sub, username: info.email, name: info.name };
    this.#refresh = refreshToken;
    this.#retryAttempt = 0;
    this.#apply(grant);
    this.#status = "active";
    this.#idle.start(last);
    this.#persist();
    this.#emit({ status: "active" });
    return "resumed";
  }

  /**
   * The `Authorization` header value, `Bearer <access token>`. Refreshes first
   * when the token is about to expire.
   * @throws SessionExpiredError, SignedOutError, JmapNetworkError (expired token, refresh unreachable)
   */
  async authorization(): Promise<string> {
    this.#checkIdle();
    this.#assertActive();
    const now = this.#now();
    if (now >= this.#expiresAt - EXPIRY_SKEW_MS) {
      await this.refresh();
      this.#assertActive();
      if (this.#now() >= this.#expiresAt) {
        throw new JmapNetworkError("Could not renew the session: the mail server did not answer");
      }
    } else if (now >= this.#refreshAt) {
      void this.refresh();
    }
    return `Bearer ${this.#access ?? ""}`;
  }

  /**
   * The client got a 401. Refresh once (joining a refresh already running) and
   * say whether to retry. False when the refresh was refused (the session is
   * now `expired`) or could not run.
   */
  async onUnauthorized(): Promise<boolean> {
    if (this.#status !== "active") return false;
    if (this.#refreshing?.generation === this.#generation) return this.#refreshing.promise;
    if (this.#now() - this.#lastRefreshAt < RECENT_REFRESH_MS) return true;
    return this.refresh();
  }

  /**
   * Get a new access token now. Concurrent callers share one request. Resolves
   * false (never rejects) when it failed; a refused refresh moves the session
   * to `expired`, a transient failure keeps the tokens and retries later.
   */
  refresh(): Promise<boolean> {
    if (this.#status !== "active") return Promise.resolve(false);
    const generation = this.#generation;
    if (this.#refreshing?.generation === generation) return this.#refreshing.promise;
    const token = this.#refresh;
    if (!token) {
      if (this.#now() >= this.#expiresAt) this.#expire();
      return Promise.resolve(false);
    }
    const promise = this.#runRefresh(token, generation).finally(() => {
      if (this.#refreshing?.promise === promise) this.#refreshing = undefined;
    });
    this.#refreshing = { generation, promise };
    return promise;
  }

  /**
   * The user did something (a key, a click, a scroll). Resets the idle
   * timeout, unless its deadline already passed (the machine slept through
   * it): then this starts the sign-out with reason `idle` (see `signOut`).
   * Cheap enough for every event.
   */
  noteActivity(): void {
    this.#idle.activity();
    // Brief 27: the store's copy follows, at most once per ACTIVITY_SAVE_MS.
    if (this.#status === "active" && this.#idle.lastActivity - this.#savedActivity >= ACTIVITY_SAVE_MS) this.#persist();
  }

  /**
   * Sign out with reason `idle` if the idle deadline has passed, without
   * counting as activity. Call it when the tab becomes visible or gains focus,
   * so a machine that slept through the deadline signs out on wake. True when
   * the sign-out began; it completes at once with no before-sign-out hooks,
   * else once they have run (see `signOut`).
   */
  checkIdle(): boolean {
    return this.#idle.check();
  }

  /**
   * Sign out: run the before-sign-out hooks (bounded, see `onBeforeSignOut`),
   * then forget the tokens and the account, stop the timers, tell the
   * listeners, and cancel a sign-in still running (it rejects with
   * SignedOutError). Resolves once signed out. A sign-out already waiting on
   * its hooks is joined, not repeated. Stalwart 0.16.25 has no revocation
   * endpoint, so a token copied before this stays valid until it expires;
   * there is nothing to call.
   *
   * While the hooks run the session stays `active` and `authorization()`
   * still answers: their requests go through the same client as any other,
   * so the window (at most `beforeSignOutMs`) is open to every caller. The
   * idle clock is already stopped by then.
   */
  async signOut(reason: SignOutReason = "user"): Promise<void> {
    return this.#signOut(reason);
  }

  #signOut(reason: SignOutReason): Promise<void> {
    if (this.#ending) return this.#ending;
    if (this.#status !== "active" || this.#beforeSignOut.size === 0) {
      this.#end(reason);
      return Promise.resolve();
    }
    this.#idle.stop();
    const hooks = [...this.#beforeSignOut];
    const ending = settleWithin(
      hooks.map((hook) => Promise.resolve().then(() => hook(reason))),
      this.#beforeSignOutMs,
    ).finally(() => {
      this.#ending = undefined;
      this.#end(reason);
    });
    this.#ending = ending;
    return ending;
  }

  async #runRefresh(token: string, generation: number): Promise<boolean> {
    try {
      const grant = await refreshGrant(this.#fetch, this.baseUrl, { refreshToken: token, clientId: this.clientId });
      if (generation !== this.#generation || this.#status !== "active") return false;
      this.#retryAttempt = 0;
      this.#apply(grant);
      // Brief 27: a renewed refresh token replaces the stored one (production renews it on every refresh).
      if (grant.refreshToken) this.#persist();
      return true;
    } catch (err) {
      if (generation !== this.#generation || this.#status !== "active") return false;
      if (err instanceof TokenEndpointError) {
        this.#expire();
      } else {
        this.#schedule(backoffDelay(this.#retryAttempt++, REFRESH_RETRY), () => void this.refresh());
      }
      return false;
    }
  }

  #apply(grant: TokenGrant): void {
    const now = this.#now();
    const lifetime = Math.max(0, grant.expiresIn) * 1000;
    this.#access = grant.accessToken;
    if (grant.refreshToken) this.#refresh = grant.refreshToken;
    this.#expiresAt = now + lifetime;
    this.#refreshAt = now + lifetime - Math.min(this.#lead, lifetime / 4);
    this.#lastRefreshAt = now;
    if (this.#refresh) this.#schedule(this.#refreshAt - now, () => void this.refresh());
    else this.#schedule(this.#expiresAt - now, () => void this.refresh());
  }

  #schedule(delay: number, run: () => void): void {
    this.#clearTimer();
    this.#timer = setTimeout(
      () => {
        this.#timer = undefined;
        run();
      },
      Math.min(MAX_DELAY_MS, Math.max(0, delay)),
    );
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #dropTokens(): void {
    this.#generation++;
    this.#access = undefined;
    this.#refresh = undefined;
    this.#expiresAt = 0;
    this.#refreshAt = 0;
    this.#lastRefreshAt = 0;
    this.#retryAttempt = 0;
    this.#refreshing = undefined;
    this.#clearTimer();
  }

  #expire(): void {
    if (this.#status !== "active") return;
    this.#dropTokens();
    // A refused refresh token is no use to a reload either.
    this.#forget();
    this.#status = "expired";
    this.#emit({ status: "expired" });
  }

  #end(reason: SignOutReason): void {
    this.#idle.stop();
    // Bumping the generation cancels a sign-in or a resume in flight, even from signedOut.
    this.#dropTokens();
    // A session that never started keeps the store: React's StrictMode signs out
    // a fresh one on mount, before its resume runs again (brief 27).
    if (this.#status === "signedOut") return;
    this.#forget();
    this.#account = undefined;
    this.#status = "signedOut";
    this.#emit({ status: "signedOut", reason });
  }

  #checkIdle(): void {
    this.#idle.check();
  }

  // ---- The store (brief 27). A store that throws is treated as empty; it never breaks a sign-in.

  #load(): StoredSession | undefined {
    try {
      const kept = this.#store?.load();
      return kept && typeof kept.refreshToken === "string" && kept.refreshToken && typeof kept.username === "string" ? kept : undefined;
    } catch {
      return undefined;
    }
  }

  #save(session: StoredSession): void {
    try {
      this.#store?.save(session);
    } catch {
      // Nothing to do: the next reload signs in with the password.
    }
  }

  #forget(): void {
    try {
      this.#store?.clear();
    } catch {
      // As above.
    }
  }

  /** Write the refresh token, the account and the last activity (never the access token). */
  #persist(): void {
    if (!this.#store || this.#status !== "active" || !this.#refresh || !this.#account) return;
    const lastActivity = this.#idle.lastActivity;
    this.#savedActivity = lastActivity;
    const { username, name } = this.#account;
    this.#save({ refreshToken: this.#refresh, username, ...(name ? { name } : {}), lastActivity });
  }

  #assertActive(): void {
    if (this.#status === "expired") throw new SessionExpiredError();
    if (this.#status !== "active" || !this.#access) throw new SignedOutError();
  }

  #emit(event: AuthStatusEvent): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch (err) {
        // A broken listener must not break the session; surface it anyway.
        queueMicrotask(() => {
          throw err;
        });
      }
    }
  }
}

/** Wait for every promise to settle, or for `ms`, whichever comes first. Never rejects; leaves no timer behind. */
async function settleWithin(promises: readonly Promise<unknown>[], ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, Math.min(MAX_DELAY_MS, Math.max(0, ms)));
  });
  try {
    await Promise.race([Promise.allSettled(promises), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
