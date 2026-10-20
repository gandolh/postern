// The Email/set create object for a draft: headers, keywords, mailbox, and an
// explicit bodyStructure.
//
//   multipart/mixed                 only with attachments
//     multipart/alternative         only with an HTML body
//       text/plain                  always: the text alternative
//       multipart/related           only with inline images
//         text/html
//         image/png  cid:…          inline images the HTML uses
//     application/pdf               attachments (uploaded, or reused from a forwarded message by blobId)
//
// Plain-text mode sends only text/plain (plus attachments). JMAP drafts are
// immutable: a save creates a new Email and destroys the old one, so the same
// builder serves every save and the final send.

import type { Id, UTCDate } from "../types/core.js";
import type { EmailAddress, EmailBodyPart, EmailCreate } from "../types/mail.js";

/** A file in the message, by blob: uploaded, or a part of another message (forward). */
export interface DraftAttachment {
  blobId: Id;
  /** Media type, e.g. "application/pdf". */
  type: string;
  /** File name shown to the recipient. */
  name: string | null;
  size?: number;
  /** Inline images only: the Content-ID the HTML refers to as `cid:<cid>` (bare, no brackets). */
  cid?: string | null;
}

/** Everything a draft says. */
export interface DraftContent {
  from: EmailAddress;
  to: readonly EmailAddress[];
  cc: readonly EmailAddress[];
  bcc: readonly EmailAddress[];
  replyTo?: readonly EmailAddress[] | null;
  subject: string;
  /** The HTML body, or null in plain-text mode. Must be sanitised already (the composer's own output). */
  html: string | null;
  /** The text body: the plain-text alternative, or the whole body in plain-text mode. */
  text: string;
  /** Files attached. */
  attachments: readonly DraftAttachment[];
  /** Inline images. Only those the HTML uses (`cid:`) are sent; the rest are dropped. */
  inline?: readonly DraftAttachment[];
  /** Message-ID without brackets. Keep it across saves so the draft keeps its conversation. */
  messageId?: string | null;
  inReplyTo?: readonly string[] | null;
  references?: readonly string[] | null;
  /** The Date header. Omit it: Stalwart stamps the time of each save. */
  sentAt?: UTCDate | null;
}

export interface DraftPlacement {
  /** The Drafts mailbox id. */
  draftsMailboxId: Id;
  /** Extra keywords besides `$draft` and `$seen`. */
  keywords?: Record<string, true>;
}

