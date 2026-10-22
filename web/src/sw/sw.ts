/// <reference lib="webworker" />
// Postern's service worker (brief 16; vite-plugin-pwa, injectManifest).
//
// 1. The app shell: the files the build lists, each with a SHA-256 baked into
//    this script, cached at install and checked on every read (shell.ts;
//    finding F1: Cache Storage is the whole origin's, so any script on the
//    origin can rewrite it). Navigations inside the scope get index.html, so
//    the installed app opens offline (to the sign-in page: tokens die with
//    the tab). Nothing is cached at runtime. Never mail, never a /webmail-api
//    response (owner decision 2026-10-20: no offline mail).
// 2. Web Push: show new mail while Postern is closed, hand Stalwart's
//    verification code to the page, and open the Inbox on a click.
//
// The worker holds no token and makes no JMAP request. Sender and subject
// arrive in the push itself (Stalwart's emailPush extension), encrypted to
// this browser's subscription keys; the push service sees ciphertext only.

import { anyVisible, appWindows, clickHash, notificationsFor, openMessage, parsePushPayload, windowForClick } from "./notify";
import { mayRequestUpdate, SKIP_WAITING, WILL_NOTIFY } from "./protocol";
import { scopePath } from "./routing";
import { cacheNameFor, cleanupCaches, installShell, pick, serve, shellFiles, type ManifestEntry, type ShellDeps } from "./shell";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | ManifestEntry)[] };

/** `/`: the build's base, which is also the registration's scope. */
const SCOPE = scopePath(import.meta.env.BASE_URL);
const ORIGIN = self.location.origin;
const ICON = `${SCOPE}pwa-192x192.png`;
const BADGE = `${SCOPE}pwa-badge-96x96.png`;
/** How long a hidden page has to say it will show the notification itself. */
const ASK_TIMEOUT_MS = 1000;

// ---- The app shell -------------------------------------------------------------

const SHELL_DEPS: ShellDeps = {
  caches: self.caches,
  fetch: (input, init) => self.fetch(input, init),
  scopeUrl: `${ORIGIN}${SCOPE}`,
};
// The build's list, with a hash per file (vite.config.ts manifestTransforms).
const FILES = shellFiles(self.__WB_MANIFEST, SHELL_DEPS.scopeUrl);
const CACHE = cacheNameFor(FILES);

self.addEventListener("install", (event) => {
  // Best effort: a file that fails or does not match its hash is left to the
  // network; the worker still installs.
  event.waitUntil(installShell(FILES, CACHE, SHELL_DEPS));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(cleanupCaches(CACHE, SHELL_DEPS));
});

self.addEventListener("fetch", (event) => {
  const file = pick(event.request, FILES, SHELL_DEPS.scopeUrl);
  // Everything else (the API above all) goes to the network untouched and is never stored.
  if (!file) return;
  event.respondWith(serve(file, event.request, CACHE, SHELL_DEPS, (work) => event.waitUntil(work)));
});

// A new worker waits. A Postern page asks it to take over only while nobody
// is signed in there (push/register.ts), and no signed-in page reloads when it
// does (push/install.ts). Finding F7: only a top-level window under the scope
// may ask; with frame-ancestors 'none' and COOP same-origin, no other page can
// run script in such a window.
self.addEventListener("message", (event) => {
  if ((event.data as { type?: unknown } | null)?.type !== SKIP_WAITING) return;
  if (mayRequestUpdate(event.source, ORIGIN, SCOPE)) void self.skipWaiting();
});

// ---- Push ------------------------------------------------------------------------

function windows(): Promise<readonly WindowClient[]> {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

/** Asks a hidden page whether it will show this mail itself (brief 11's notifications are on there). */
function willNotify(client: WindowClient): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), ASK_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve((event.data as { willNotify?: unknown } | null)?.willNotify === true);
    };
    client.postMessage({ type: WILL_NOTIFY }, [channel.port2]);
  });
}

function readJson(data: PushMessageData | null): unknown {
  try {
    return data?.json() as unknown;
  } catch {
    return null;
  }
}

async function onPush(data: PushMessageData | null): Promise<void> {
  const payload = parsePushPayload(readJson(data));
  const open = appWindows(await windows(), ORIGIN, SCOPE);

  if (payload.kind === "verification") {
    // The page that asked for the subscription completes it. Nothing to show.
    for (const w of open) w.postMessage(payload.message);
    return;
  }

  const notifications = notificationsFor(payload, { icon: ICON, badge: BADGE });
  if (notifications.length === 0) return;
  // Someone is looking at Postern: the list updates live, and brief 11's
  // notifications cover the rest. Avoid showing the same mail twice.
  if (anyVisible(open)) return;
  if (open.length > 0 && (await Promise.all(open.map(willNotify))).some(Boolean)) return;

  await Promise.all(notifications.map((n) => self.registration.showNotification(n.title, n.options)));
}

/** Focus a Postern window and show the route there, or open one at it. */
async function onClick(data: unknown): Promise<void> {
  const hash = clickHash(data);
  const target = windowForClick(appWindows(await windows(), ORIGIN, SCOPE));
  if (target) {
    // The page navigates itself (shell/router): a navigation from here would
    // reload it, and a reload signs you out.
    target.postMessage(openMessage(hash));
    try {
      await target.focus();
      return;
    } catch {
      // Not allowed to focus (no user activation left): open a window instead.
    }
  }
  await self.clients.openWindow(`${SCOPE}${hash}`);
}

self.addEventListener("push", (event) => {
  event.waitUntil(onPush(event.data));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(onClick(event.notification.data));
});
