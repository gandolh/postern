// Sign-in and session errors. None of them ever carries a password, a code or
// a token: messages are built from fixed strings and the server's error codes.

import { JmapError, JmapUnauthorizedError } from "../errors.js";

/**
 * Why a sign-in failed, as far as Stalwart lets us tell.
 *
 * - `rejected`: Stalwart answered `failure`. A wrong password, a wrong TOTP
 *   code, an unknown address, a disabled account and the attempt that trips
 *   the ban all look the same, on purpose.
 * - `rateLimited`: HTTP 429, too many anonymous requests from this IP.
 * - `blocked`: HTTP 403, this IP is banned after too many failures.
 * - `network`: no answer at all.
 * - `server`: anything else (5xx, a malformed answer, a 401 for a malformed request).
 */
export type SignInFailure = "rejected" | "rateLimited" | "blocked" | "network" | "server";

/** A sign-in attempt that did not produce tokens. */
export class SignInError extends JmapError {
  readonly reason: SignInFailure;
  /** The HTTP status, when there was one. */
  readonly status: number | undefined;
  /** Seconds to wait, from `Retry-After`, when the server sent one. */
  readonly retryAfter: number | undefined;

  constructor(reason: SignInFailure, message: string, options: { status?: number; retryAfter?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.reason = reason;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
  }
}

/**
 * The token endpoint said no (HTTP 400/401 with an OAuth `error`). On a
 * refresh this means the session is over: the refresh token expired, or the
 * password changed.
 */
export class TokenEndpointError extends JmapError {
  readonly status: number;
  /** The OAuth error code: `invalid_grant`, `invalid_client`, `access_denied`... */
  readonly error: string;

  constructor(status: number, error: string) {
    super(`Token endpoint refused: ${error} (HTTP ${status})`);
    this.status = status;
    this.error = error;
  }
}

/**
 * Thrown by `authorization()` once the session has expired (a refresh was
 * refused) and before the user signs in again. The session-expired dialog is
 * showing; callers can treat it like any 401.
 */
export class SessionExpiredError extends JmapUnauthorizedError {
  constructor() {
    super({ type: "about:blank", status: 401, title: "Session expired", detail: "The session expired; sign in again." });
  }
}

/** Thrown by `authorization()` after sign-out, or before any sign-in. */
export class SignedOutError extends JmapUnauthorizedError {
  constructor() {
    super({ type: "about:blank", status: 401, title: "Signed out", detail: "Not signed in." });
  }
}
