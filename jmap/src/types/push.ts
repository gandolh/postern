// RFC 8620 §7: StateChange, PushSubscription and PushVerification.

import type { Id, UTCDate } from "./core.js";

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
}
