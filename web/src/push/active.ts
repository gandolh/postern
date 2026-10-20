// The signed-in session's WebPush, for the settings toggle (like getComposer()).

import { useSyncExternalStore } from "react";
import type { WebPush } from "./webPush";

let active: WebPush | null = null;
const listeners = new Set<() => void>();

export function setActiveWebPush(push: WebPush | null): void {
  active = push;
  for (const l of [...listeners]) l();
}

export function getActiveWebPush(): WebPush | null {
  return active;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The session's WebPush, once PushHost has made it. */
export function useActiveWebPush(): WebPush | null {
  return useSyncExternalStore(subscribe, getActiveWebPush, () => null);
}
