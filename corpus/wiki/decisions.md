---
summary: Locked calls for Postern, each with date, rejected alternatives and reason. Own Gmail-like app rather than an existing client; JMAP not IMAP; no backend of its own; served at /webmail with Stalwart at /webmail-api on the shared estate origin (and what that costs); labels are JMAP mailboxes and archive means leaving the Inbox; message HTML only in a sandboxed iframe; tokens in memory only, and no staying signed in across a reload (owner, 2026-10-20); Postern not registered as an OAuth client; display settings and label colours kept per device (owner, 2026-10-20); no offline mail (owner); closed-app notifications show sender and subject; the house stack. Read before proposing to change any of these.
updated: 2026-10-21
---

# Decisions

Each entry passed three tests: hard to reverse, surprising without context, a
real trade-off. Changing one needs an explicit revisit and a `log.md` entry.

## Our own webmail, shaped like Gmail
_2026-10-09, owner_. Rejected:

- Roundcube and SnappyMail: IMAP clients, each with a PHP server to run.
- Bulwark and ihasmail: existing JMAP clients for Stalwart.

The owner wants their own app, with Gmail's features and feel. An existing
client would have been an evening's deploy; Postern is months of work, chosen
knowingly.

## JMAP, not IMAP
_2026-10-09_. Browsers cannot speak IMAP. Using it would mean a server-side
bridge, and that bridge would hold the mailbox credentials. JMAP is native in
Stalwart, runs over HTTPS as JSON, and moves MIME parsing, threading, search and
push to the server. Rejected: an IMAP bridge, and a generic mail API behind a
custom backend.

## No backend of our own
_2026-10-09_. Postern is static files plus Stalwart. Rejected: a small Node
backend-for-frontend holding the tokens in an HttpOnly cookie. It would hide the
tokens from page scripts, but a script on the same origin could still drive it.
That is the threat the next entry is about. It would also be one more service
to run. Revisit if a feature truly needs one.

## Served at /webmail, sharing the estate's origin
_2026-10-09, owner_. Postern lives at `/webmail`, and Stalwart
is reachable at `/webmail-api`. Rejected:

- `mail.<domain>/webmail`: its own origin, shared only with Stalwart's admin
  UI.
- `webmail.<domain>`: fully isolated, but it needs CORS, and Stalwart's only
  CORS option allows every origin.

**What it costs:** a browser origin is scheme + host + port, so every app on
the production origin (atrium, prm, ward's UI, the presentation sites, and every
dependency they load) runs in the same origin as Postern. When this was decided,
a script injected into any of them could have framed Postern, read its memory
and called `/webmail-api` with its tokens. As built (revisited 2026-10-21),
`frame-ancestors 'none'` and COOP close the frame and opener routes, and the
tokens are in no storage, so that script cannot reach a token (proved by
`web/e2e/tokens.spec.ts`). What it still can do is everything that rides on
origin-wide storage: rewrite Postern's preferences, read a notification on
screen, unregister the service worker, and show a sign-in form of its own that
the browser's password manager may fill, since saved passwords belong to the
origin. Its attempt to plant a page in the service worker's cache is refused
(the worker checks every file's hash). The list is in
[security.md](security.md). Ward and the other apps already share that origin,
so this adds no new kind of risk to the estate. It puts much more value behind
the existing one.

**Mitigations, all required:**

- tokens in memory only;
- message HTML only in the sandbox;
- a strict CSP on `/webmail`, with `frame-ancestors 'none'` and COOP;
- a service worker that serves only files whose hash it knows;
- no third-party scripts.

Revisit if an app with untrusted content (user uploads rendered as HTML, a
forum) ever joins the apex.

## Labels are JMAP mailboxes; archive means leaving the Inbox
_2026-10-09_. Each Gmail-style label is a JMAP `Mailbox`. A message can sit in
several at once (`mailboxIds` is a set), which is exactly Gmail's model.
Archiving removes the Inbox mailbox. JMAP requires every message to be in at
least one mailbox, so a message with no other label moves to the Archive-role
mailbox, which plays Gmail's "All Mail". Rejected: labels as JMAP keywords.
IMAP clients show keywords as flags, not folders, and the owner's phone would
lose the labels.

## Message HTML renders only in a sandboxed iframe
_2026-10-09_. Every body is sanitised, then shown through `srcdoc` in an
`<iframe sandbox>` without `allow-scripts` or `allow-same-origin`. Remote images
stay blocked until asked for. Rejected: sanitising and inserting the HTML into
the app's DOM. One sanitiser bug would then be script execution on the production origin,
which, per the entry above, is every app's problem. See
[security.md](security.md).

## Tokens in memory only
_2026-10-09_. Access and refresh tokens never touch `localStorage`,
`sessionStorage`, IndexedDB or a script-readable cookie. All of those are
readable by any script on the origin. The cost is that a reload or a new tab
means signing in again, which Gmail users do not expect. The owner kept that
cost on 2026-10-20; see the next entry.

## No staying signed in across a reload
_2026-10-20, owner_. A reload or a new tab signs in again; the tokens die with
the tab. The sign-in form is built for password managers instead
(`autocomplete="username"`, `current-password`, `one-time-code`), so signing
in again is a fill and a click. Rejected:

- **A refresh token held in a service worker's memory.** Any same-origin
  script can open a `/webmail/` frame, or `navigator.serviceWorker`, and ask
  the worker for a token, so it hides nothing from the threat in the
  shared-origin entry. Browsers also stop an idle worker after about 30
  seconds, which loses the token anyway.
- **Signing in again silently with a password manager's saved password,
  through the Credential Management API.** Any same-origin script can call
  `navigator.credentials.get` and read the saved password without the user
  seeing anything, which is worse than leaking a token: a password does not
  expire. It also cannot answer a TOTP prompt.

Reason: every way to survive a reload stores a secret somewhere another
estate app's script can reach. Revisit only if Postern gets its own origin.

## Postern is not registered as an OAuth client
_2026-10-20_. Postern signs in with the constant client ID `postern` and the
redirect URI `${origin}/webmail/`, and registers nothing. Stalwart 0.16.25
checks a client ID against its registry only when `requireClientRegistration`
is on; it is off by default, and neither dev's nor production's plan turns it
on. Stalwart only checks that the token request repeats the sign-in's
`client_id` and `redirect_uri`. Rejected:

- **An `OAuthClient` object in the plans.** Nothing would check it while
  registration is off, and it would be one more object to keep in step in
  `../vps-deploy`.
- **Dynamic registration at `/auth/register`.** It returns a stateless client
  ID sealed with the server's OAuth key: a new call on every load, or a value
  that breaks when the key changes. A public client gains nothing from it.

Revisit if production ever turns `requireClientRegistration` on: Postern then
needs an `OAuthClient` with its redirect URI in `../vps-deploy`'s mail plan.

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

## The house stack
_2026-10-09_. TypeScript, React 19 and Vite 8, with Vitest and ESLint, in npm
workspaces. Versions are pinned exactly, matching Satchel's at bootstrap.
Rejected: a different framework for this one app. Every other estate app uses
this stack, and so does the owner's muscle memory.
