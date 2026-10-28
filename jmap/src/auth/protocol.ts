// Stalwart 0.16.25's sign-in endpoints, one function each. Verified against
// its source (crates/http/src/auth/oauth/) and the dev server on 2026-10-20;
// corpus/wiki/sign-in.md has the shapes. Nothing here keeps
// state: the caller holds the tokens.

import { isAbortError } from "../errors.js";
import type { FetchLike } from "../http.js";
import { SignInError, TokenEndpointError } from "./errors.js";

/** Postern's OAuth client ID. Stalwart does not look it up (registration is off); it must match between the two calls. */
export const POSTERN_CLIENT_ID = "postern";

/** What Postern asks for. Stalwart's tokens carry no scope, so this is advisory. */
export const DEFAULT_SCOPE = "openid offline_access urn:ietf:params:oauth:scope:mail urn:ietf:params:oauth:scope:contacts";

/** The body of `POST /api/auth` for the authorization-code flow. */
export interface AuthCodeRequest {
  accountName: string;
  accountSecret: string;
  /** The TOTP code, on the retry after `mfaRequired`. */
  mfaToken?: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  codeChallenge: string;
}

/** What `POST /api/auth` can answer, minus `failure` (thrown as `SignInError("rejected")`). */
export type AuthCodeResult = { type: "authenticated"; code: string } | { type: "mfaRequired" };

/** The parts of a token response Postern keeps. `id_token` is dropped. */
export interface TokenGrant {
  accessToken: string;
  /** Absent on most refreshes: Stalwart renews it only near its own expiry. */
  refreshToken: string | undefined;
  /** Seconds. */
  expiresIn: number;
}

/** `GET /auth/userinfo`. */
export interface UserInfo {
  /** Stalwart's account id. */
  sub: string;
  /** The address the account signs in with. */
  email: string;
  /** The account's description, shown as the display name. */
  name: string | undefined;
}

async function post(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, { method: "POST", ...init });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new SignInError("network", "Could not reach the mail server", { cause: err });
  }
}

