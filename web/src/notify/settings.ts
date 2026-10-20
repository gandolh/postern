// Desktop notification setting (brief 11). A per-device choice: it lives in this
// browser's localStorage, keyed by account, and is OFF until the person turns
// it on. Brief 12's settings page renders the toggle:
//
//   const { enabled, permission, setEnabled } = useDesktopNotifications();
//   <input type="checkbox" checked={enabled} onChange={(e) => void setEnabled(e.target.checked)} />
//
// Outside React: getDesktopNotifications() / setDesktopNotifications(on) /
// subscribeDesktopNotifications(fn). Turning it on asks the browser for
// permission; if the person says no, the setting stays off.

import { useCallback, useSyncExternalStore } from "react";

const KEY_PREFIX = "postern.desktopNotifications.";

let account = "";
const listeners = new Set<() => void>();
const memory = new Map<string, boolean>();

/** Which account the setting belongs to. LiveHost and useDesktopNotifications set it. */
export function setNotifyAccount(username: string): void {
  if (username === account) return;
  account = username;
  emit();
}

function emit(): void {
  for (const l of [...listeners]) l();
}

function read(who: string): boolean {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + who);
    if (raw !== null) return raw === "1";
  } catch {
    // Storage blocked: fall back to this page's memory.
  }
  return memory.get(who) ?? false;
}

function write(who: string, on: boolean): void {
  memory.set(who, on);
  try {
    localStorage.setItem(KEY_PREFIX + who, on ? "1" : "0");
  } catch {
    // Ignore: the setting then lasts until the page closes.
  }
}

/** The browser's permission, or "unsupported" when it has no Notification API. */
export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/** Whether desktop notifications are on for the current account. */
export function getDesktopNotifications(): boolean {
  return account !== "" && read(account);
}

/**
 * Turns notifications on or off. Turning on requests the browser's permission;
 * the setting is stored as on only if it is granted. Resolves to the stored value.
 */
export async function setDesktopNotifications(on: boolean): Promise<boolean> {
  if (account === "") return false;
  let value = on;
  if (on) {
    if (typeof Notification === "undefined") value = false;
    else if (Notification.permission === "default") {
      try {
        value = (await Notification.requestPermission()) === "granted";
      } catch {
        value = false;
      }
    } else value = Notification.permission === "granted";
  }
  write(account, value);
  emit();
  return value;
}

/** Hear when the setting (or the account it is read for) changes. Returns the unsubscribe. */
export function subscribeDesktopNotifications(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** React access for the settings page. */
export function useDesktopNotifications(): {
  enabled: boolean;
  permission: NotificationPermission | "unsupported";
  setEnabled: (on: boolean) => Promise<boolean>;
} {
  const enabled = useSyncExternalStore(subscribeDesktopNotifications, getDesktopNotifications, () => false);
  const permission = notificationPermission();
  const setEnabled = useCallback((on: boolean) => setDesktopNotifications(on), []);
  return { enabled, permission, setEnabled };
}
