/**
 * `@postern/jmap`: the only code in Postern that speaks JMAP. A typed client
 * for Stalwart: sign-in and in-memory tokens, session and URL rebasing, batched requests with
 * back-references, the mail, submission, sieve, quota, push and contacts
 * methods, blobs, a state cache, and a fetch-based push reader.
 *
 * Plain TypeScript: no React, no DOM.
 *
 * @packageDocumentation
 */

export { JmapClient, type JmapClientOptions } from "./client.js";
export type { AuthProvider, FetchLike } from "./http.js";
export { Session, DEFAULT_LIMITS, type DownloadParams, type EventSourceParams } from "./session.js";
export { rebaseUrl, expandTemplate, templateVariables, normalizeBase } from "./url.js";
export { Capability, capabilityOf, type CapabilityUrn } from "./capabilities.js";

export {
  AuthSession,
  REFRESH_LEAD_MS,
  BEFORE_SIGN_OUT_MS,
  IdleTimeout,
  IDLE_TIMEOUT_MS,
  SignInError,
  TokenEndpointError,
  SessionExpiredError,
  SignedOutError,
  POSTERN_CLIENT_ID,
  DEFAULT_SCOPE,
  requestAuthCode,
  exchangeCode,
  refreshGrant,
  fetchUserInfo,
  createPkce,
  pkceChallenge,
  type AuthSessionOptions,
  type AuthStatus,
  type AuthStatusEvent,
  type AuthAccount,
  type SignInOutcome,
  type SignInOptions,
  type SignOutReason,
  type BeforeSignOutHook,
  type IdleTimeoutOptions,
  type SignInFailure,
  type AuthCodeRequest,
  type AuthCodeResult,
  type TokenGrant,
  type UserInfo,
  type PkcePair,
} from "./auth/index.js";

export {
  RequestBuilder,
  RequestResult,
  CallHandle,
  ResultRef,
  type CallArgs,
  type Refable,
  type HashRefs,
  type ResponseOf,
  type RequestExecutor,
} from "./request.js";

export {
  JmapError,
  JmapNetworkError,
  JmapHttpError,
  JmapUnauthorizedError,
  JmapRequestError,
  JmapMethodError,
  JmapCannotCalculateChangesError,
  JmapSetError,
  JmapLimitError,
  JmapProtocolError,
  JmapNoAccountError,
  isAbortError,
  type MethodErrorType,
  type RequestErrorType,
} from "./errors.js";

export type { CallOptions, ChangesOptions, MethodCaller } from "./methods/caller.js";
export { MailboxMethods, ThreadMethods, findByRole, mailboxPath } from "./methods/mailbox.js";
export { EmailMethods, SearchSnippetMethods, escapePointer, type QueryAndGetResult } from "./methods/email.js";
export { IdentityMethods, EmailSubmissionMethods, VacationResponseMethods } from "./methods/submission.js";
export { SieveScriptMethods, QuotaMethods, type Uploader } from "./methods/sieve.js";
export {
  PushSubscriptionMethods,
  isPushVerification,
  type CreatedPushSubscription,
} from "./methods/push-subscription.js";
export { AddressBookMethods, ContactCardMethods } from "./methods/contacts.js";
export * from "./contacts/index.js";

export {
  BlobMethods,
  fetchUploadTransport,
  bodySize,
  normalizeCid,
  cidParts,
  cidDownloads,
  resolveCid,
  type UploadBody,
  type UploadProgress,
  type UploadRequest,
  type UploadResult,
  type UploadTransport,
  type UploadOptions,
  type CidSource,
} from "./blob.js";

export {
  StateCache,
  ObjectStore,
  QueryStore,
  syncObjects,
  syncQuery,
  stableStringify,
  type SyncResult,
  type QuerySyncResult,
  type SyncableType,
  type SyncObjectsOptions,
  type QueryMethod,
  type QuerySyncArgs,
} from "./cache.js";

export {
  PushReader,
  DEFAULT_PUSH_TYPES,
  type PushStatus,
  type PushSource,
  type PushReaderOptions,
} from "./push/reader.js";
export { EventStreamParser, type ServerSentEvent, type EventStreamHandlers } from "./push/event-stream.js";
export { backoffDelay, DEFAULT_BACKOFF, type BackoffOptions } from "./push/backoff.js";

export type * from "./types/core.js";
export type * from "./types/mail.js";
export type * from "./types/submission.js";
export type * from "./types/sieve.js";
export type * from "./types/contacts.js";
export type * from "./types/push.js";
export type * from "./types/methods.js";

export {
  parseSearch,
  formatSearch,
  createLabelResolver,
  normalizeLabelName,
  parseSearchDate,
  parseSize,
  subtractAge,
  type AdvancedSearchFields,
  type ParsedSearch,
  type ParseSearchOptions,
  type SearchRoles,
  type SearchWarning,
  type SearchWarningKind,
} from "./search/index.js";

export * from "./compose/index.js";

export * from "./sieve/index.js";
