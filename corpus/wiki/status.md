---
summary: Snapshot as of 2026-10-09. Nothing built; 18 briefs filed in five waves (foundations, reading, writing and organising, live and settings, hardening and deploy), one line each with dependencies; four Gmail features parked as todos. The order briefs run in.
updated: 2026-10-09
---

# Status (2026-10-09)

Nothing is built. The project was bootstrapped on 2026-10-09; the remote repo
does not exist yet (the owner creates it).

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
- [18](../briefs/todo/18-deploy.md): deploy at /webmail through `../vps-deploy`. Owner steps. After 17.

## Parked (todos)

Each needs server work, or a check against Stalwart, before it can be a brief:

- [snooze](../todos/snooze.md)
- [scheduled send](../todos/scheduled-send.md)
- [inbox category tabs](../todos/inbox-category-tabs.md)
- [calendar invites](../todos/calendar-invites.md)
- [conversation view off](../todos/conversation-view-off.md) (a list mode, not server work)

## Owner steps

Things only the owner can do, collected from the briefs as they finished.

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
- **In `../vps-deploy`'s mail plan** (brief 16): set Stalwart's
  `webPushContact` (Apple requires the VAPID subject), keep the VAPID key
  stable across upgrades, and allow outbound HTTPS from the mail host to the
  push services.
- **Token lifetimes** (brief 04): decide whether to shorten production's
  access and refresh token lifetimes, since Stalwart cannot revoke a token
  ([open-questions.md](open-questions.md)).
