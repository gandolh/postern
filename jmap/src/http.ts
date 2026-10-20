// The one place that talks HTTP: adds Authorization, runs the 401 hook, and
// turns failures into typed errors. Session, API, upload, download and the
// event source all go through here. Headers are never logged or kept.

import {
  JmapHttpError,
  JmapNetworkError,
  JmapRequestError,
  JmapUnauthorizedError,
  REQUEST_ERROR_PREFIX,
  isAbortError,
} from "./errors.js";
import type { ProblemDetails } from "./types/core.js";

/**
 * Supplies credentials per request. Brief 04 implements it with Bearer tokens
 * and refresh; tests use Basic. The client never stores what it returns.
 */
export interface AuthProvider {
  /** The full `Authorization` header value, e.g. `Bearer abc` or `Basic ...`. Called before every request. */
  authorization(): Promise<string> | string;
  /**
   * Called when the server answers 401. Return true to retry the request once
   * with a fresh `authorization()` (after refreshing a token, say); false to
   * fail with `JmapUnauthorizedError`.
   */
  onUnauthorized?(): Promise<boolean> | boolean;
}

/** The subset of `fetch` the client uses. Pass your own for tests or instrumentation. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Anything with an HTTP status, so the 401 retry works for fetch and for upload transports alike. */
export interface HasStatus {
  status: number;
}

/**
 * Run `attempt` with the current authorization; on a 401, ask the provider
 * and retry once if it says so. Returns the last result, whatever its status.
 */
export async function withAuthRetry<R extends HasStatus>(
  auth: AuthProvider,
  attempt: (authorization: string) => Promise<R>,
  discard?: (result: R) => Promise<void> | void,
): Promise<R> {
  const first = await attempt(await auth.authorization());
  if (first.status !== 401 || !auth.onUnauthorized) return first;
  await discard?.(first);
  if (!(await auth.onUnauthorized())) return first;
  return attempt(await auth.authorization());
}

/** Parse a problem-details body, or undefined if it is not one. */
export function parseProblem(text: string, contentType: string | null): ProblemDetails | undefined {
  if (!contentType || !/json/i.test(contentType)) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string") {
      return value as ProblemDetails;
    }
  } catch {
    // Not JSON after all.
  }
  return undefined;
}

/** Map a non-2xx status and body to the right error class. */
export function httpError(status: number, statusText: string, text: string, contentType: string | null): Error {
  const problem = parseProblem(text, contentType);
  if (status === 401) return new JmapUnauthorizedError(problem);
  if (problem?.type.startsWith(REQUEST_ERROR_PREFIX)) return new JmapRequestError(status, problem);
  const detail = problem?.detail ?? problem?.title ?? statusText;
  return new JmapHttpError(status, `HTTP ${status}${detail ? `: ${detail}` : ""}`, problem);
}

/** Throw the mapped error for a non-2xx response (reading its body). */
export async function assertOk(res: Response): Promise<Response> {
  if (res.ok) return res;
  const text = await res.text().catch(() => "");
  throw httpError(res.status, res.statusText, text, res.headers.get("content-type"));
}

/** Call fetch, mapping thrown errors (not aborts) to JmapNetworkError. */
export async function safeFetch(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new JmapNetworkError(`Network error: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

/**
 * An authorized fetch: sets `Authorization`, retries once on 401 if the
 * provider asks, and throws `JmapUnauthorizedError` if it is still 401. Other
 * statuses are returned for the caller to judge (see `assertOk`).
 */
export async function authorizedFetch(
  fetchImpl: FetchLike,
  auth: AuthProvider,
  url: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<Response> {
  const res = await withAuthRetry(
    auth,
    (authorization) => safeFetch(fetchImpl, url, { ...init, headers: { ...init.headers, authorization } }),
    (r) => r.body?.cancel().catch(() => undefined),
  );
  if (res.status === 401) await assertOk(res);
  return res;
}