/** The cids an HTML body refers to (`cid:` URLs in src attributes), bare and lower-cased. */
export function referencedCids(html: string): Set<string> {
  const out = new Set<string>();
  const re = /\bsrc\s*=\s*(["']?)cid:([^"'\s>]+)\1/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    let cid = m[2] as string;
    try {
      cid = decodeURIComponent(cid);
    } catch {
      // keep it as written
    }
    out.add(cid.toLowerCase());
  }
  return out;
}

function blobPart(a: DraftAttachment, disposition: "attachment" | "inline"): Partial<EmailBodyPart> {
  const part: Partial<EmailBodyPart> = { blobId: a.blobId, type: a.type || "application/octet-stream", disposition };
  if (a.name) part.name = a.name;
  if (disposition === "inline" && a.cid) part.cid = a.cid;
  return part;
}

/** The bodyStructure and bodyValues for a draft. Part ids "text" and "html" carry the bodies. */
export function buildBody(content: Pick<DraftContent, "html" | "text" | "attachments" | "inline">): {
  bodyStructure: Partial<EmailBodyPart>;
  bodyValues: Record<string, { value: string }>;
} {
  const bodyValues: Record<string, { value: string }> = { text: { value: content.text } };
  const textPart: Partial<EmailBodyPart> = { partId: "text", type: "text/plain" };
  let main: Partial<EmailBodyPart> = textPart;

  if (content.html !== null) {
    bodyValues["html"] = { value: content.html };
    const htmlPart: Partial<EmailBodyPart> = { partId: "html", type: "text/html" };
    const used = referencedCids(content.html);
    const seen = new Set<string>();
    const inline = (content.inline ?? []).filter((a) => {
      const cid = a.cid?.toLowerCase();
      if (!cid || !used.has(cid) || seen.has(cid)) return false;
      seen.add(cid);
      return true;
    });
    const htmlSide: Partial<EmailBodyPart> = inline.length
      ? { type: "multipart/related", subParts: [htmlPart, ...inline.map((a) => blobPart(a, "inline"))] as EmailBodyPart[] }
      : htmlPart;
    main = { type: "multipart/alternative", subParts: [textPart, htmlSide] as EmailBodyPart[] };
  }

  const bodyStructure: Partial<EmailBodyPart> = content.attachments.length
    ? { type: "multipart/mixed", subParts: [main, ...content.attachments.map((a) => blobPart(a, "attachment"))] as EmailBodyPart[] }
    : main;
  return { bodyStructure, bodyValues };
}

const list = (addresses: readonly EmailAddress[] | null | undefined): EmailAddress[] | null =>
  addresses && addresses.length ? addresses.map((a) => ({ name: a.name?.trim() || null, email: a.email.trim() })) : null;

/** The Email/set create object for a draft in the Drafts mailbox, with `$draft` and `$seen`. */
export function buildDraftEmail(content: DraftContent, placement: DraftPlacement): EmailCreate {
  const { bodyStructure, bodyValues } = buildBody(content);
  const email: EmailCreate = {
    mailboxIds: { [placement.draftsMailboxId]: true },
    keywords: { ...placement.keywords, $draft: true, $seen: true },
    from: [{ name: content.from.name?.trim() || null, email: content.from.email }],
    subject: content.subject,
    bodyStructure,
    bodyValues,
  };
  // Stalwart 0.16.25 refuses `null` for an address header on create
  // (invalidProperties): leave empty ones out.
  const to = list(content.to);
  const cc = list(content.cc);
  const bcc = list(content.bcc);
  const replyTo = list(content.replyTo);
  if (to) email.to = to;
  if (cc) email.cc = cc;
  if (bcc) email.bcc = bcc;
  if (replyTo) email.replyTo = replyTo;
  if (content.messageId) email.messageId = [content.messageId];
  if (content.inReplyTo?.length) email.inReplyTo = [...content.inReplyTo];
  if (content.references?.length) email.references = [...content.references];
  if (content.sentAt) email.sentAt = content.sentAt;
  return email;
}

/** The parts of a message a forward carries: its attachments, reused by blobId (no download, no upload). */
export function forwardAttachments(parts: readonly Pick<EmailBodyPart, "blobId" | "type" | "name" | "size">[] | null | undefined): DraftAttachment[] {
  const out: DraftAttachment[] = [];
  for (const p of parts ?? []) {
    if (!p.blobId) continue;
    out.push({ blobId: p.blobId, type: p.type || "application/octet-stream", name: p.name ?? null, size: p.size });
  }
  return out;
}

/**
 * Read a draft's files back from its bodyStructure: inline images (a cid,
 * inside multipart/related) and attachments (everything else that is not one
 * of the two bodies).
 */
export function draftParts(bodyStructure: EmailBodyPart | null | undefined): { attachments: DraftAttachment[]; inline: DraftAttachment[] } {
  const attachments: DraftAttachment[] = [];
  const inline: DraftAttachment[] = [];
  const bodiesSeen = { text: false, html: false };
  const walk = (part: EmailBodyPart, inRelated: boolean) => {
    if (part.subParts?.length) {
      const related = part.type.toLowerCase() === "multipart/related";
      for (const sub of part.subParts) walk(sub, related || inRelated);
      return;
    }
    if (!part.blobId) return;
    const type = part.type.toLowerCase();
    const isAttachment = part.disposition?.toLowerCase() === "attachment";
    if (!isAttachment && type === "text/plain" && !bodiesSeen.text) {
      bodiesSeen.text = true;
      return;
    }
    if (!isAttachment && type === "text/html" && !bodiesSeen.html) {
      bodiesSeen.html = true;
      return;
    }
    const file: DraftAttachment = { blobId: part.blobId, type: part.type, name: part.name, size: part.size };
    if (part.cid && !isAttachment && (inRelated || part.disposition?.toLowerCase() === "inline")) inline.push({ ...file, cid: part.cid });
    else attachments.push(file);
  };
  if (bodyStructure) walk(bodyStructure, false);
  return { attachments, inline };
}
