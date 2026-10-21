---
summary: Snapshot as of 2026-10-21. Briefs 01-18 are done and 19 (the root of postern.<domain>) is queued (built and verified against the local Stalwart; brief 18 prepared the deploy in ../vps-deploy), nothing is deployed yet. One line per brief in the order they ran, the parked todos, and the owner steps (deploy and smoke test, screen reader, Android install, real push, token lifetimes).
updated: 2026-10-21
---

# Status (2026-10-21)

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
- [18](../briefs/done/18-deploy.md): deploy at /webmail through `../vps-deploy`. Owner steps. After 17. **Prepared 2026-10-21; the deploy is the owner's.**

**Wave 6: its own origin**
- [19](../briefs/todo/19-served-at-the-root-of-postern-domain.md): served at the root of `postern.<domain>`, with Stalwart's API on the same host (`../vps-deploy` brief 14). Revisits "Served at /webmail". Must land before the first deploy. Filed 2026-10-21.

## Parked (todos)

Each needs server work, or a check against Stalwart, before it can be a brief:

- [snooze](../todos/snooze.md)
- [scheduled send](../todos/scheduled-send.md)
- [inbox category tabs](../todos/inbox-category-tabs.md)
- [calendar invites](../todos/calendar-invites.md)
- [conversation view off](../todos/conversation-view-off.md) (a list mode, not server work)

## Owner steps

Things only the owner can do, collected from the briefs as they finished.

- **Deploy** (brief 18). From a clean, committed checkout of this repo (the
  build runs in it, and `npm ci` replaces its `node_modules`), in
  `../vps-deploy`:

  ```
  node cli.ts --check              # the committed Caddyfile matches the stacks
  node cli.ts postern pre-deploy   # /var/www/postern, then the whole Caddyfile:
                                   # validated on the box, Caddy reloaded (sudo)
  node cli.ts postern deploy       # npm ci + npm run build here, upload web/dist
  node cli.ts mail server          # applies the mail plan (webPushContact) and
                                   # restarts Stalwart: a few seconds without mail
  ```

  `postern deploy` warns that postern depends on mail; mail is live, so that
  is expected. The Caddyfile carries both new routes, `/webmail` and
  `/webmail-api`, so the mail stack's own pre-deploy is not needed. If the
  box's `caddy validate` refuses the file, Caddy keeps serving the old
  config; do not restart Caddy until the file is fixed.

  Smoke test, with `<domain>` the production domain:

  - `curl -sI https://<domain>/webmail/` and a deep link such as
    `https://<domain>/webmail/inbox`: 200, `text/html`, every `/webmail/`
    header in [security-headers.md](security-headers.md),
    `Cache-Control: no-cache`, no `Server`.
  - `curl -sI https://<domain>/webmail/manifest.webmanifest`:
    `application/manifest+json`. One file under `/webmail/assets/` (a name
    from `index.html`): `Cache-Control: public, max-age=31536000, immutable`.
  - `curl -s -D - -o /dev/null https://<domain>/webmail-api/jmap/session`
    (a GET; Stalwart may answer a HEAD oddly): its answer to a request with
    no token, carrying the four `/webmail-api/` headers and no `Server`.
  - `curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/webmail-api/admin/`
    prints 404. So do `/webmail-api/api/principal` and
    `/webmail-api/healthz/ready`.
  - No `Service-Worker-Allowed` on any response from the apex.
  - In the browser at `/webmail/`: sign in as your own mailbox (the real
    account, TOTP included), then open and read a conversation.
  - Send a message to another address on the domain: the postmaster alias
    lands in your own Inbox. With Postern open, it appears with no reload
    (live update).
  - DevTools, Network panel with "Preserve log" on, through sign-in, reading
    and sending: every request goes to `/webmail/` or `/webmail-api/` on the
    apex, none to the mail host. The Application panel shows the worker
    active with scope `/webmail/`.
  - Then the Android install and the real push below.
- **Screen reader by ear** (brief 14): the checklist is at the end of
  [brief 14](../briefs/done/14-keyboard-and-accessibility.md).
- **Install on Android** (brief 16, after the deploy): open `/webmail/` in
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
