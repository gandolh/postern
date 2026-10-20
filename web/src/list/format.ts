// What a conversation row says: the senders in Gmail's style, the date, the
// label chips. Pure, with the clock, locale and time zone passed in.

import type { EmailAddress, Id } from "@postern/jmap";
import { DRAFT, SEEN, type ConversationMessage } from "../actions/conversation";

// ---- Senders ---------------------------------------------------------------

/** One name in the senders column. */
export type SenderPart =
  | { kind: "name"; text: string; unread: boolean; me: boolean }
  | { kind: "draft"; text: "Draft" }
  | { kind: "more" };

export interface SenderSummary {
  parts: SenderPart[];
  /** Messages in the conversation, shown as "(5)" when more than one. */
  count: number | null;
  /** The whole column as plain text: "me, Bob, Carol (5)". */
  text: string;
  /** "To:" (Sent) before the names. */
  prefix: string | null;
}

/** Whose messages the column names: the senders, or the recipients (Sent, Drafts). */
export type SenderMode = "from" | "to";

function firstName(address: EmailAddress): string {
  const name = (address.name ?? "").replace(/["']/g, "").trim();
  if (name) return name.split(/\s+/)[0] ?? name;
  return address.email.split("@")[0] ?? address.email;
}

function fullName(address: EmailAddress): string {
  const name = (address.name ?? "").replace(/^["']|["']$/g, "").trim();
  return name || address.email;
}

function isMe(address: EmailAddress, me: string): boolean {
  return address.email.toLowerCase() === me.toLowerCase();
}

interface Participant {
  key: string;
  address: EmailAddress | null;
  draft: boolean;
  unread: boolean;
}

function participants(messages: readonly ConversationMessage[], mode: SenderMode, me: string): Participant[] {
  const byKey = new Map<string, Participant>();
  for (const m of messages) {
    const unread = m.keywords[SEEN] !== true;
    if (mode === "from" && m.keywords[DRAFT] === true) {
      const p = byKey.get("\u0000draft") ?? { key: "\u0000draft", address: null, draft: true, unread: false };
      byKey.set(p.key, p);
      continue;
    }
    const addresses = (mode === "from" ? m.from : m.to) ?? [];
    const list = mode === "from" ? addresses.slice(0, 1) : addresses;
    if (list.length === 0 && mode === "from") {
      const p = byKey.get("\u0000unknown") ?? { key: "\u0000unknown", address: { name: "(no sender)", email: "" }, draft: false, unread };
      p.unread ||= unread;
      byKey.set(p.key, p);
    }
    for (const address of list) {
      const key = isMe(address, me) ? "\u0000me" : address.email.toLowerCase();
      const p = byKey.get(key) ?? { key, address, draft: false, unread: false };
      p.unread ||= unread;
      byKey.set(key, p);
    }
  }
  // The draft, if any, goes last, as Gmail shows it.
  const all = [...byKey.values()];
  return [...all.filter((p) => !p.draft), ...all.filter((p) => p.draft)];
}

/**
 * Gmail's senders column: "Bob Baker" for one sender, first names for
 * several ("me, Bob, Carol"), the first and last two around "…" past three,
 * and the message count when more than one: "me, Bob (3)". "me" is `me`, the
 * signed-in address. In "to" mode (Sent) the recipients, after "To:".
 */
export function summarizeSenders(messages: readonly ConversationMessage[], me: string, mode: SenderMode = "from"): SenderSummary {
  const people = participants(messages, mode, me);
  const many = people.length > 1;
  const named = (p: Participant): SenderPart => {
    if (p.draft) return { kind: "draft", text: "Draft" };
    const address = p.address as EmailAddress;
    if (p.key === "\u0000me") return { kind: "name", text: "me", unread: p.unread, me: true };
    if (p.key === "\u0000unknown") return { kind: "name", text: "(no sender)", unread: p.unread, me: false };
    return { kind: "name", text: many ? firstName(address) : fullName(address), unread: p.unread, me: false };
  };
  let parts: SenderPart[];
  if (people.length > 3) {
    const first = people[0] as Participant;
    parts = [named(first), { kind: "more" }, ...people.slice(-2).map(named)];
  } else {
    parts = people.map(named);
  }
  const count = messages.length > 1 ? messages.length : null;
  const prefix = mode === "to" ? "To:" : null;
  const names = parts.map((p) => (p.kind === "more" ? "…" : p.text)).join(", ").replace(", …,", " …");
  const text = `${prefix ? `${prefix} ` : ""}${names || (mode === "to" ? "(no recipients)" : "(no sender)")}${count ? ` (${count})` : ""}`;
  return { parts, count, text, prefix };
}

// ---- Dates -------------------------------------------------------------------

export interface DateOptions {
  locale?: string | string[];
  /** IANA zone; the browser's when omitted. */
  timeZone?: string;
}

function dayKey(date: Date, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(date);
}

/**
 * The list's date: the time for today ("14:05" / "2:05 PM"), the day and
 * month this year ("Oct 9"), the full numeric date before ("10/9/2025",
 * "2025-10-09", per locale).
 */
export function formatListDate(iso: string, now: Date, options: DateOptions = {}): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const { locale, timeZone } = options;
  const today = dayKey(now, timeZone);
  const day = dayKey(date, timeZone);
  if (day === today) return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(date);
  if (day.slice(0, 4) === today.slice(0, 4)) return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone }).format(date);
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "numeric", day: "numeric", timeZone }).format(date);
}

/** The date in full, for the tooltip: "Friday, October 9, 2026 at 2:05 PM". */
export function formatFullDate(iso: string, options: DateOptions = {}): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(options.locale, { dateStyle: "full", timeStyle: "short", timeZone: options.timeZone }).format(date);
}

// ---- Label chips -------------------------------------------------------------

/** What a chip needs to know about a label. */
export interface ChipLabel {
  id: Id;
  /** "Work/Clients" for a user label, "Inbox" for the Inbox. */
  title: string;
  system: string | null;
}

/**
 * The chips on a row: the conversation's labels other than the one being
 * viewed. System labels are hidden, except the Inbox outside the Inbox (as
 * Gmail shows it in All Mail and under a label). Ordered as `labels` is.
 */
export function chipLabels(labelIds: readonly Id[], labels: readonly ChipLabel[], currentId: Id | undefined): ChipLabel[] {
  const ids = new Set(labelIds);
  return labels.filter((l) => ids.has(l.id) && l.id !== currentId && (l.system === null || l.system === "inbox"));
}

// ---- Search highlights -------------------------------------------------------

/** A run of snippet text, highlighted or not. */
export interface HighlightRun {
  text: string;
  mark: boolean;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * A SearchSnippet's subject or preview (HTML with <mark>) as plain text runs,
 * to render as React text: no HTML from the server ever reaches the DOM.
 * Any tag other than <mark> is dropped.
 */
export function parseHighlights(html: string): HighlightRun[] {
  const runs: HighlightRun[] = [];
  let mark = false;
  for (const part of html.split(/(<\/?mark\b[^>]*>)/i)) {
    if (/^<mark\b/i.test(part)) {
      mark = true;
      continue;
    }
    if (/^<\/mark/i.test(part)) {
      mark = false;
      continue;
    }
    const text = decodeEntities(part.replace(/<[^>]*>/g, ""));
    if (!text) continue;
    const prev = runs[runs.length - 1];
    if (prev && prev.mark === mark) prev.text += text;
    else runs.push({ text, mark });
  }
  return runs;
}
