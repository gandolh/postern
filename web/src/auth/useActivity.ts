// Feeds the idle timeout: any key, pointer, wheel or touch input counts as
// activity. `noteActivity` only records the time, so no throttling is needed.
// When the tab becomes visible or gains focus (the machine woke up, say), the
// deadline is checked without counting as activity, so a session that slept
// past it signs out before the first keystroke.

import type { AuthSession } from "@postern/jmap";
import { useEffect } from "react";

const ACTIVITY_EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart"] as const;

export function useActivity(auth: AuthSession, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const note = (): void => auth.noteActivity();
    const check = (): void => void auth.checkIdle();
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, note, { capture: true, passive: true });
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, note, { capture: true });
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [auth, enabled]);
}
