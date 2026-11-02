---
summary: Snapshot as of 2026-11-02, per area. Postern is built (foundations, reading, writing, live, settings, keyboard, PWA and security 2026-10-20; its own host 2026-10-22; Base UI 2026-10-23; conversation view off, schedule send, snooze, invite cards and a reload keeping the session 2026-10-27/28) and not deployed. The owner steps (deploy and smoke test, screen reader, Android install and reload, real push, production's token lifetimes).
updated: 2026-11-02
---

# Status (2026-11-02)

Postern is built, with 1,291 unit and integration tests and a 46-test browser
suite (`npm run test:e2e`) that runs the production build behind Caddy with
the final headers. Nothing is deployed. The stack and routes are committed in
`vps-deploy` (since 2026-10-21; on Postern's own host since 2026-10-22); the
deploy, and the checks only a person can do, are the owner steps below. `main`
is pushed through `bf67619` (2026-11-01). No brief is open; brief numbering restarted at 01
on 2026-11-02 (see [log.md](../log.md)).

## By area

- **Foundations** (2026-10-20). Workspaces, a local Stalwart with seeded and
  hostile mail, the typed JMAP client, sign-in through Stalwart
  ([architecture.md](architecture.md), [sign-in.md](sign-in.md)).
- **Reading** (2026-10-20). The Gmail layout and visual system, the
  virtualised conversation list, reading in a sandboxed frame
  ([design.md](design.md), [rendering.md](rendering.md)).
- **Writing and organising** (2026-10-20). The composer, labels, search with
  Gmail's operators, filters as Sieve, spam, contacts
  ([gmail-on-jmap.md](gmail-on-jmap.md)).
- **Live, settings, keyboard** (2026-10-20). Live updates, desktop
  notifications, the settings pages, every Gmail shortcut and an
  accessibility pass ([keyboard-and-accessibility.md](keyboard-and-accessibility.md)).
- **Installable and secure** (2026-10-20). The PWA, Web Push, the phone
  layout; the CSP, the hostile-mail browser tests, the security review
  ([security.md](security.md), [security-findings.md](security-findings.md)).
- **Its own host** (2026-10-22). Served at the root of `postern.<domain>`,
  Stalwart's API at `/webmail-api` on the same host.
- **Base UI** (2026-10-23). Dialogs, menus and popovers; the composer window
  stays native ([overlays.md](overlays.md)).
- **Gmail parity** (2026-10-27, 2026-10-28). Conversation view off, a
  message row opening that message alone, schedule send, snooze, calendar
  invite cards. Inbox category tabs were dropped on 2026-10-23
  ([todo](../todos/inbox-category-tabs.md)).
- **A reload keeps the session** (2026-10-28). A refresh token in
  `sessionStorage`; closing the tab ends it ([sign-in.md](sign-in.md)).

## Owner steps

Things only the owner can do, collected from the briefs as they finished.

- **Deploy** (prepared 2026-10-21, on its own host since 2026-10-22). After
  `vps-deploy`'s hosts of their own (code done 2026-10-22). DNS is already in place: `postern.<domain>`
  has its A record. Deploy Ward first, in the order `vps-deploy`'s status gives. From a clean, committed
  checkout of this repo (the build runs in it, and `npm ci` replaces its
  `node_modules`), in `vps-deploy`:

  ```
  node cli.ts --check              # the committed Caddyfile matches the stacks
  node cli.ts postern pre-deploy   # /var/www/postern, then the whole Caddyfile:
                                   # validated on the box, Caddy reloaded (sudo);
                                   # Caddy gets postern.<domain>'s certificate
  node cli.ts postern deploy       # npm ci + npm run build here, upload web/dist
  node cli.ts mail server          # applies the mail plan (webPushContact) and
                                   # restarts Stalwart: a few seconds without mail
  ```

  `postern deploy` warns that postern depends on mail; mail is live, so that
  is expected. The Caddyfile carries the new host block with both routes,
  `/` and `/webmail-api`, so the mail stack's own pre-deploy is not needed.
  If the box's `caddy validate` refuses the file, Caddy keeps serving the old
  config; do not restart Caddy until the file is fixed.

  Smoke test, with `<domain>` the production domain:

  - `curl -sI https://postern.<domain>/` and a deep link such as
    `https://postern.<domain>/inbox`: 200, `text/html`, a valid certificate,
    every Postern header in [security-headers.md](security-headers.md),
    `Cache-Control: no-cache`, no `Server`.
  - `curl -sI https://postern.<domain>/manifest.webmanifest`:
    `application/manifest+json`. One file under `/assets/` (a name from
    `index.html`): `Cache-Control: public, max-age=31536000, immutable`.
  - `curl -s -D - -o /dev/null https://postern.<domain>/webmail-api/jmap/session`
    (a GET; Stalwart may answer a HEAD oddly): its answer to a request with
    no token, carrying the four `/webmail-api/` headers and no `Server`.
  - `curl -s -o /dev/null -w '%{http_code}\n' https://postern.<domain>/webmail-api/admin/`
    prints 404. So do `/webmail-api/api/principal`, `/webmail-api/healthz/ready`
    and `/webmail-api` itself.
  - `curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/webmail-api/jmap/session`
    and `https://<domain>/webmail/` print 404: nothing of Postern's is on the apex.
  - No `Service-Worker-Allowed` on any response.
  - In the browser at `https://postern.<domain>/`: sign in as your own
    mailbox (the real account, TOTP included), then open and read a
    conversation.
  - Send a message to another address on the domain: the postmaster alias
    lands in your own Inbox. With Postern open, it appears with no reload
    (live update).
  - DevTools, Network panel with "Preserve log" on, through sign-in, reading
    and sending: every request goes to `postern.<domain>`, none to the mail
    host or the apex. The Application panel shows the worker active with
    scope `/`.
  - Then the Android install and the real push below.
- **Screen reader by ear:** the checklist is in
  [keyboard-and-accessibility.md](keyboard-and-accessibility.md#owner-check-by-ear).
- **Install on Android** (after the deploy): open `https://postern.<domain>/` in
  Chrome, menu, "Install app", launch from the home screen; in airplane mode
  it opens to the sign-in page and says it is offline.
- **A reload on Android** (after the install): sign in in the
  installed app, reload (pull down, or the menu's Reload): the Inbox comes
  back without the sign-in form. Close the app from the recent-apps screen
  and open it again: the sign-in form.
- **Real push:** Settings, General, "Notifications for new mail
  when Postern is closed", allow; close Postern; mail yourself from another
  account; the notification shows sender and subject and opens the
  conversation. iOS needs 16.4 or later and Postern added to the Home Screen
  first.
- **Web Push on Stalwart** (configured 2026-10-21): the mail plan
  in `vps-deploy` now sets `webPushContact`, the VAPID subject Apple
  requires, to the domain's postmaster address. The VAPID key is the one in
  Stalwart's store and the plan leaves it alone; a lost store means a new
  key, and each device then re-subscribes at its next sign-in. If no push
  ever arrives, check that the mail container reaches `fcm.googleapis.com`,
  `updates.push.services.mozilla.com` and `web.push.apple.com` over HTTPS.
- **Token lifetimes:** decided 2026-10-28 (access 15 minutes,
  refresh about a day, a new refresh token on each refresh); applying them is
  `vps-deploy`'s `node cli.ts mail server`. After that deploy, the reload
  check skipped on 2026-10-28: on
  `https://postern.<domain>/` sign in, reload a few times a minute or more
  apart, and in DevTools (Application, Session Storage) see `postern.session`
  hold a new refresh token after each refresh, with the reload still
  signed in.
