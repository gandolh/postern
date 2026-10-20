// Per-device preferences (brief 12). See prefs.ts for how to add one.
export { PrefsHost } from "./PrefsHost";
export { startDisplayPersistence } from "./display";
export {
  DEFAULT_PREFS,
  SWIPE_ACTIONS,
  UNDO_SEND_SECONDS,
  getDefaultIdentityId,
  getPrefs,
  getShortcutsEnabled,
  getSwipeActions,
  setPrefs,
  setPrefsAccount,
  setShortcutsEnabled,
  startPrefs,
  subscribePrefs,
  subscribeShortcutsEnabled,
  type AccountPrefs,
  type ImagesPreference,
  type SwipeAction,
  type UndoSendSeconds,
} from "./prefs";
export { usePrefs } from "./usePrefs";
