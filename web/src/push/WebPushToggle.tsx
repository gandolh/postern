// The Web Push opt-in for the settings page (brief 16), rendered next to brief
// 11's desktop notifications. Off by default; turning it on asks for
// notification permission and subscribes this device; off unsubscribes it.

import { useId, useSyncExternalStore } from "react";
import { useActiveWebPush } from "./active";
import { needsHomeScreen } from "./browser";
import type { WebPush, WebPushProblem, WebPushSnapshot } from "./webPush";

const PROBLEMS: Record<WebPushProblem, string> = {
  denied: "Notifications are blocked in your browser’s site settings.",
  unavailable: "Not available here: Postern’s service worker isn’t running in this browser.",
  pushService: "This browser couldn’t reach its push service. Check the connection and try again.",
  timeout: "The mail server didn’t confirm this device in time. Try again in a minute.",
  failed: "Couldn’t turn this on. Try again in a moment.",
};

const IDLE: WebPushSnapshot = { on: false, busy: false, problem: null };
const noop = () => () => {};

function useSnapshot(push: WebPush | null): WebPushSnapshot {
  return useSyncExternalStore(push ? push.subscribe : noop, push ? push.getSnapshot : () => IDLE, () => IDLE);
}

export function WebPushToggle() {
  const push = useActiveWebPush();
  const snapshot = useSnapshot(push);
  const hintId = useId();
  const problemId = useId();

  if (!push || !push.supported) {
    if (!needsHomeScreen()) return null;
    return (
      <div className="settings-field">
        <p className="settings-hint">
          To get notifications when Postern is closed on an iPhone or iPad, add Postern to the Home Screen (Share, then Add to Home Screen) and turn them on there.
        </p>
      </div>
    );
  }

  const describedBy = [hintId, snapshot.problem ? problemId : null].filter(Boolean).join(" ");
  return (
    <div className="settings-field">
      <label className="settings-check">
        <input
          type="checkbox"
          checked={snapshot.on}
          disabled={snapshot.busy}
          aria-describedby={describedBy}
          onChange={(e) => void (e.target.checked ? push.enable() : push.disable())}
        />
        Notifications for new mail when Postern is closed
      </label>
      <p id={hintId} className="settings-hint">
        {snapshot.busy
          ? snapshot.on
            ? "Updating this device…"
            : "Turning on for this device…"
          : "On this device only. Shows the sender and subject of new Inbox mail. Signing out turns it off until you sign in here again."}
      </p>
      {snapshot.problem ? (
        <p id={problemId} className="settings-hint" role="alert">
          {PROBLEMS[snapshot.problem]}
        </p>
      ) : null}
    </div>
  );
}
