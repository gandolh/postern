// The JMAP session (RFC 8620 §2): accounts, capabilities, limits and the
// endpoint URLs, rebased onto the configured base.

import { Capability } from "./capabilities.js";
import { JmapNoAccountError, JmapProtocolError } from "./errors.js";
import type { Account, CoreCapability, Id, SessionObject } from "./types/core.js";
import { expandTemplate, normalizeBase, rebaseUrl } from "./url.js";

/** Used when the server leaves a core limit out. Stalwart 0.16 sends all of them. */
export const DEFAULT_LIMITS: CoreCapability = {
  maxSizeUpload: 50_000_000,
  maxConcurrentUpload: 4,
  maxSizeRequest: 10_000_000,
  maxConcurrentRequests: 4,
  maxCallsInRequest: 16,
  maxObjectsInGet: 500,
  maxObjectsInSet: 500,
  collationAlgorithms: [],
};

/** Variables for the download URL template. */
export interface DownloadParams {
  blobId: Id;
  /** The file name the server puts in `Content-Disposition`. */
  name: string;
  /** The `Content-Type` to serve; Stalwart uses `application/octet-stream` when omitted. */
  type?: string;
  /** Defaults to the mail account. */
  accountId?: Id;
}

/** Variables for the event-source URL template. */
export interface EventSourceParams {
  /** Type names, or `*` for all. */
  types: readonly string[] | "*";
  closeafter: "state" | "no";
  /** Seconds between pings; 0 for none. Stalwart raises anything lower to 30. */
  ping: number;
}

/**
 * A fetched session. Endpoint URLs are already rebased onto the client's base
 * (`/webmail-api/jmap/...`), templates intact.
 */
export class Session {
  /** The session exactly as the server sent it (Stalwart's own absolute URLs). */
  readonly raw: SessionObject;
  readonly apiUrl: string;
  readonly downloadUrl: string;
  readonly uploadUrl: string;
  readonly eventSourceUrl: string;
  readonly username: string;
  /** Changes when accounts or capabilities change. Compare with `sessionState` on API responses. */
  readonly state: string;
  readonly capabilities: Readonly<Record<string, Record<string, unknown>>>;
  readonly accounts: Readonly<Record<Id, Account>>;
  readonly primaryAccounts: Readonly<Record<string, Id>>;
  /** The primary mail account (`primaryAccounts["urn:ietf:params:jmap:mail"]`). */
  readonly accountId: Id;
  /** The core capability's limits. */
  readonly limits: Readonly<CoreCapability>;

  /** @throws JmapNoAccountError when there is no mail account (Stalwart's answer to a missing or bad credential is 200 with no accounts). */
  constructor(raw: SessionObject, base: string) {
    for (const key of ["apiUrl", "downloadUrl", "uploadUrl", "eventSourceUrl"] as const) {
      if (typeof raw[key] !== "string") throw new JmapProtocolError(`Session has no ${key}`);
    }
    const accountId = raw.primaryAccounts?.[Capability.Mail];
    if (!accountId) throw new JmapNoAccountError("The session has no mail account; not signed in?");
    const b = normalizeBase(base);
    this.raw = raw;
    this.apiUrl = rebaseUrl(raw.apiUrl, b);
    this.downloadUrl = rebaseUrl(raw.downloadUrl, b);
    this.uploadUrl = rebaseUrl(raw.uploadUrl, b);
    this.eventSourceUrl = rebaseUrl(raw.eventSourceUrl, b);
    this.username = raw.username;
    this.state = raw.state;
    this.capabilities = raw.capabilities ?? {};
    this.accounts = raw.accounts ?? {};
    this.primaryAccounts = raw.primaryAccounts;
    this.accountId = accountId;
    const core = (raw.capabilities?.[Capability.Core] ?? {}) as Partial<CoreCapability>;
    this.limits = { ...DEFAULT_LIMITS, ...core };
  }

  /** Whether the server advertises a capability. */
  hasCapability(urn: string): boolean {
    return urn in this.capabilities;
  }

  /** The primary account for a capability, falling back to the mail account. */
  accountIdFor(urn: string | undefined): Id {
    return (urn && this.primaryAccounts[urn]) || this.accountId;
  }

  /** An account's capability object, e.g. the Sieve extensions or submission limits. */
  accountCapability<T = Record<string, unknown>>(urn: string, accountId: Id = this.accountId): T | undefined {
    return this.accounts[accountId]?.accountCapabilities[urn] as T | undefined;
  }

  /** The upload URL for an account. */
  uploadUrlFor(accountId: Id = this.accountId): string {
    return expandTemplate(this.uploadUrl, { accountId });
  }

  /**
   * A download URL. Stalwart serves every download with
   * `Content-Disposition: attachment; filename="<name>"`, and `type` (sent as
   * `?accept=`) only sets `Content-Type`. The URL needs the Authorization header.
   */
  downloadUrlFor(params: DownloadParams): string {
    return expandTemplate(this.downloadUrl, {
      accountId: params.accountId ?? this.accountId,
      blobId: params.blobId,
      name: params.name,
      type: params.type ?? "application/octet-stream",
    });
  }

  /** The event-source URL with its query filled in. */
  eventSourceUrlFor(params: EventSourceParams): string {
    return expandTemplate(this.eventSourceUrl, {
      types: params.types === "*" ? "*" : params.types.join(","),
      closeafter: params.closeafter,
      ping: String(params.ping),
    });
  }
}
