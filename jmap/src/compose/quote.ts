// Quoting the message replied to or forwarded, Gmail-style, built from TEXT
// only. The original's HTML is untrusted and never copied: the quote is its
// plain text (or the text of its sanitised HTML), escaped into a blockquote.
//
//   On Tue, Oct 20, 2026 at 10:05 AM, Bob Baker <bob@x.test> wrote:
//   > the original, line by line
//
// The HTML forms carry Gmail's class names (gmail_quote, gmail_attr), so other
// clients fold them, plus postern_quote for Postern's own composer.

import type { EmailAddress } from "../types/mail.js";
import { formatAddress } from "./address.js";

/** The parts of the original a quote shows. */
export interface QuoteSource {
  from: readonly EmailAddress[] | null;
  to?: readonly EmailAddress[] | null;
  cc?: readonly EmailAddress[] | null;
  subject?: string | null;
  /** The Date header (Email.sentAt); receivedAt when it has none. */
  sentAt?: string | null;
  receivedAt: string;
}

export interface QuoteFormat {
  /** BCP 47 locale for the date. Default "en-US". */
  locale?: string;
  /** IANA zone for the date. Default: the runtime's. */
  timeZone?: string;
}

/** A quote in both forms: appended to the HTML body and to the text body. */
export interface Quote {
  html: string;
  text: string;
}

/** Class marking Postern's quote block in the HTML it sends (and finds again in a draft). */
export const QUOTE_CLASS = "postern_quote";
/** Gmail's border for a quote, inline so every client shows it. A fixed string: no message data goes in it. */
export const QUOTE_BLOCK_STYLE = "margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for HTML content and attribute values. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] as string);
}

/** Plain text as HTML: one <div> per line, blank lines as <div><br></div> (what the composer's editor makes). */
export function textToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines.map((line) => (line === "" ? "<div><br></div>" : `<div>${escapeHtml(line)}</div>`)).join("");
}

/** "Tue, Oct 20, 2026 at 10:05 AM" (en-US), or the locale's equivalent. Empty for a bad date. */
export function formatQuoteDate(iso: string, format: QuoteFormat = {}): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const locale = format.locale ?? "en-US";
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: format.timeZone }).format(date);
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: format.timeZone }).format(date);
  return `${day} at ${time}`;
}

/** "On <date>, <name> <addr> wrote:" */
export function quoteAttribution(message: QuoteSource, format: QuoteFormat = {}): string {
  const when = formatQuoteDate(message.sentAt ?? message.receivedAt, format);
  const from = message.from?.[0];
  const who = from ? formatPerson(from) : "someone";
  return when ? `On ${when}, ${who} wrote:` : `${who} wrote:`;
}

/** "Bob Baker <bob@x.test>" without RFC quoting (for reading, not for headers). */
function formatPerson(a: EmailAddress): string {
  const name = a.name?.trim();
  return name ? `${name} <${a.email}>` : a.email;
}

/** Each line prefixed with "> " (">" alone for a blank line; quoted lines get one more ">"). */
export function quotePlainText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (line.startsWith(">") ? `>${line}` : line === "" ? ">" : `> ${line}`))
    .join("\n");
}

/** The quote under a reply: the attribution line, then the original's text in a blockquote. */
export function replyQuote(message: QuoteSource, originalText: string, format: QuoteFormat = {}): Quote {
  const attribution = quoteAttribution(message, format);
  const body = originalText.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  return {
    text: `${attribution}\n${quotePlainText(body)}`,
    html:
      `<div class="gmail_quote ${QUOTE_CLASS}">` +
      `<div class="gmail_attr">${escapeHtml(attribution)}<br></div>` +
      `<blockquote class="gmail_quote" style="${QUOTE_BLOCK_STYLE}">${textToHtml(body)}</blockquote>` +
      `</div>`,
  };
}

/** The header lines Gmail puts above a forwarded message. */
export function forwardHeaderLines(message: QuoteSource, format: QuoteFormat = {}): string[] {
  const list = (addresses: readonly EmailAddress[] | null | undefined) => (addresses ?? []).map(formatAddress).join(", ");
  const lines = [
    "---------- Forwarded message ---------",
    `From: ${list(message.from)}`,
    `Date: ${formatQuoteDate(message.sentAt ?? message.receivedAt, format)}`,
    `Subject: ${message.subject ?? ""}`,
  ];
  if (message.to?.length) lines.push(`To: ${list(message.to)}`);
  if (message.cc?.length) lines.push(`Cc: ${list(message.cc)}`);
  return lines;
}

/** The forwarded message: Gmail's header block, a blank line, then the original's text (not quoted with ">"). */
export function forwardQuote(message: QuoteSource, originalText: string, format: QuoteFormat = {}): Quote {
  const lines = forwardHeaderLines(message, format);
  const body = originalText.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  return {
    text: `${lines.join("\n")}\n\n${body}`,
    html:
      `<div class="gmail_quote ${QUOTE_CLASS}">` +
      `<div class="gmail_attr">${lines.map(escapeHtml).join("<br>")}<br></div><br>` +
      textToHtml(body) +
      `</div>`,
  };
}

/** Lines of the user's own text that mention an attachment ("attached", "attachment", "enclosed"), as Gmail warns. */
const ATTACHMENT_WORDS = /\b(?:attach(?:ed|ing|ment|ments)|enclos(?:ed|ing))\b/i;

/**
 * Whether the user's text says something is attached. Pass only what the user
 * wrote: not the quoted original or the forwarded message, whose own
 * "attached" says nothing about this message. Quoted lines ("> ...") are
 * skipped too.
 */
export function mentionsAttachment(ownText: string): boolean {
  return ownText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .some((line) => !line.trimStart().startsWith(">") && ATTACHMENT_WORDS.test(line));
}
