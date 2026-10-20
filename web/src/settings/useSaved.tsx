// The quiet "Saved" confirmation for server-side settings. The status line is
// always in the DOM and reserves its height, so nothing shifts when it fills.

import { JmapUnauthorizedError } from "@postern/jmap";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface SavedState {
  /** Render once near the controls it reports on. */
  note: ReactNode;
  /** Run a server write: shows "Saved" on success, the error on failure. Resolves true on success. */
  save: (write: () => Promise<unknown>) => Promise<boolean>;
}

export function useSaved(): SavedState {
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const save = useCallback(async (write: () => Promise<unknown>) => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await write();
      setFailed(false);
      setText("Saved");
      timer.current = setTimeout(() => setText(""), 2500);
      return true;
    } catch (error) {
      // The session dialog (brief 04) deals with an expired session.
      if (error instanceof JmapUnauthorizedError) return false;
      setFailed(true);
      setText(`Could not save: ${error instanceof Error ? error.message : "unknown error"}`);
      return false;
    }
  }, []);

  const note = (
    <p className="settings-saved" role="status" data-failed={failed ? "true" : undefined}>
      {text}
    </p>
  );
  return { note, save };
}
