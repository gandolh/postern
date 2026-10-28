// Brief 27: what a reload needs to sign in again, in this tab's
// sessionStorage (the owner's call, 2026-10-28): the refresh token, the
// account as the UI shows it, and the last activity time. Never the access
// token. sessionStorage dies with the tab, so closing it (or Android killing
// the installed app) still signs out; a reload keeps it. AuthSession saves it
// after sign-in and after every refresh that returns a refresh token, and
// clears it on sign-out, the idle timeout, a refused refresh and before
// another account signs in.
//
// Any script on Postern's origin can read it; see corpus/wiki/security.md.
// Every access is wrapped: storage that throws (disabled, full, a private
// window) reads as empty, and the next reload asks for the password.

import type { SessionStore, StoredSession } from "@postern/jmap";

/** The one key Postern's session uses in sessionStorage. */
export const SESSION_KEY = "postern.session";
const VERSION = 1;

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** A stored record, if it has the shape this version writes. */
function parse(raw: string | null): StoredSession | undefined {
  if (!raw) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (v["version"] !== VERSION) return undefined;
  const { refreshToken, username, name, lastActivity } = v;
  if (typeof refreshToken !== "string" || !refreshToken || typeof username !== "string" || !username) return undefined;
  if (typeof lastActivity !== "number" || !Number.isFinite(lastActivity)) return undefined;
  return { refreshToken, username, lastActivity, ...(typeof name === "string" && name ? { name } : {}) };
}

/** AuthSession's store in this tab's sessionStorage. */
export const browserSessionStore: SessionStore = {
  load() {
    try {
      return parse(storage()?.getItem(SESSION_KEY) ?? null);
    } catch {
      return undefined;
    }
  },
  save(session) {
    try {
      storage()?.setItem(SESSION_KEY, JSON.stringify({ version: VERSION, ...session }));
    } catch {
      // Full or disabled: the next reload signs in with the password.
    }
  },
  clear() {
    try {
      storage()?.removeItem(SESSION_KEY);
    } catch {
      // As above.
    }
  },
};