function retryAfter(res: Response): number | undefined {
  const value = Number(res.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch (err) {
    if (isAbortError(err)) throw err;
    return undefined;
  }
}

/**
 * Exchange credentials for an authorization code: `POST {baseUrl}/api/auth`.
 * Returns the code, or `mfaRequired` when the password was right and TOTP is
 * on; then call again with `mfaToken` (and the password again).
 * @throws SignInError
 */
export async function requestAuthCode(
  fetchImpl: FetchLike,
  baseUrl: string,
  request: AuthCodeRequest,
  signal?: AbortSignal,
): Promise<AuthCodeResult> {
  const body: Record<string, string> = {
    type: "authCode",
    accountName: request.accountName,
    accountSecret: request.accountSecret,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: "S256",
  };
  if (request.scope) body["scope"] = request.scope;
  if (request.mfaToken !== undefined) body["mfaToken"] = request.mfaToken;
  const res = await post(fetchImpl, `${baseUrl}/api/auth`, {
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 429) {
    await res.body?.cancel().catch(() => undefined);
    throw new SignInError("rateLimited", "Too many sign-in requests", { status: 429, retryAfter: retryAfter(res) });
  }
  if (res.status === 403) {
    await res.body?.cancel().catch(() => undefined);
    throw new SignInError("blocked", "This network is blocked after too many failed sign-ins", { status: 403 });
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new SignInError("server", `Sign-in request failed with HTTP ${res.status}`, { status: res.status });
  }
  const answer = (await readJson(res)) as { type?: unknown; client_code?: unknown } | undefined;
  switch (answer?.type) {
    case "authenticated":
      if (typeof answer.client_code === "string" && answer.client_code) return { type: "authenticated", code: answer.client_code };
      break;
    case "mfaRequired":
      return { type: "mfaRequired" };
    case "failure":
      throw new SignInError("rejected", "The mail server refused the sign-in", { status: res.status });
  }
  throw new SignInError("server", "Unexpected answer from the sign-in endpoint", { status: res.status });
}

function form(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

async function tokenRequest(fetchImpl: FetchLike, baseUrl: string, params: Record<string, string>, signal?: AbortSignal): Promise<TokenGrant> {
  const res = await post(fetchImpl, `${baseUrl}/auth/token`, {
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form(params),
    signal,
  });
  if (res.status === 429) {
    await res.body?.cancel().catch(() => undefined);
    throw new SignInError("rateLimited", "Too many token requests", { status: 429, retryAfter: retryAfter(res) });
  }
  if (res.status === 403) {
    await res.body?.cancel().catch(() => undefined);
    throw new SignInError("blocked", "This network is blocked after too many failed sign-ins", { status: 403 });
  }
  const answer = (await readJson(res)) as
    | { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; error?: unknown }
    | undefined;
  if (res.status === 400 || res.status === 401) {
    throw new TokenEndpointError(res.status, typeof answer?.error === "string" ? answer.error : "unknown_error");
  }
  if (!res.ok) throw new SignInError("server", `Token request failed with HTTP ${res.status}`, { status: res.status });
  if (typeof answer?.access_token !== "string" || !answer.access_token || typeof answer.expires_in !== "number") {
    throw new SignInError("server", "Unexpected answer from the token endpoint", { status: res.status });
  }
  return {
    accessToken: answer.access_token,
    refreshToken: typeof answer.refresh_token === "string" && answer.refresh_token ? answer.refresh_token : undefined,
    expiresIn: answer.expires_in,
  };
}

/**
 * Swap an authorization code for tokens: `POST {baseUrl}/auth/token`. The code
 * is single use and expires in 10 minutes; `clientId` and `redirectUri` must
 * be the ones sent to `/api/auth`.
 * @throws TokenEndpointError, SignInError (network, rateLimited, blocked, server)
 */
export function exchangeCode(
  fetchImpl: FetchLike,
  baseUrl: string,
  params: { code: string; clientId: string; redirectUri: string; codeVerifier: string },
  signal?: AbortSignal,
): Promise<TokenGrant> {
  return tokenRequest(
    fetchImpl,
    baseUrl,
    {
      grant_type: "authorization_code",
      code: params.code,
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    },
    signal,
  );
}

/**
 * A new access token for a refresh token: `POST {baseUrl}/auth/token`.
 * `refreshToken` in the result is usually undefined; keep the old one then.
 * @throws TokenEndpointError (the session is over), SignInError (transient)
 */
export function refreshGrant(
  fetchImpl: FetchLike,
  baseUrl: string,
  params: { refreshToken: string; clientId: string },
  signal?: AbortSignal,
): Promise<TokenGrant> {
  return tokenRequest(fetchImpl, baseUrl, { grant_type: "refresh_token", refresh_token: params.refreshToken, client_id: params.clientId }, signal);
}

/**
 * The signed-in account: `GET {baseUrl}/auth/userinfo`.
 * @throws SignInError (network, server)
 */
export async function fetchUserInfo(fetchImpl: FetchLike, baseUrl: string, accessToken: string, signal?: AbortSignal): Promise<UserInfo> {
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/auth/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new SignInError("network", "Could not reach the mail server", { cause: err });
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new SignInError("server", `Account lookup failed with HTTP ${res.status}`, { status: res.status });
  }
  const info = (await readJson(res)) as { sub?: unknown; email?: unknown; preferred_username?: unknown; name?: unknown } | undefined;
  const email = typeof info?.email === "string" ? info.email : typeof info?.preferred_username === "string" ? info.preferred_username : undefined;
  if (typeof info?.sub !== "string" || !email) throw new SignInError("server", "Unexpected answer from the account lookup", { status: res.status });
  return { sub: info.sub, email, name: typeof info.name === "string" && info.name ? info.name : undefined };
}
