// A CSS media query as React state, live.

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    [query],
  );
  const get = useCallback(() => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverValue), [query, serverValue]);
  return useSyncExternalStore(subscribe, get, () => serverValue);
}
