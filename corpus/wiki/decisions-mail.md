---
summary: Locked calls about how mail behaves in Postern, each with date, rejected alternatives and reason. Labels are JMAP mailboxes and archive means leaving the Inbox; display settings and label colours kept per device (owner, 2026-10-20); no offline mail (owner); closed-app notifications show sender and subject; snooze runs in the browser and wakes mail only while Postern is open (owner, 2026-10-23); no inbox category tabs (owner, 2026-10-23). The architecture and security calls are in decisions.md.
updated: 2026-10-27
---

# Decisions: how mail behaves

Split from [decisions.md](decisions.md) on 2026-10-23, when that page passed 200
lines. The same rules apply: changing one of these needs an explicit revisit and a
`log.md` entry.

## Labels are JMAP mailboxes; archive means leaving the Inbox
_2026-10-09_. Each Gmail-style label is a JMAP `Mailbox`. A message can sit in
several at once (`mailboxIds` is a set), which is exactly Gmail's model.
Archiving removes the Inbox mailbox. JMAP requires every message to be in at
least one mailbox, so a message with no other label moves to the Archive-role
mailbox, which plays Gmail's "All Mail". Rejected: labels as JMAP keywords.
IMAP clients show keywords as flags, not folders, and the owner's phone would
lose the labels.

## Display settings and label colours live in this browser
_2026-10-20, owner_. Density, theme, reading pane, undo-send delay, label
colours and "show if unread" are kept per device in `localStorage`, and
every read and write falls back to memory when storage is blocked. Theme,
density and reading pane are device-wide (they apply before sign-in); the
rest is keyed by account. A new device starts from defaults. None of it is secret, so the
shared origin does not matter here. Show and hide in the navigation is the
mailbox's `isSubscribed`, which lives on the server and which IMAP clients
honour too. Rejected:

- **A JSON file in Stalwart through JMAP FileNode.** It syncs devices, but it
  rests on Stalwart's draft FileNode support, one more thing to break on an
  upgrade, for settings the owner rarely changes.
- **A hidden settings message in its own label.** It syncs everywhere, but
  the label shows up as a folder in the phone's mail app.

## No offline mail
_2026-10-20, owner_. The installed app caches only its shell (HTML, JS, CSS,
fonts, icons). No mail, no `/webmail-api` response, no IndexedDB and no
offline outbox. Offline, it opens to the sign-in page (tokens die with the
tab) and says it cannot reach the mail server. Rejected: caching the
conversation list, and caching recent mail with an outbox. Either would sit
in storage that any script on the shared origin can read, even with Postern
closed, and encrypting it with an in-memory key protects nothing while the
app is open.

## Closed-app notifications show sender and subject
_2026-10-20, controller; the owner may flip it_. When Web Push is on, Stalwart
pushes the new message's sender and subject (JMAP `emailpush`, encrypted to
the subscription's keys) and the service worker shows them, without any
token. Rejected: a generic "New mail" only, which hides nothing a script
could not learn by other means while Postern is open, but shows less than the
brief asked for. Cost: while a notification is on screen, any script on the
origin can read its sender and subject through
`registration.getNotifications()`, even with Postern closed. Web Push is off
until the user turns it on. To go generic, `emailPushConfig()` in
`web/src/push/PushHost.tsx` returns null.

## Snooze runs in the browser
_2026-10-23_, the owner's call. Snoozed mail waits in a hidden Snoozed label with
its wake-up time in a keyword, and an open Postern moves it back to the Inbox when
the time comes. A laptop left shut skips the wake-up until Postern is opened again.
Rejected: a small scheduler service on the VPS, which would wake mail on time but
breaks "No backend of our own"; and dropping snooze. Brief 24 first checks that
Stalwart has no server-side way, and brings one back to the owner if it does.
It found none (2026-10-27). An indirect route remains open to the owner: a held
self-addressed message (FUTURERELEASE, as schedule send uses) could land in the
conversation at the time with Postern closed, at the cost of an extra message
in the thread.

## No inbox category tabs
_2026-10-23_, the owner's call. The Inbox has no Primary / Social / Promotions /
Updates tabs. Stalwart has no classifier like Gmail's, and the only approximation is
Sieve rules on headers (`List-Unsubscribe`, `Precedence: bulk`, a list of social
senders), which misfile enough mail to cost more than they save. Rejected: the four
header-rule tabs, and a single Promotions tab for bulk mail. Labels and filters
cover the need.
