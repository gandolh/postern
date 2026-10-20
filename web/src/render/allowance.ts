// "Always display images from <sender>": a per-device list, kept in this
// browser only (owner, 2026-10-20), per account. It is not a secret, so
// localStorage is allowed; every access is wrapped, and when storage is
// unavailable (private mode, blocked) the list lives in memory for the tab.
//
//   allowsImagesFrom(account, sender)   is this sender on the list?
//   allowImagesFrom(account, sender)    add them
//   forgetImagesFrom(account, sender)   take them off (brief 12's settings)
//   imageAllowanceList(account)         the whole list
//   useImageAllowance(account)          the same, re-rendering on change
//   setAlwaysDisplayImages(on)          global "always display external images"
//                                       (brief 12's setting; default off = ask).
//                                       While on, allowsImagesFrom is true for everyone.
//
// Keyed by the real From address, lower-cased, never the display name.

import { useCallback, useSyncExternalStore } from "react";

const PREFIX = "postern.images.";
const memory = new Map<string, string[]>();
const listeners = new Set<() => void>();
let version = 0;
let alwaysDisplay = false;

/** Global "always display external images", set from the per-device prefs. Default off. */
export function setAlwaysDisplayImages(on: boolean): void {
  if (alwaysDisplay === on) return;
  alwaysDisplay = on;
  version++;
  for (const l of [...listeners]) l();
}

function key(account: string): string {
  return `${PREFIX}${account.toLowerCase()}`;
}

function read(account: string): string[] {
  try {
    const raw = window.localStorage.getItem(key(account));
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    // Storage unavailable or corrupt: fall back to this tab's memory.
  }
  return memory.get(account.toLowerCase()) ?? [];
}

function write(account: string, list: string[]): void {
  memory.set(account.toLowerCase(), list);
  try {
    window.localStorage.setItem(key(account), JSON.stringify(list));
  } catch {
    // Kept in memory only.
  }
  version++;
  for (const l of [...listeners]) l();
}

export function imageAllowanceList(account: string): string[] {
  return read(account);
}

export function allowsImagesFrom(account: string, sender: string): boolean {
  if (alwaysDisplay) return true;
  return read(account).includes(sender.toLowerCase());
}

export function allowImagesFrom(account: string, sender: string): void {
  const list = read(account);
  const s = sender.toLowerCase();
  if (!list.includes(s)) write(account, [...list, s].sort());
}

export function forgetImagesFrom(account: string, sender: string): void {
  write(
    account,
    read(account).filter((s) => s !== sender.toLowerCase()),
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(PREFIX)) {
      version++;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getVersion = () => version;

/** The allowance for an account; re-renders when it changes (here or in another tab). */
export function useImageAllowance(account: string): { allows: (sender: string) => boolean; allow: (sender: string) => void } {
  const v = useSyncExternalStore(subscribe, getVersion, getVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allows = useCallback((sender: string) => allowsImagesFrom(account, sender), [account, v]);
  const allow = useCallback((sender: string) => allowImagesFrom(account, sender), [account]);
  return { allows, allow };
}
