// Per-device label settings: a label's colour and "show if unread". JMAP
// Mailbox has no such fields, so they live in this browser's localStorage,
// keyed per account (`postern:<username>:labels`). Owner decision
// 2026-10-20: per device ("this browser only"). Not secret.
//
// Storage may be blocked or full (private window, site data off): every
// read and write is wrapped, and the preferences then live in memory for the
// page's life. Subscribe to hear changes (useLabelPrefs wraps it for React).
//
//   getLabelPrefs(username)                   { [labelId]: { color?, showIfUnread? } }
//   getLabelPref(username, labelId)           one label's, {} when none
//   setLabelPref(username, labelId, patch)    merge; `color: null` / `showIfUnread: false` clear
//   forgetLabelPrefs(username, labelId)       a label was deleted
//   subscribeLabelPrefs(fn)                   -> unsubscribe
//   LABEL_COLORS, isLabelColor(value)         the palette keys

import type { Id } from "@postern/jmap";

export const LABEL_COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export function isLabelColor(value: unknown): value is LabelColor {
  return typeof value === "string" && (LABEL_COLORS as readonly string[]).includes(value);
}

export interface LabelPref {
  /** A palette key; absent = no colour. */
  color?: LabelColor;
  /** In the navigation only while it has unread conversations. */
  showIfUnread?: boolean;
}

export type LabelPrefs = Readonly<Record<Id, LabelPref>>;

export interface LabelPrefPatch {
  color?: LabelColor | null;
  showIfUnread?: boolean;
}

const EMPTY: LabelPrefs = Object.freeze({});
const memory = new Map<string, LabelPrefs>();
const listeners = new Set<() => void>();

export function storageKey(username: string): string {
  return `postern:${username}:labels`;
}

function sanitize(raw: unknown): LabelPrefs {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY;
  const out: Record<Id, LabelPref> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value !== "object" || value === null) continue;
    const v = value as Record<string, unknown>;
    const pref: LabelPref = {};
    if (isLabelColor(v["color"])) pref.color = v["color"];
    if (v["showIfUnread"] === true) pref.showIfUnread = true;
    if (pref.color !== undefined || pref.showIfUnread) out[id] = pref;
  }
  return out;
}

function read(username: string): LabelPrefs | undefined {
  try {
    const text = window.localStorage.getItem(storageKey(username));
    return text === null ? undefined : sanitize(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function write(username: string, prefs: LabelPrefs): void {
  try {
    window.localStorage.setItem(storageKey(username), JSON.stringify(prefs));
  } catch {
    // Blocked or full: the in-memory copy still serves this page.
  }
}

/** Every label's preferences for the account. The same object until something changes. */
export function getLabelPrefs(username: string): LabelPrefs {
  const held = memory.get(username);
  if (held) return held;
  const prefs = read(username) ?? EMPTY;
  memory.set(username, prefs);
  return prefs;
}

export function getLabelPref(username: string, labelId: Id): LabelPref {
  return getLabelPrefs(username)[labelId] ?? {};
}

function publish(username: string, prefs: LabelPrefs): void {
  memory.set(username, prefs);
  write(username, prefs);
  for (const listener of [...listeners]) listener();
}

export function setLabelPref(username: string, labelId: Id, patch: LabelPrefPatch): void {
  const current = getLabelPrefs(username);
  const next: LabelPref = { ...current[labelId] };
  if ("color" in patch) {
    if (patch.color && isLabelColor(patch.color)) next.color = patch.color;
    else delete next.color;
  }
  if ("showIfUnread" in patch) {
    if (patch.showIfUnread) next.showIfUnread = true;
    else delete next.showIfUnread;
  }
  const { [labelId]: _old, ...rest } = current;
  publish(username, next.color !== undefined || next.showIfUnread ? { ...rest, [labelId]: next } : rest);
}

export function forgetLabelPrefs(username: string, labelId: Id): void {
  const current = getLabelPrefs(username);
  if (!(labelId in current)) return;
  const { [labelId]: _old, ...rest } = current;
  publish(username, rest);
}

export function subscribeLabelPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper: drop the in-memory copies so storage is read again. */
export function resetLabelPrefsCache(): void {
  memory.clear();
}
