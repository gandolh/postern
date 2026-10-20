// Per-device preferences that have no other home (owner decision 2026-10-20:
// display settings live in this browser). Keyed by account in localStorage,
// versioned, every access wrapped, in-memory fallback.
//
// Where the rest lives, so nothing is stored twice:
//   theme, density, reading pane   prefs/display.ts (device-wide; needed before sign-in)
//   label colours                  labels/labelPrefs.ts
//   desktop notifications          notify/settings.ts
//   allowed image senders          render/allowance.ts
//
// To add a preference (brief 16 added swipeLeft / swipeRight): add a field to
// AccountPrefs, its default to DEFAULT_PREFS, a validator line in
// normalise(), and a getter/setter pair at the bottom. Bump PREFS_VERSION only
// for a change that cannot be read by the old normalise().

import { setAlwaysDisplayImages } from "../render/allowance";
import { setUndoSendDelay } from "../send/undoDelay";
import { isRecord, readRaw, writeRaw } from "./storage";

export const PREFS_VERSION = 1;
export const UNDO_SEND_SECONDS = [5, 10, 20, 30] as const;
export type UndoSendSeconds = (typeof UNDO_SEND_SECONDS)[number];
export type ImagesPreference = "ask" | "always";
/** What swiping a conversation row does on a touch screen (brief 16). "read" toggles read and unread. */
export const SWIPE_ACTIONS = ["archive", "delete", "read", "none"] as const;
export type SwipeAction = (typeof SWIPE_ACTIONS)[number];

export interface AccountPrefs {
  /** How long a sent message is held so Undo works. */
  undoSendSeconds: UndoSendSeconds;
  /** "ask": show external images per message or sender. "always": show them everywhere. */
  images: ImagesPreference;
  /** Keyboard shortcuts on or off (brief 14 reads it). */
  shortcuts: boolean;
  /** The identity new messages are sent from, when the composer has no better guess. null = the first one. */
  defaultIdentityId: string | null;
  /** Swiping a row to the left / to the right on a touch screen (brief 16). Gmail's default: both archive. */
  swipeLeft: SwipeAction;
  swipeRight: SwipeAction;
}

export const DEFAULT_PREFS: Readonly<AccountPrefs> = Object.freeze({
  undoSendSeconds: 5,
  images: "ask",
  shortcuts: true,
  defaultIdentityId: null,
  swipeLeft: "archive",
  swipeRight: "archive",
});

function swipeAction(value: unknown, fallback: SwipeAction): SwipeAction {
  return SWIPE_ACTIONS.find((a) => a === value) ?? fallback;
}

const PREFIX = "postern.prefs.";
const LAST = "postern.prefs.lastAccount";

let account: string | null = null;
let current: AccountPrefs = { ...DEFAULT_PREFS };
const listeners = new Set<(prefs: AccountPrefs) => void>();

function key(username: string): string {
  return `${PREFIX}${username.toLowerCase()}`;
}

/** Turn whatever was stored into valid prefs: bad fields fall back to their default. */
export function normalise(raw: unknown): AccountPrefs {
  if (!isRecord(raw) || raw["version"] !== PREFS_VERSION) return { ...DEFAULT_PREFS };
  const undo = raw["undoSendSeconds"];
  const images = raw["images"];
  const shortcuts = raw["shortcuts"];
  const identity = raw["defaultIdentityId"];
  return {
    undoSendSeconds: UNDO_SEND_SECONDS.find((s) => s === undo) ?? DEFAULT_PREFS.undoSendSeconds,
    images: images === "ask" || images === "always" ? images : DEFAULT_PREFS.images,
    shortcuts: typeof shortcuts === "boolean" ? shortcuts : DEFAULT_PREFS.shortcuts,
    defaultIdentityId: typeof identity === "string" && identity !== "" ? identity : null,
    swipeLeft: swipeAction(raw["swipeLeft"], DEFAULT_PREFS.swipeLeft),
    swipeRight: swipeAction(raw["swipeRight"], DEFAULT_PREFS.swipeRight),
  };
}

function apply(): void {
  setUndoSendDelay(current.undoSendSeconds * 1000);
  setAlwaysDisplayImages(current.images === "always");
}

function lastAccount(): string | null {
  const raw = readRaw(LAST);
  return typeof raw === "string" && raw !== "" ? raw : null;
}

/**
 * Load the prefs of the signed-in account and apply them (undo-send delay,
 * images). Call it once the account is known (PrefsHost does). Before that,
 * the prefs of the account last seen on this device are in force, so the first
 * send after a reload already honours the setting.
 */
export function setPrefsAccount(username: string | null): void {
  if (username !== null) writeRaw(LAST, username.toLowerCase());
  account = username === null ? null : username.toLowerCase();
  current = account === null ? { ...DEFAULT_PREFS } : normalise(readRaw(key(account)));
  apply();
  for (const l of [...listeners]) l(current);
}

/** The prefs in force. A new object after every change. */
export function getPrefs(): AccountPrefs {
  return current;
}

/** Change one or more prefs (invalid values are ignored), save, apply, notify. */
export function setPrefs(patch: Partial<AccountPrefs>): void {
  const next = normalise({ version: PREFS_VERSION, ...current, ...patch });
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  if (account !== null) writeRaw(key(account), { version: PREFS_VERSION, ...current });
  apply();
  for (const l of [...listeners]) l(current);
}

export function subscribePrefs(listener: (prefs: AccountPrefs) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Start-up: pick up the account last seen here. Safe to call more than once. */
export function startPrefs(): void {
  if (account === null) {
    const last = lastAccount();
    if (last !== null) {
      account = last;
      current = normalise(readRaw(key(last)));
      apply();
    }
  }
}

/** For tests: forget everything held in this module. */
export function resetPrefs(): void {
  account = null;
  current = { ...DEFAULT_PREFS };
  apply();
}

// ---- Named accessors (what other briefs import) ----------------------------

/** Keyboard shortcuts on? Brief 14: read this on each key press or subscribe. */
export function getShortcutsEnabled(): boolean {
  return current.shortcuts;
}

export function setShortcutsEnabled(on: boolean): void {
  setPrefs({ shortcuts: on });
}

/** Call `listener(enabled)` when shortcuts are switched on or off. */
export function subscribeShortcutsEnabled(listener: (enabled: boolean) => void): () => void {
  let last = current.shortcuts;
  return subscribePrefs((p) => {
    if (p.shortcuts !== last) {
      last = p.shortcuts;
      listener(last);
    }
  });
}

export function getDefaultIdentityId(): string | null {
  return current.defaultIdentityId;
}

/** Brief 16: what a swipe does, read when the swipe ends (so a change applies at once). */
export function getSwipeActions(): { left: SwipeAction; right: SwipeAction } {
  return { left: current.swipeLeft, right: current.swipeRight };
}
