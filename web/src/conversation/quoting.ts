// Quoting helpers for brief 08's reply and forward. Pure, text only: the
// composer's editor is the app's DOM, so a message's HTML must never be
// pasted into it. Quote as text (these), or carry the sanitised HTML as a
// string into the outgoing MIME without rendering it.

import type { EmailAddress } from "@postern/jmap";
import { fullAddress } from "./people";

export interface QuotedMessage {
  from: readonly EmailAddress[] | null;
  to?: readonly EmailAddress[] | null;
  cc?: readonly EmailAddress[] | null;
  subject?: string | null;
  sentAt?: string | null;
  receivedAt: string;
}

function when(message: QuotedMessage, locale?: string): string {
  const date = new Date(message.sentAt ?? message.receivedAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale ?? "en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

/** "On Tue, Oct 20, 2026, 10:05 AM, Bob Baker <bob@x.test> wrote:" */
export function quoteAttribution(message: QuotedMessage, locale?: string): string {
  const from = message.from?.[0];
  return `On ${when(message, locale)}, ${from ? fullAddress(from) : "someone"} wrote:`;
}

/** Each line prefixed with "> " (">" alone for blank lines; already-quoted lines get ">" more). */
export function quotePlainText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (line.startsWith(">") ? `>${line}` : line === "" ? ">" : `> ${line}`))
    .join("\n");
}

/** The block Gmail puts above a forwarded message. */
export function forwardHeaderText(message: QuotedMessage, locale?: string): string {
  const list = (addresses: readonly EmailAddress[] | null | undefined) => (addresses ?? []).map(fullAddress).join(", ");
  const lines = ["---------- Forwarded message ---------", `From: ${list(message.from)}`, `Date: ${when(message, locale)}`, `Subject: ${message.subject ?? ""}`];
  if (message.to?.length) lines.push(`To: ${list(message.to)}`);
  if (message.cc?.length) lines.push(`Cc: ${list(message.cc)}`);
  return lines.join("\n");
}

const BLOCKS = /^(p|div|br|li|tr|h[1-6]|blockquote|pre|table|ul|ol|hr|section|article|header|footer)$/i;

/** The text of a sanitised (detached) message body, with line breaks where blocks end. For quoting an HTML message as text. */
export function htmlBodyText(body: Element): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out += (node.textContent ?? "").replace(/\s+/g, " ");
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.nodeName;
    if (/^(style|script|head|title)$/i.test(tag)) return;
    if (/^br$/i.test(tag)) {
      out += "\n";
      return;
    }
    const block = BLOCKS.test(tag);
    if (block && !out.endsWith("\n")) out += "\n";
    for (const child of Array.from(node.childNodes)) walk(child);
    if (block && !out.endsWith("\n")) out += "\n";
  };
  walk(body);
  return out
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
