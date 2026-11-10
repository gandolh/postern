---
summary: Snapshot as of 2026-11-02, per area. Postern is built (foundations, reading, writing, live, settings, keyboard, PWA and security 2026-10-20; its own host 2026-10-22; Base UI 2026-10-23; conversation view off, schedule send, snooze, invite cards and a reload keeping the session 2026-10-27/28) deployed on its own host since 2026-11-02, the owner's smoke test passed 2026-11-05. The owner steps left (screen reader, Android install and reload, real push, production's token lifetimes).
updated: 2026-11-05
---

# Status (2026-11-02)

Postern is built, with 1,291 unit and integration tests and a 46-test browser
suite (`npm run test:e2e`) that runs the production build behind Caddy with
the final headers. It is deployed at `postern.<domain>` since the owner's
rollout of 2026-11-02 (`vps-deploy`'s `postern` stack), and the owner ran the
smoke test on 2026-11-05: passed. The checks only a person can do are the
owner steps below. `main`
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
- **Planned: house style, Base UI conventions, Tailwind** (2026-11-09).
  Three briefs, run in order: the formatter and quality harness, Base UI
  behind wrappers by the owner's conventions, and the whole web app to
  Tailwind v4. No server brief: Postern has no backend of its own. Base UI is
  already pinned at 1.9.0, so no bump is needed. They wait on the owner's
  grilling of 2026-11-10.

## Owner steps

Things only the owner can do, collected from the briefs as they finished.

- **Deploy and smoke test:** done. Deployed 2026-11-02 by `vps-deploy`'s
  rollout; the smoke test (headers, the routes that must answer 404, sign-in
  with TOTP, reading, sending with the live update, every request on
  Postern's own host) passed on 2026-11-05, as the owner reported. The
  steps are in git history before this change.
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
