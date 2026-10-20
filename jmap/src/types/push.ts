// RFC 8620 §7: StateChange, PushSubscription and PushVerification.

import type { Id, UTCDate } from "./core.js";
import type { EmailFilter } from "./mail.js";

/** Type name → state string for one account. */
export type TypeState = Record<string, string>;

/**
 * A push notification: which types changed, per account, and their new state
 * strings. Compare each state with the one you hold; fetch `/changes` only when
 * they differ.
 */
export interface StateChange {
  "@type": "StateChange";
  changed: Record<Id, TypeState>;
}

/** Client-generated Web Push encryption keys (RFC 8291), URL-safe base64. */
export interface PushKeys {
  p256dh: string;
  auth: string;
}

/** A Web Push endpoint registered with the server (RFC 8620 §7.2). */
export interface PushSubscription {
  id: Id;
  deviceClientId: string;
  url: string;
  keys: PushKeys | null;
  verificationCode: string | null;
  expires: UTCDate | null;
  types: string[] | null;
  /** Stalwart's `urn:ietf:params:jmap:emailpush` extension (brief 16): see EmailPushConfig. */
  emailPush?: Record<Id, EmailPushConfig> | null;
}

/**
 * Stalwart's `urn:ietf:params:jmap:emailpush` extension (0.16.25), keyed by
 * account id on a PushSubscription: on delivery of a message that matches
 * `filter`, the server pushes an `EmailPush` object carrying the listed Email
 * `properties` instead of a bare StateChange. The payload is encrypted to the
 * subscription's `keys` (RFC 8291), so the push service sees only ciphertext.
 */
export interface EmailPushConfig {
  filter?: EmailFilter | null;
  /** Email properties to include: "id", "threadId", "from", "subject", ... (keep it small: the payload is capped at 4 KB). */
  properties?: string[];
  urgency?: "very-low" | "low" | "normal" | "high";
}

/** The push for new mail under an `emailPush` config (Stalwart's extension). */
export interface EmailPushObject {
  "@type": "EmailPush";
  accountId: Id;
  /** Partial Email objects with the configured properties. */
  emails: Record<string, unknown>[];
  state?: string;
}

/** The first message the server POSTs to a new subscription's URL. */
export interface PushVerification {
  "@type": "PushVerification";
  pushSubscriptionId: Id;
  verificationCode: string;
}

/** The arguments to create a PushSubscription. */
export interface PushSubscriptionCreate {
  deviceClientId: string;
  url: string;
  keys?: PushKeys | null;
  expires?: UTCDate | null;
  types?: string[] | null;
  emailPush?: Record<Id, EmailPushConfig> | null;
}
