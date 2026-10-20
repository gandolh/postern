// The page's side of the service worker (brief 16). install.ts starts it from
// main.tsx (it alone imports vite-plugin-pwa's virtual module, so this file
// stays testable).
//
//   listenToWorker()    messages from the worker, below
//   updateWaiting(fn)   a new worker waits; fn lets it take over
//   setSignedIn(on)     PushHost says whether a session is live in this page
//
// Updates: a new worker waits. Taking over reloads the page, and a reload
// signs you out (tokens live in memory only), so it is applied only while
// nobody is signed in here and the page is hidden; otherwise it waits for
// every Postern tab to close, as service workers do by default.
//
// Messages from the worker (sw/protocol.ts):
//   PUSH_VERIFICATION   Stalwart's code for a new subscription -> verificationInbox
//   OPEN                a notification was clicked -> show that route here
//   WILL_NOTIFY         "will you show this new mail yourself?" -> yes when this
//                       page is signed in with brief 11's desktop notifications on

import { getDesktopNotifications } from "../notify/settings";
import { navigate, parseRoute } from "../shell/router";
import { OPEN, PUSH_VERIFICATION, readWorkerMessage, WILL_NOTIFY } from "../sw/protocol";
import { verificationInbox } from "./verification";

let signedIn = false;
let applyUpdate: (() => void) | null = null;

function maybeApplyUpdate(): void {
  if (!applyUpdate || signedIn || document.visibilityState !== "hidden") return;
  const apply = applyUpdate;
  applyUpdate = null;
  apply();
}

/** PushHost: a session is live in this page (true) or has ended (false). */
export function setSignedIn(on: boolean): void {
  signedIn = on;
  maybeApplyUpdate();
}

/** Would this page show a desktop notification for new mail itself? */
export function willNotifyHere(): boolean {
  return signedIn && getDesktopNotifications() && typeof Notification !== "undefined" && Notification.permission === "granted";
}

/** Handles one message from the worker. Exported for tests. */
export function handleWorkerMessage(data: unknown, ports: readonly MessagePort[]): void {
  const message = readWorkerMessage(data);
  if (!message) return;
  switch (message.type) {
    case PUSH_VERIFICATION:
      verificationInbox.receive(message.pushSubscriptionId, message.verificationCode);
      break;
    case OPEN:
      navigate(parseRoute(message.hash));
      break;
    case WILL_NOTIFY:
      ports[0]?.postMessage({ willNotify: willNotifyHere() });
      break;
  }
}

/** A new worker is waiting: `apply` lets it take over (and reloads the page). Called by install.ts. */
export function updateWaiting(apply: () => void): void {
  applyUpdate = apply;
  maybeApplyUpdate();
}

/** Listens to the worker. Safe where there is none (old browsers). */
export function listenToWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => handleWorkerMessage(event.data, event.ports));
  navigator.serviceWorker.startMessages();
  document.addEventListener("visibilitychange", maybeApplyUpdate);
}
