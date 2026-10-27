---
summary: Snapshot as of 2026-10-27. Briefs 01-22 are done (built and verified against the local Stalwart; brief 18 prepared the deploy in ../vps-deploy, 19 moved Postern to the root of postern.<domain>, 20-21 moved to Base UI, 22 added conversation view off), 23-25 are queued, nothing is deployed yet. One line per brief in the order they ran, the parked todos, and the owner steps (deploy and smoke test, screen reader, Android install, real push, token lifetimes).
updated: 2026-10-27
---

# Status (2026-10-22)

Postern is built: all 18 briefs are done, with 1,165 unit and integration
tests and a 34-test browser suite (`npm run test:e2e`) that runs the
production build behind Caddy with the final headers. Nothing is deployed.
Brief 18 committed the stack and routes in `../vps-deploy` (commit
`85f0934` there); the deploy itself, and the checks only a person can do,
are the owner steps at the end of this page. Neither repo is pushed.

## Briefs, in the order they run

**Wave 1: foundations**
- [01](../briefs/done/01-scaffold-the-workspaces.md): npm workspaces, house stack, Vite base `/webmail/`, lint, test, typecheck. **Done 2026-10-20.**
- [02](../briefs/done/02-local-mail-server.md): a Stalwart in Docker with test accounts and seeded mail, hostile mail included. After 01. **Done 2026-10-20.**
- [03](../briefs/done/03-jmap-client.md): the typed JMAP client: session and URL rebasing, batching, methods, blobs, changes. After 02. **Done 2026-10-20.**
- [04](../briefs/done/04-sign-in.md): sign-in through Stalwart (OAuth + PKCE + TOTP), tokens in memory, sign-out. After 03. **Done 2026-10-20.**

**Wave 2: reading**
- [05](../briefs/done/05-app-shell.md): the Gmail layout: top bar, navigation with system labels and counts, routes, themes, the visual identity. After 04. **Done 2026-10-20.**
- [06](../briefs/done/06-conversation-list.md): the conversation list: virtualised, selection, bulk actions, archive, star, read, undo. After 05. **Done 2026-10-20.**
- [07](../briefs/done/07-read-a-conversation.md): reading a conversation: sandboxed HTML, blocked images, attachments, quoted text. After 06. **Done 2026-10-20.**

**Wave 3: writing and organising**
- [08](../briefs/done/08-compose-and-send.md): the composer: reply, forward, rich text, attachments, drafts, send, undo send, signatures. After 07. **Done 2026-10-20.**
- [09](../briefs/done/09-labels.md): labels on mailboxes: apply, remove, move, create, nest, colours. After 06. **Done 2026-10-20.**
- [10](../briefs/done/10-search.md): Gmail search operators, highlighted snippets, suggestions, advanced search. After 06. **Done 2026-10-20.**

**Wave 4: live and settings**
- [11](../briefs/done/11-live-updates.md): live updates by fetch-streamed event source, unread counts in the tab, desktop notifications. After 06. **Done 2026-10-20.**
- [12](../briefs/done/12-settings.md): the settings pages: display, identities and signatures, vacation responder, storage. After 08. **Done 2026-10-20.**
- [13](../briefs/done/13-filters-and-spam.md): filters as Sieve, block sender, report spam and not spam. After 09 and 12. **Done 2026-10-20.**
- [14](../briefs/done/14-keyboard-and-accessibility.md): Gmail's keyboard shortcuts, the help sheet, accessibility pass. After 07 and 08. **Done 2026-10-20.**
- [15](../briefs/done/15-contacts.md): contacts on JMAP Contacts, recipient autocomplete, sender cards. After 08. **Done 2026-10-20.**

**Wave 5: hardening and deploy**
- [16](../briefs/done/16-installable-and-mobile.md): installable app, Web Push, phone layout and gestures, the offline decision. After 11. **Done 2026-10-20.**
- [17](../briefs/done/17-security-hardening.md): the CSP, the hostile-mail browser tests, a token and link review. After 07, 08 and 04. **Done 2026-10-20.**
- [18](../briefs/done/18-deploy.md): deploy through `../vps-deploy` (at /webmail when written; on `postern.<domain>` since 19). Owner steps. After 17. **Prepared 2026-10-21; the deploy is the owner's.**

