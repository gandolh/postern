// RFC 9661 (JMAP for Sieve Scripts) and RFC 9425 (JMAP Quotas).

import type { Comparator, GetArgs, Id, QueryArgs, QueryChangesArgs, SetArgs, SetError } from "./core.js";

// ---- SieveScript (RFC 9661) ------------------------------------------------

/** A Sieve script. The source is a blob: upload it, then reference `blobId`. */
export interface SieveScript {
  id: Id;
  name: string | null;
  blobId: Id;
  /** At most one script is active. Change it with `onSuccessActivateScript`. */
  isActive: boolean;
}

export type SieveScriptCreate = { name?: string | null; blobId: Id };
export type SieveScriptGetArgs = GetArgs<SieveScript>;

export interface SieveScriptSetArgs extends SetArgs<SieveScript, SieveScriptCreate> {
  /** Activate this script (an id or `#creationId`) if every change succeeds. */
  onSuccessActivateScript?: Id | null;
  /** Deactivate the active script if every change succeeds. Runs before activation. */
  onSuccessDeactivateScript?: boolean;
}

export interface SieveScriptFilterCondition {
  name?: string;
  isActive?: boolean;
}

export type SieveScriptComparator = Comparator<"name" | "isActive">;
export type SieveScriptQueryArgs = QueryArgs<SieveScriptFilterCondition, SieveScriptComparator>;

export interface SieveScriptValidateArgs {
  accountId: Id;
  blobId: Id;
}

export interface SieveScriptValidateResponse {
  accountId: Id;
  /** `null` when valid. RFC 9661 says `invalidSieve`; Stalwart 0.16 sends `invalidScript`. */
  error: SetError | null;
}

// ---- Quota (RFC 9425) ------------------------------------------------------

/** A usage limit, in octets or object counts. */
export interface Quota {
  id: Id;
  resourceType: "count" | "octets" | (string & {});
  used: number;
  hardLimit: number;
  warnLimit?: number | null;
  softLimit?: number | null;
  scope: "account" | "domain" | "global" | (string & {});
  name: string;
  /** The data types this quota applies to (Mail, Calendar, ...). */
  types: string[];
  description?: string | null;
}

export interface QuotaFilterCondition {
  name?: string;
  scope?: string;
  resourceType?: string;
  type?: string;
}

export type QuotaComparator = Comparator<"name" | "used">;
export type QuotaGetArgs = GetArgs<Quota>;
export type QuotaQueryArgs = QueryArgs<QuotaFilterCondition, QuotaComparator>;
export type QuotaQueryChangesArgs = QueryChangesArgs<QuotaFilterCondition, QuotaComparator>;

/** Unused: quotas are server-managed. Kept so the method map is complete. */
export type QuotaSetArgs = SetArgs<Quota, never>;
