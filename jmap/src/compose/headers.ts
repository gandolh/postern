// Threading headers for a reply or forward (RFC 5322 §3.6.4). JMAP gives
// message ids without angle brackets, and takes them back the same way.

import type { Email } from "../types/mail.js";

/** What threading needs from the message replied to. */
export type ThreadingSource = Pick<Email, "messageId" | "inReplyTo" | "references">;

export interface ThreadingHeaders {
  /** `In-Reply-To`: the original's Message-ID, or null when it has none. */
  inReplyTo: string[] | null;
  /** `References`: the original's References (or its In-Reply-To), then its Message-ID. */
  references: string[] | null;
}

/** References lists past this many ids keep the first and the newest (RFC 5322 suggests trimming, Gmail does). */
export const MAX_REFERENCES = 20;

/** `In-Reply-To` and `References` for a reply to, or forward of, `original`. */
export function threadingHeaders(original: ThreadingSource): ThreadingHeaders {
  const own = (original.messageId ?? []).filter(Boolean);
  const parents = original.references?.length
    ? original.references
    : original.inReplyTo?.length === 1
      ? original.inReplyTo
      : [];
  const seen = new Set<string>();
  const all: string[] = [];
  for (const id of [...parents, ...own]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    all.push(id);
  }
  const references = all.length > MAX_REFERENCES ? [all[0] as string, ...all.slice(all.length - (MAX_REFERENCES - 1))] : all;
  return {
    inReplyTo: own.length ? [own[0] as string] : null,
    references: references.length ? references : null,
  };
}

/**
 * A new Message-ID (without brackets) at the sender's domain. Postern sets one
 * per composer and keeps it across draft saves, so a draft keeps its
 * conversation while it is replaced on every save.
 */
export function newMessageId(fromEmail: string, unique: string): string {
  const at = fromEmail.lastIndexOf("@");
  const domain = at >= 0 && at < fromEmail.length - 1 ? fromEmail.slice(at + 1) : "postern.invalid";
  const local = unique.replace(/[^A-Za-z0-9.-]/g, "").replace(/^\.+|\.+$/g, "") || "postern";
  return `${local}@${domain.toLowerCase()}`;
}
