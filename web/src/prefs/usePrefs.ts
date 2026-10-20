import { useSyncExternalStore } from "react";
import { getPrefs, setPrefs, subscribePrefs, type AccountPrefs } from "./prefs";

/** The prefs in force, re-rendering on change. */
export function usePrefs(): { prefs: AccountPrefs; setPrefs: typeof setPrefs } {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);
  return { prefs, setPrefs };
}
