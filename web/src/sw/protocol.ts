// The messages between the service worker and Postern's pages (brief 16).
// Shared by both sides; nothing here touches a token, and nothing here may:
// the worker never holds one (corpus/wiki/security.md, Tokens).
//
//   worker -> page   PUSH_VERIFICATION   Stalwart's verification code for a new PushSubscription
//   worker -> page   OPEN                a notification was clicked: show this route
//   worker -> page   WILL_NOTIFY         (over a MessageChannel) "will you show this new mail yourself?"
//   page -> worker   SKIP_WAITING        a new worker may take over (only while signed out)

export const PUSH_VERIFICATION = "postern:push-verification";
export const OPEN = "postern:open";
export const WILL_NOTIFY = "postern:will-notify";
export const SKIP_WAITING = "SKIP_WAITING";

export interface PushVerificationMessage {
  type: typeof PUSH_VERIFICATION;
  pushSubscriptionId: string;
  verificationCode: string;
}

export interface OpenMessage {
  type: typeof OPEN;
  /** An app route, `#inbox` or `#inbox/<threadId>`. */
  hash: string;
}

/** Asked on a MessageChannel; the page answers `{ willNotify: boolean }` on the port. */
export interface WillNotifyMessage {
  type: typeof WILL_NOTIFY;
}

export type WorkerMessage = PushVerificationMessage | OpenMessage | WillNotifyMessage;

/** Reads a message from the worker; null for anything else. */
export function readWorkerMessage(data: unknown): WorkerMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m["type"]) {
    case PUSH_VERIFICATION:
      return typeof m["pushSubscriptionId"] === "string" && typeof m["verificationCode"] === "string"
        ? { type: PUSH_VERIFICATION, pushSubscriptionId: m["pushSubscriptionId"], verificationCode: m["verificationCode"] }
        : null;
    case OPEN:
      return typeof m["hash"] === "string" && isNotificationHash(m["hash"]) ? { type: OPEN, hash: m["hash"] } : null;
    case WILL_NOTIFY:
      return { type: WILL_NOTIFY };
    default:
      return null;
  }
}

/** The only routes a notification opens: the Inbox, or a conversation in it. */
export function isNotificationHash(hash: string): boolean {
  return /^#inbox(\/[A-Za-z0-9_-]{1,255})?$/.test(hash);
}
