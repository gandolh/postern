// RFC 8620 (JMAP core) data shapes: the session, requests and responses, and
// the standard /get, /changes, /set, /query and /queryChanges arguments.

/** A JMAP object id (RFC 8620 §1.2). */
export type Id = string;

/** An RFC 3339 date-time in UTC with a `Z` suffix (RFC 8620 §1.4). */
export type UTCDate = string;

/** An RFC 3339 date-time with any offset (RFC 8620 §1.4). */
export type DateTime = string;

/** A JSON Pointer patch: keys are paths, values replace (null removes). RFC 8620 §5.3. */
export type PatchObject = Record<string, unknown>;

/** `[name, arguments, methodCallId]`, as sent and received. */
export type Invocation = [name: string, args: Record<string, unknown>, callId: string];

/** A back-reference to an earlier call's result (RFC 8620 §3.7). */
export interface ResultReferenceObject {
  resultOf: string;
  name: string;
  path: string;
}

/** The body POSTed to `apiUrl`. */
export interface JmapRequestBody {
  using: string[];
  methodCalls: Invocation[];
  createdIds?: Record<Id, Id>;
}

/** The body returned from `apiUrl`. */
export interface JmapResponseBody {
  methodResponses: Invocation[];
  createdIds?: Record<Id, Id>;
  sessionState: string;
}

/** The `urn:ietf:params:jmap:core` capability: the server's limits (RFC 8620 §2). */
export interface CoreCapability {
  maxSizeUpload: number;
  maxConcurrentUpload: number;
  maxSizeRequest: number;
  maxConcurrentRequests: number;
  maxCallsInRequest: number;
  maxObjectsInGet: number;
  maxObjectsInSet: number;
  collationAlgorithms: string[];
}

/** One account in the session. */
export interface Account {
  name: string;
  isPersonal: boolean;
  isReadOnly: boolean;
  accountCapabilities: Record<string, Record<string, unknown>>;
}

/** The session resource exactly as the server returns it (RFC 8620 §2). */
export interface SessionObject {
  capabilities: Record<string, Record<string, unknown>>;
  accounts: Record<Id, Account>;
  primaryAccounts: Record<string, Id>;
  username: string;
  apiUrl: string;
  downloadUrl: string;
  uploadUrl: string;
  eventSourceUrl: string;
  state: string;
}

/** RFC 7807 problem details, as returned for request-level errors. */
export interface ProblemDetails {
  type: string;
  status?: number;
  title?: string;
  detail?: string;
  /** Set on `urn:ietf:params:jmap:error:limit`: which limit was hit. */
  limit?: string;
  [key: string]: unknown;
}

/** A SetError (RFC 8620 §5.3), returned per object in `notCreated` and friends. */
export interface SetError {
  type: SetErrorType;
  description?: string | null;
  /** On `invalidProperties`: the offending properties. */
  properties?: string[];
  /** On `alreadyExists` (Email/import, SieveScript/set): the existing id. */
  existingId?: Id;
  [key: string]: unknown;
}

/** SetError types from RFC 8620, 8621 and 9661. Other strings pass through unchanged. */
export type SetErrorType =
  | "forbidden"
  | "overQuota"
  | "tooLarge"
  | "rateLimit"
  | "notFound"
  | "invalidPatch"
  | "willDestroy"
  | "invalidProperties"
  | "singleton"
  | "alreadyExists"
  | "mailboxHasChild"
  | "mailboxHasEmail"
  | "blobNotFound"
  | "tooManyKeywords"
  | "tooManyMailboxes"
  | "invalidEmail"
  | "tooManyRecipients"
  | "noRecipients"
  | "invalidRecipients"
  | "forbiddenMailFrom"
  | "forbiddenFrom"
  | "forbiddenToSend"
  | "cannotUnsend"
  | "invalidSieve"
  | "sieveIsActive"
  | "addressBookHasContents"
  | (string & {});

// ---- Standard method arguments and responses (RFC 8620 §5) -----------------

/** `Foo/get` arguments. `ids: null` (or omitted) fetches all, where the type allows it. */
export interface GetArgs<T> {
  accountId: Id;
  ids?: Id[] | null;
  properties?: (keyof T & string)[] | null;
}

export interface GetResponse<T> {
  accountId: Id;
  state: string;
  list: T[];
  /** Stalwart returns `null` instead of `[]` on some methods (SearchSnippet/get). */
  notFound: Id[] | null;
}

export interface ChangesArgs {
  accountId: Id;
  sinceState: string;
  maxChanges?: number | null;
}

export interface ChangesResponse {
  accountId: Id;
  oldState: string;
  newState: string;
  hasMoreChanges: boolean;
  created: Id[];
  updated: Id[];
  destroyed: Id[];
}

/** `/changes` responses for types that report `updatedProperties` (Mailbox, Quota). */
export interface ChangesWithPropertiesResponse extends ChangesResponse {
  updatedProperties?: string[] | null;
}

export interface SetArgs<T, C = Partial<T>> {
  accountId: Id;
  ifInState?: string | null;
  create?: Record<Id, C> | null;
  update?: Record<Id, PatchObject> | null;
  destroy?: Id[] | null;
}

export interface SetResponse<T> {
  accountId: Id;
  oldState: string | null;
  newState: string;
  /** Created objects keyed by creation id, with the server-set properties. */
  created: Record<Id, Partial<T> & { id: Id }> | null;
  updated: Record<Id, Partial<T> | null> | null;
  destroyed: Id[] | null;
  notCreated: Record<Id, SetError> | null;
  notUpdated: Record<Id, SetError> | null;
  notDestroyed: Record<Id, SetError> | null;
}

/** A `Foo/query` sort comparator (RFC 8620 §5.5). */
export interface Comparator<P extends string = string> {
  property: P;
  isAscending?: boolean;
  collation?: string;
}

/** A filter: a condition, or AND/OR/NOT over nested filters. */
export type Filter<C> = C | FilterOperator<C>;

export interface FilterOperator<C> {
  operator: "AND" | "OR" | "NOT";
  conditions: Filter<C>[];
}

export interface QueryArgs<C, S extends Comparator = Comparator> {
  accountId: Id;
  filter?: Filter<C> | null;
  sort?: S[] | null;
  position?: number;
  anchor?: Id | null;
  anchorOffset?: number;
  limit?: number | null;
  calculateTotal?: boolean;
}

export interface QueryResponse {
  accountId: Id;
  queryState: string;
  canCalculateChanges: boolean;
  position: number;
  ids: Id[];
  total?: number;
  limit?: number;
}

export interface QueryChangesArgs<C, S extends Comparator = Comparator> {
  accountId: Id;
  filter?: Filter<C> | null;
  sort?: S[] | null;
  sinceQueryState: string;
  maxChanges?: number | null;
  upToId?: Id | null;
  calculateTotal?: boolean;
}

export interface AddedItem {
  id: Id;
  index: number;
}

export interface QueryChangesResponse {
  accountId: Id;
  oldQueryState: string;
  newQueryState: string;
  total?: number;
  removed: Id[];
  added: AddedItem[];
}

// ---- Blobs (RFC 8620 §6) ---------------------------------------------------

/** The upload endpoint's JSON response. */
export interface UploadResponse {
  accountId: Id;
  blobId: Id;
  type: string;
  size: number;
}
