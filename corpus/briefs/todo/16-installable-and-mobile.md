# Task 16: Installable app, Web Push, and the phone

## Context

Three things in one brief:

- **Install:** Gmail on a phone is an app. Postern becomes an installable PWA.
- **Web Push:** to notify while the app is closed, the browser's push
  subscription is registered with Stalwart as a JMAP `PushSubscription`.
  Stalwart sends Web Push with VAPID.
- **Offline cache:** whether to have one is an owner decision. On the shared
  production origin, a cache of mail in IndexedDB is readable by any estate
  script, even with Postern closed
  ([open-questions.md](../../wiki/open-questions.md)).

## Files you OWN

- `web/vite.config.ts`: add `vite-plugin-pwa` 1.3.0 and `workbox-window`
  7.4.1, the versions Satchel pins
- `web/src/sw/**`: the service worker: app-shell caching, push handling,
  notification click
- `web/src/push/**`: subscribe and unsubscribe, `PushSubscription/set`
  through `@postern/jmap`, its verification step
- `web/src/mobile/**`: phone layout, swipe actions, the floating Compose
  button
- `corpus/wiki/decisions.md`: the offline-cache decision

## What to do

1. **Install.**
   - A manifest with scope `/webmail/`, Postern's icons, and a standalone
     display.
   - The service worker caches only the app shell (HTML, JS, CSS, fonts,
     icons). Never mail content, unless step 4 decides otherwise.
2. **Web Push.**
   - On the user's opt-in (from brief 12's settings), subscribe with the
     browser's `PushManager`.
   - Register through `PushSubscription/set`, and complete JMAP's
     verification-code handshake.
   - The service worker shows sender and subject for new Inbox mail. Click
     opens the conversation.
   - Unsubscribe on sign-out.
   - Check first that Stalwart's VAPID push reaches Chrome and Firefox, and
     note Safari's install requirement.
3. **Phone.**
   - Single column: list, then conversation.
   - Swipe left or right to archive or delete, configurable.
   - Pull to refresh; a floating Compose button; the composer full screen.
   - Touch targets of 44 px or more.
4. **Offline.** Present the options to the owner:
   - none;
   - metadata only;
   - full recent mail, with the shared-origin exposure spelled out.

   Implement the choice and record it. An outbox for sending while offline
   comes with it only if mail is cached.

## Acceptance

- Installs on Android Chrome and on desktop Chrome. Launches at `/webmail/`.
- With the app closed, a message from bob on `dev/` produces a notification.
  This needs a reachable push service; test against the real push endpoints
  from a dev build.
- The phone layout passes brief 14's keyboard and screen-reader checks too.
- The offline decision is recorded.
