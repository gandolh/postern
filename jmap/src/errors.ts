// Every failure the client reports, as a typed class. The JMAP type strings
// are kept exactly as the server sent them.

import type { ProblemDetails, SetError } from "./types/core.js";

/** The base class. `instanceof JmapError` catches everything this package throws, except aborts. */
export class JmapError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** `fetch` itself failed: offline, DNS, connection refused, CORS. No HTTP status. */
export class JmapNetworkError extends JmapError {}

/** The server answered with a non-2xx status that is not a JMAP request error. */
export class JmapHttpError extends JmapError {
  readonly status: number;
  /** The problem-details body, when the server sent `application/problem+json`. */
  readonly problem: ProblemDetails | undefined;

  constructor(status: number, message: string, problem?: ProblemDetails) {
    super(message);
    this.status = status;
    this.problem = problem;
  }
}

/** HTTP 401 after the auth provider's `onUnauthorized` hook declined (or failed) to recover. */
export class JmapUnauthorizedError extends JmapHttpError {
  constructor(problem?: ProblemDetails) {
    super(401, problem?.detail ?? "Unauthorized", problem);
  }
}

/** Request-level error types (RFC 8620 §3.6.1), without the URN prefix. */
export type RequestErrorType = "unknownCapability" | "notJSON" | "notRequest" | "limit" | (string & {});

export const REQUEST_ERROR_PREFIX = "urn:ietf:params:jmap:error:";

/**
 * A request-level error (RFC 8620 §3.6.1): the whole POST was rejected with
 * problem details whose type is `urn:ietf:params:jmap:error:*`.
 *
 * Stalwart 0.16 answers an unknown capability with `notRequest`, not
 * `unknownCapability`.
 */
export class JmapRequestError extends JmapHttpError {
  /** The full type URN, as sent. */
  readonly type: string;
  /** The type without the URN prefix: `limit`, `notRequest`... */
  readonly errorType: RequestErrorType;
  /** On `limit`: which limit (`maxCallsInRequest`, `maxSizeRequest`...). */
  readonly limit: string | undefined;

  constructor(status: number, problem: ProblemDetails) {
    const errorType = problem.type.startsWith(REQUEST_ERROR_PREFIX)
      ? problem.type.slice(REQUEST_ERROR_PREFIX.length)
      : problem.type;
    super(status, `JMAP request error ${errorType}${problem.limit ? ` (${problem.limit})` : ""}`, problem);
    this.type = problem.type;
    this.errorType = errorType;
    this.limit = typeof problem.limit === "string" ? problem.limit : undefined;
  }
}

/** Method-level error types (RFC 8620 §3.6.2 and the per-method ones). Others pass through. */
export type MethodErrorType =
  | "serverUnavailable"
  | "serverFail"
  | "serverPartialFail"
  | "unknownMethod"
  | "invalidArguments"
  | "invalidResultReference"
  | "forbidden"
  | "accountNotFound"
  | "accountNotSupportedByMethod"
  | "accountReadOnly"
  | "requestTooLarge"
  | "cannotCalculateChanges"
  | "anchorNotFound"
  | "unsupportedSort"
  | "unsupportedFilter"
  | "tooManyChanges"
  | "stateMismatch"
  | "fromAccountNotFound"
  | "fromAccountNotSupportedByMethod"
  | (string & {});

/** One method call answered `["error", {type, description}, callId]`. */
export class JmapMethodError extends JmapError {
  readonly type: MethodErrorType;
  readonly description: string | undefined;
  /** The method that failed, and its call id within the request. */
  readonly method: string;
  readonly callId: string;
  /** The full error arguments (some types carry extra properties). */
  readonly details: Record<string, unknown>;

  constructor(method: string, callId: string, details: Record<string, unknown>) {
    const type = typeof details["type"] === "string" ? details["type"] : "serverFail";
    const description = typeof details["description"] === "string" ? details["description"] : undefined;
    super(`${method} failed: ${type}${description ? `: ${description}` : ""}`);
    this.type = type;
    this.description = description;
    this.method = method;
    this.callId = callId;
    this.details = details;
  }
}

/**
 * `/changes` or `/queryChanges` cannot bridge from the state you hold. Drop the
 * cached data and fetch it again.
 */
export class JmapCannotCalculateChangesError extends JmapMethodError {}

/** Build the right method-error class for a type string. */
export function methodError(method: string, callId: string, details: Record<string, unknown>): JmapMethodError {
  if (details["type"] === "cannotCalculateChanges") return new JmapCannotCalculateChangesError(method, callId, details);
  return new JmapMethodError(method, callId, details);
}

/** A per-object failure from a /set or /import, thrown by wrappers that act on one object. */
export class JmapSetError extends JmapError {
  readonly type: string;
  readonly id: string;
  readonly error: SetError;

  constructor(method: string, id: string, error: SetError) {
    super(`${method} ${id}: ${error.type}${error.description ? `: ${error.description}` : ""}`);
    this.type = error.type;
    this.id = id;
    this.error = error;
  }
}

/**
 * The client refused to send something the server would reject: a chain of
 * back-referenced calls longer than `maxCallsInRequest`, or a split that would
 * break a reference.
 */
export class JmapLimitError extends JmapError {
  readonly limit: string;

  constructor(limit: string, message: string) {
    super(message);
    this.limit = limit;
  }
}

/** The server's answer did not have the expected shape. */
export class JmapProtocolError extends JmapError {}

/** The session has no mail account: not signed in (Stalwart answers 200 with no accounts). */
export class JmapNoAccountError extends JmapError {}

/** True for an AbortSignal abort, which this package rethrows untouched. */
export function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && "name" in err && (err.name === "AbortError" || err.name === "TimeoutError")
  );
}
