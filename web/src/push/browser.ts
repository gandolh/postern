// The real browser behind WebPushDeps.browser (brief 16).

import { withDeadline } from "./deadline";
import type { BrowserPush, PushManagerLike } from "./webPush";

/** The worker's scope: the build's base, `/webmail/`. */
const SCOPE = import.meta.env.BASE_URL;

export const browserPush: BrowserPush = {
  async pushManager(): Promise<PushManagerLike | null> {
    if (!("serviceWorker" in navigator) || typeof PushManager === "undefined") return null;
    const registration = await navigator.serviceWorker.getRegistration(SCOPE);
    if (!registration) return null;
    if (!registration.active) await withDeadline(navigator.serviceWorker.ready, 5000);
    return registration.active ? registration.pushManager : null;
  },
  permission: () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
  requestPermission: () => Notification.requestPermission(),
};

/**
 * iPhone and iPad: Safari offers Web Push only to a web app added to the Home
 * Screen (iOS 16.4 and later), so in a Safari tab there is no PushManager.
 */
export function needsHomeScreen(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return typeof nav.standalone === "boolean" && !nav.standalone && typeof PushManager === "undefined";
}
