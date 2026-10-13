---
summary: Snapshot as of 2026-10-09. Nothing built; 18 briefs filed in five waves (foundations, reading, writing and organising, live and settings, hardening and deploy), one line each with dependencies; four Gmail features parked as todos. The order briefs run in.
updated: 2026-10-09
---

# Status (2026-10-09)

Nothing is built. The project was bootstrapped on 2026-10-09; the remote repo
does not exist yet (the owner creates it).

## Briefs, in the order they run

**Wave 1: foundations**
- [01](../briefs/todo/01-scaffold-the-workspaces.md): npm workspaces, house stack, Vite base `/webmail/`, lint, test, typecheck.
- [02](../briefs/todo/02-local-mail-server.md): a Stalwart in Docker with test accounts and seeded mail, hostile mail included. After 01.
- [03](../briefs/todo/03-jmap-client.md): the typed JMAP client: session and URL rebasing, batching, methods, blobs, changes. After 02.
- [04](../briefs/todo/04-sign-in.md): sign-in through Stalwart (OAuth + PKCE + TOTP), tokens in memory, sign-out. After 03.

**Wave 2: reading**
- [05](../briefs/todo/05-app-shell.md): the Gmail layout: top bar, navigation with system labels and counts, routes, themes, the visual identity. After 04.
- [06](../briefs/todo/06-conversation-list.md): the conversation list: virtualised, selection, bulk actions, archive, star, read, undo. After 05.
- [07](../briefs/todo/07-read-a-conversation.md): reading a conversation: sandboxed HTML, blocked images, attachments, quoted text. After 06.

**Wave 3: writing and organising**
- [08](../briefs/todo/08-compose-and-send.md): the composer: reply, forward, rich text, attachments, drafts, send, undo send, signatures. After 07.
- [09](../briefs/todo/09-labels.md): labels on mailboxes: apply, remove, move, create, nest, colours. After 06.
- [10](../briefs/todo/10-search.md): Gmail search operators, highlighted snippets, suggestions, advanced search. After 06.

**Wave 4: live and settings**
- [11](../briefs/todo/11-live-updates.md): live updates by fetch-streamed event source, unread counts in the tab, desktop notifications. After 06.
- [12](../briefs/todo/12-settings.md): the settings pages: display, identities and signatures, vacation responder, storage. After 08.
- [13](../briefs/todo/13-filters-and-spam.md): filters as Sieve, block sender, report spam and not spam. After 09 and 12.
- [14](../briefs/todo/14-keyboard-and-accessibility.md): Gmail's keyboard shortcuts, the help sheet, accessibility pass. After 07 and 08.
- [15](../briefs/todo/15-contacts.md): contacts on JMAP Contacts, recipient autocomplete, sender cards. After 08.

**Wave 5: hardening and deploy**
- [16](../briefs/todo/16-installable-and-mobile.md): installable app, Web Push, phone layout and gestures, the offline decision. After 11.
- [17](../briefs/todo/17-security-hardening.md): the CSP, the hostile-mail browser tests, a token and link review. After 07, 08 and 04.
- [18](../briefs/todo/18-deploy.md): deploy at /webmail through `../vps-deploy`. Owner steps. After 17.

## Parked (todos)

Each needs server work, or a check against Stalwart, before it can be a brief:

- [snooze](../todos/snooze.md)
- [scheduled send](../todos/scheduled-send.md)
- [inbox category tabs](../todos/inbox-category-tabs.md)
- [calendar invites](../todos/calendar-invites.md)
