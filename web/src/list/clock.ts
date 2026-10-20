// "Now", to the minute, for the list's dates ("14:05" today, "Oct 9" after
// midnight). One timer for every list on screen.

import { useSyncExternalStore } from "react";

let now = new Date();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick(): void {
  now = new Date();
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    now = new Date();
    timer = setInterval(tick, 60_000);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getNow = () => now;

/** The current time, updated each minute while something on screen uses it. */
export function useMinuteClock(): Date {
  return useSyncExternalStore(subscribe, getNow, getNow);
}
