// Brings snoozed mail back while Postern is open (brief 24; ./wake.ts). The
// shell renders it once, under the labels provider.

import { useEffect } from "react";
import { useJmap } from "../auth";
import { useLabelsStore } from "../labels/useLabels";
import { SnoozeSync } from "./wake";

export function SnoozeHost() {
  const client = useJmap();
  const labels = useLabelsStore();
  useEffect(() => {
    // Test doubles of the client have no request builder.
    if (typeof client.request !== "function") return;
    const sync = new SnoozeSync(client, labels);
    sync.start();
    return () => sync.stop();
  }, [client, labels]);
  return null;
}
