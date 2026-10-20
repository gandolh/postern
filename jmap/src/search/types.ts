import type { Id } from "../types/core.js";
import type { EmailFilter } from "../types/mail.js";

/** Mailbox ids by role: what `in:inbox`, `in:spam` and the default scope need. */
export interface SearchRoles {
  inbox?: Id;
  sent?: Id;
  drafts?: Id;
  /** Spam. */
  junk?: Id;
  trash?: Id;
  archive?: Id;
}

export interface ParseSearchOptions {
  /** "Today": older_than: and newer_than: count back from it. Injected so parsing stays deterministic. */
  now: Date;
  /** A label's mailbox id from the name typed after `label:` or `in:` (see {@link createLabelResolver}), or undefined. */
  labels: (name: string) => Id | undefined;
  roles: SearchRoles;
  /** The user's offset from UTC in minutes (east positive), for `before:` and `after:` dates. Default 0. */
  utcOffsetMinutes?: number;
  /** The user's own address, for `from:me` and `to:me`. */
  me?: string;
}

export type SearchWarningKind =
  /** An operator Postern does not know: searched as plain words. */
  | "unknown-operator"
  /** A Gmail operator Stalwart cannot honour (header search, categories, ...): searched as plain words. */
  | "unsupported"
  /** The operator's value is not understood (a date, a size); the operator was left out. */
  | "bad-value"
  /** The operator had no value; it was left out. */
  | "empty-operator"
  /** No label has that name; the search matches nothing for it. */
  | "unknown-label"
  /** A mailbox role the account does not have (`in:sent` without a Sent label). */
  | "missing-mailbox"
  | "unterminated-quote"
  | "unbalanced-parenthesis";

export interface SearchWarning {
  kind: SearchWarningKind;
  /** The text of the search it is about. */
  token: string;
  /** A sentence for the person typing. */
  message: string;
}

export interface ParsedSearch {
  /** The `Email/query` filter, default scope included. Null: every message. Never an empty AND/OR operator except one that deliberately matches nothing. */
  filter: EmailFilter | null;
  warnings: SearchWarning[];
  /** The words and phrases the person is looking for (not negated), without quotes: for highlighting and "recent searches". */
  terms: string[];
  /**
   * Which list the results belong in: "trash" when the search names only
   * Trash, "spam" when it names only Spam, otherwise "normal".
   */
  scope: "normal" | "trash" | "spam";
}

/** The Advanced search form, ready to be written back as operators. */
export interface AdvancedSearchFields {
  from?: string;
  to?: string;
  subject?: string;
  /** "Has the words". */
  words?: string;
  /** "Doesn't have". */
  notWords?: string;
  size?: { comparison: "larger" | "smaller"; amount: number; unit: "B" | "K" | "M" };
  /** "Date within N days of a date" (date as YYYY-MM-DD). */
  dateWithin?: { days: number; date: string };
  /** A label's name or path; "anywhere" is `in:anywhere`. */
  label?: string;
  hasAttachment?: boolean;
}
