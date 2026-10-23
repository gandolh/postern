---
summary: Locked calls for Postern, each with date, rejected alternatives and reason. Own Gmail-like app rather than an existing client; JMAP not IMAP; no backend of its own; served at the root of its own host, postern.<domain>, with Stalwart at /webmail-api on the same host (revisited 2026-10-21 from /webmail on the shared estate origin, and what that cost); labels are JMAP mailboxes and archive means leaving the Inbox; message HTML only in a sandboxed iframe; tokens in memory only, and no staying signed in across a reload (owner, 2026-10-20); Postern not registered as an OAuth client; display settings and label colours kept per device (owner, 2026-10-20); no offline mail (owner); closed-app notifications show sender and subject; the house stack; Base UI under the overlays, with the composer window left native. Read before proposing to change any of these.
updated: 2026-10-23
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

## Served at the root of its own host, `postern.<domain>`
_2026-10-21, owner; built 2026-10-22 (brief 19)_. Postern lives at the root of
`postern.<domain>`, and Stalwart's API at `/webmail-api` on that same host,
routed by `../vps-deploy` (its brief 14). Postern was never deployed, so
nobody had a `/webmail` install, bookmark or push subscription to lose.

**This revisits "Served at /webmail, sharing the estate's origin"**
(2026-10-09, owner). That call put Postern at `/webmail` and Stalwart at
`/webmail-api` on the production origin every estate app shares. It rejected
`mail.<domain>/webmail` (an origin shared with Stalwart's admin UI) and
`webmail.<domain>`, because the API would sit on another origin and need
CORS, and Stalwart's only CORS option allows every origin. That objection
held only with the API elsewhere. With the API on Postern's own host there is
no CORS, and `connect-src 'self'` keeps working.

**What the shared origin cost, and why the owner moved it.** Every app on the
apex (atrium, prm, the presentation sites, and every dependency they load) ran
in Postern's origin. As built, `frame-ancestors 'none'`, COOP and in-memory
tokens kept a script in any of them from reaching a token, but it could still
rewrite Postern's preferences, read a notification on screen, unregister the
worker and show a sign-in form the password manager might fill. On its own
host none of that reaches Postern from another app; what is left is a script
that runs on Postern's own origin ([security.md](security.md)). The estate's
rule since 2026-10-21: an app that holds a shell or a mailbox gets a host of
its own.

**Mitigations, all kept:**

- tokens in memory only, until the owner decides otherwise
  ([open-questions.md](open-questions.md));
- message HTML only in the sandbox;
- a strict CSP, with `frame-ancestors 'none'` and COOP;
- a service worker that serves only files whose hash it knows;
- no third-party scripts.

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
the app's DOM. One sanitiser bug would then be script execution on Postern's
origin, with the mailbox in reach. See
[security.md](security.md).

## Tokens in memory only
_2026-10-09_. Access and refresh tokens never touch `localStorage`,
`sessionStorage`, IndexedDB or a script-readable cookie. All of those are
readable by any script on the origin. The cost is that a reload or a new tab
means signing in again, which Gmail users do not expect. The owner kept that
cost on 2026-10-20; see the next entry. The origin has been Postern's alone
since 2026-10-22, and the rule stands until the owner revisits it.

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

**2026-10-22:** it has one (brief 19), so the condition for a revisit is met.
Nothing changed: the tokens still die with the tab. Whether to keep a session
across reloads now is the owner's call, filed in
[open-questions.md](open-questions.md).

## Postern is not registered as an OAuth client
_2026-10-20_. Postern signs in with the constant client ID `postern` and the
redirect URI `${origin}/` (`${origin}/webmail/` until 2026-10-22), and
registers nothing. Stalwart 0.16.25
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

## Base UI under the overlays; the composer window stays native
_2026-10-23_, the owner's call, to match their other apps (atrium,
imbatranimOS, sports-app, trips and others). The modal dialogs are Base UI
`Dialog`/`AlertDialog` through one wrapper, `web/src/shell/Modal.tsx`
([brief 20](../briefs/done/20-base-ui-dialogs.md)). The menus and popovers
follow in brief 21. Base UI owns the focus trap, Escape, the inert page and
focus return, and Postern keeps its CSS. Rejected: keeping native `<dialog>`
with hand-built wiring, and shadcn, which brings Tailwind.

The composer window stays a native `<dialog>`. It switches between docked
(non-modal) and full screen (modal) while the editor keeps its state, and
`show()`/`showModal()` on one element does that without remounting. Because
it is modal in the top layer when full screen, `Modal` portals any dialog
opened inside it, or while it is up, into it. LabelManager's delete
confirmation also stays: it is an inline box in a table cell, not an overlay.
The two comboboxes (recipients, search) stay hand-built (brief 21).