**Wave 6: its own origin**
- [19](../briefs/done/19-served-at-the-root-of-postern-domain.md): served at the root of `postern.<domain>`, with Stalwart's API on the same host (`../vps-deploy` brief 14). Revisits "Served at /webmail". **Done 2026-10-22**: base `/`, the e2e harness at the root with another estate app on a second origin, all 34 browser tests and 1135 unit tests passing.

**Wave 7: Base UI**
- [20](../briefs/done/20-base-ui-dialogs.md): the modal dialogs on Base UI `Dialog`/`AlertDialog` through `web/src/shell/Modal.tsx`; the composer window stays native. **Done 2026-10-23**: 1166 unit and 34 browser tests.
- [21](../briefs/done/21-base-ui-menus-and-popovers.md): the menus and popovers on Base UI `Menu`/`Popover`; the comboboxes and the sender card stay hand-built. **Done 2026-10-23**: 1166 unit and 34 browser tests.

**Wave 8: Gmail parity, from the parked todos (filed 2026-10-23)**
- [22](../briefs/done/22-conversation-view-off.md): conversation view off, one row per message; a row is a one-message conversation, so the planners stay as they are. **Done 2026-10-27**: a per-device pref and switch, the list without `collapseThreads`, a message row opening its conversation at that message; 1186 unit and 34 browser tests.
- [23](../briefs/todo/23-schedule-send.md): schedule send. Step one checks the dev Stalwart honours a future `sendAt`; if it doesn't, the brief stops and is superseded.
- [24](../briefs/todo/24-snooze.md): snooze, run by the browser (the owner's call, 2026-10-23): a hidden Snoozed label plus a keyword holding the time; it wakes while Postern is open.
- [25](../briefs/todo/25-calendar-invite-card.md): a calendar invite's card and Yes / No / Maybe reply; no calendar in Postern (the owner's call, 2026-10-23). Step one checks what Stalwart does with an iMIP invite.

## Parked (todos)

None. The last five became briefs 22–25 or were dropped (inbox category tabs) on 2026-10-23.

## Owner steps

Things only the owner can do, collected from the briefs as they finished.

- **Deploy** (brief 18, on its own host since brief 19). After
  `../vps-deploy` brief 14 (code done 2026-10-22). DNS is already in place: `postern.<domain>`
  has its A record. Deploy Ward first, in `../vps-deploy` brief 16's order. From a clean, committed
  checkout of this repo (the build runs in it, and `npm ci` replaces its
  `node_modules`), in `../vps-deploy`:

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
- **Screen reader by ear** (brief 14): the checklist is at the end of
  [brief 14](../briefs/done/14-keyboard-and-accessibility.md).
- **Install on Android** (brief 16, after the deploy): open `https://postern.<domain>/` in
  Chrome, menu, "Install app", launch from the home screen; in airplane mode
  it opens to the sign-in page and says it is offline.
- **Real push** (brief 16): Settings, General, "Notifications for new mail
  when Postern is closed", allow; close Postern; mail yourself from another
  account; the notification shows sender and subject and opens the
  conversation. iOS needs 16.4 or later and Postern added to the Home Screen
  first.
- **Web Push on Stalwart** (brief 16, configured by brief 18): the mail plan
  in `../vps-deploy` now sets `webPushContact`, the VAPID subject Apple
  requires, to the domain's postmaster address. The VAPID key is the one in
  Stalwart's store and the plan leaves it alone; a lost store means a new
  key, and each device then re-subscribes at its next sign-in. If no push
  ever arrives, check that the mail container reaches `fcm.googleapis.com`,
  `updates.push.services.mozilla.com` and `web.push.apple.com` over HTTPS.
- **Token lifetimes** (brief 04): decide whether to shorten production's
  access and refresh token lifetimes, since Stalwart cannot revoke a token
  ([open-questions.md](open-questions.md)).
