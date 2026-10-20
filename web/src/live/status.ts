// What the top bar says about the connection. Quiet: nothing while it works.

import type { PushStatus } from "@postern/jmap";

export function statusMessage(status: PushStatus, pollIntervalMs = 30_000): string | null {
  switch (status) {
    case "reconnecting":
      return "Reconnecting…";
    case "polling":
      return `Checking for mail every ${Math.round(pollIntervalMs / 1000)} seconds`;
    default:
      return null;
  }
}
