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
// Finding F8: a message counts only when it comes from Postern's own worker,
// the active worker of the /webmail/ registration running /webmail/sw.js
// (acceptsSource); a worker another estate app registers at its own scope can
// reach this page too.
//
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
  maybeReload();
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

/** A new worker is waiting: `apply` lets it take over. Called by install.ts. */
export function updateWaiting(apply: () => void): void {
  applyUpdate = apply;
  maybeApplyUpdate();
}

let reloadPending = false;

function maybeReload(): void {
  if (!reloadPending || signedIn || document.visibilityState !== "hidden") return;
  reloadPending = false;
  window.location.reload();
}

/**
 * A new worker has taken over (from this page or another Postern tab). Reload
 * for the new version only while nobody is signed in here and the page is
 * hidden: a reload signs you out, and would wipe a half-typed sign-in. A
 * signed-in page keeps running; the new worker serves it just the same.
 * Called by install.ts in place of vite-plugin-pwa's unconditional reload.
 */
export function workerTookOver(): void {
  reloadPending = true;
  maybeReload();
}

/** What the page sees of a message's sender: a ServiceWorker's scriptURL. */
export interface WorkerLike {
  scriptURL?: string;
}

/**
 * Is this sender Postern's own worker (finding F8)? It must be the active
 * worker of the registration for the scope (or this page's controller, which
 * is that same object) and run the script at `scriptUrl`.
 */
export function acceptsSource(source: unknown, trusted: readonly (WorkerLike | null | undefined)[], scriptUrl: string): boolean {
  if (typeof source !== "object" || source === null) return false;
  if ((source as WorkerLike).scriptURL !== scriptUrl) return false;
  return trusted.some((worker) => worker !== null && worker !== undefined && worker === source);
}

/** The worker's script and scope: `/webmail/sw.js`, `/webmail/`. */
function workerUrls(): { scope: string; scriptUrl: string } {
  const scope = import.meta.env.BASE_URL;
  return { scope, scriptUrl: new URL(`${scope}sw.js`, window.location.origin).href };
}

/** Handles a message event if it comes from Postern's worker; anything else is dropped. Exported for tests. */
export async function receiveWorkerMessage(
  event: Pick<MessageEvent, "data" | "ports" | "source">,
  lookup: { controller: () => WorkerLike | null; active: () => Promise<WorkerLike | null | undefined>; scriptUrl: string },
): Promise<boolean> {
  const controller = lookup.controller();
  // The controller is the usual sender; otherwise ask the registration (an uncontrolled first load).
  const trusted = controller !== null && controller === event.source ? [controller] : [await lookup.active().catch(() => null)];
  if (!acceptsSource(event.source, trusted, lookup.scriptUrl)) return false;
  handleWorkerMessage(event.data, event.ports);
  return true;
}

/** Listens to the worker. Safe where there is none (old browsers). */
export function listenToWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  const container = navigator.serviceWorker;
  const { scope, scriptUrl } = workerUrls();
  const lookup = {
    controller: () => container.controller,
    active: async () => (await container.getRegistration(scope))?.active,
    scriptUrl,
  };
  container.addEventListener("message", (event) => void receiveWorkerMessage(event, lookup));
  container.startMessages();
  document.addEventListener("visibilitychange", () => {
    maybeApplyUpdate();
    maybeReload();
  });
}
