// The shape every seed message takes before it is imported.

/** A system label by JMAP role, or a user label by path ("label:Work/Clients"). */
export type MailboxRef = "inbox" | "sent" | "drafts" | "junk" | "trash" | "archive" | `label:${string}`;

export const ROLES = ["inbox", "sent", "drafts", "junk", "trash", "archive"] as const;

export interface SeedEmail {
  account: "alice" | "bob";
  /** Unique within the account; used in logs and MIME boundaries. */
  key: string;
  /** Without angle brackets. Unique within the account; the seed's idempotency key. */
  messageId: string;
  /** The conversation it belongs to. Stalwart threads on references AND subject. */
  thread: string;
  mailboxes: MailboxRef[];
  keywords: string[];
  receivedAt: Date;
  /** The RFC 5322 bytes, CRLF. A function so the large one is built only on import. */
  build: () => string;
  /** Set on the hostile set. */
  hostile?: string;
}

/**
 * Every date in the seed is relative to this fixed moment, never to the
 * clock, so two runs produce the same mail.
 */
export const ANCHOR = new Date("2026-10-01T09:00:00Z");

export function daysBefore(days: number, hour = 9, minute = 0): Date {
  const d = new Date(ANCHOR.getTime() - days * 86_400_000);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

export function at(iso: string): Date {
  return new Date(iso);
}
