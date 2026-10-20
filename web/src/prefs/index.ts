// Per-device preferences (brief 12). See prefs.ts for how to add one.
export { PrefsHost } from "./PrefsHost";
export { startDisplayPersistence } from "./display";
export {
  DEFAULT_PREFS,
  UNDO_SEND_SECONDS,
  getDefaultIdentityId,
  getPrefs,
  getShortcutsEnabled,
  setPrefs,
  setPrefsAccount,
  setShortcutsEnabled,
  startPrefs,
  subscribePrefs,
  subscribeShortcutsEnabled,
  type AccountPrefs,
  type ImagesPreference,
  type UndoSendSeconds,
} from "./prefs";
export { usePrefs } from "./usePrefs";
