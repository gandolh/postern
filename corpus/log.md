# Log

## 2026-10-09 — bootstrap | Postern: a Gmail-like webmail on Stalwart

The owner asked for their own webmail, "similar as feature and aspect to
Gmail". It is a new project, saved locally; the owner creates the remote repo
later.

Owner calls: the name is Postern, and it is served at `/webmail`, on
the apex rather than `mail.<domain>`.

Researched against the Stalwart 0.16 source the same day:

- Stalwart serves JMAP: mail, submission, vacation responder, Sieve, contacts,
  calendars, quota, blob and push.
- A browser app can sign in with OAuth plus PKCE, including the TOTP step.
- JMAP push (`/jmap/eventsource`, `/jmap/ws`) accepts only an `Authorization`
  header. The browser's `EventSource` and `WebSocket` cannot send one.

Seeded the wiki (overview, architecture, decisions, security, gmail-on-jmap,
design, glossary, status, open questions), filed briefs 01-18, and captured
four later features as todos.

## [2026-10-20] done | Brief 01: the workspaces

npm workspaces `jmap` and `web` on Satchel's pinned versions, with `check`,
`build`, `dev`, `lint`, `test` and `typecheck` scripts. Vite builds to
`web/dist` with base `/webmail/` and proxies `/webmail-api` to
`POSTERN_DEV_API` (default `http://127.0.0.1:18080`). Verified: `npm run
check` green, built asset URLs start with `/webmail/`, corpus lint clean.
[Brief](briefs/done/01-scaffold-the-workspaces.md).

## [2026-10-20] done | Brief 02: a local Stalwart with seeded mail

`dev/` runs Stalwart v0.16.25 and its CLI in Docker on loopback ports 18080
(HTTP), 12525 (SMTP) and 11143 (IMAP). `npm run dev:mail` creates alice and
bob with passwords in the git-ignored `dev/.env`, and `npm run dev:seed`
imports about 2,800 messages for alice, including 17 hostile fixtures and the
counts in `dev/seed/manifest.json`. Stalwart creates no All Mail mailbox and
cannot search headers; both are now in
[gmail-on-jmap.md](wiki/gmail-on-jmap.md). Verified: session 200, label counts
match the manifest, IMAP and SMTP work, no secret in tracked files.
[Brief](briefs/done/02-local-mail-server.md).

## [2026-10-20] done | Brief 03: the JMAP client

`@postern/jmap` has the session with URL rebasing, a batching request builder
with back-references that splits to fit Stalwart's limits, typed wrappers for
every object the briefs use, blobs, a state cache for `/changes` and
`/queryChanges`, and a `fetch()`-based push reader with backoff and a polling
fallback. The polling fallback in [architecture.md](wiki/architecture.md) was
wrong (the session state never moves) and is corrected. 129 tests green,
including 15 against `dev/`. [Brief](briefs/done/03-jmap-client.md).

## [2026-10-20] decision | Sign in again after a reload; no client registration

The owner chose to keep tokens dying with the tab: a reload signs in again.
The service-worker and saved-password alternatives each leave a secret that
another estate app's script can reach. Postern is not registered as an OAuth
client, because Stalwart only checks registration when production turns it
on. Both are in [decisions.md](wiki/decisions.md); the two open questions are
gone, and a new one asks whether to shorten production's token lifetimes.

## [2026-10-20] done | Brief 04: sign-in through Stalwart

`AuthSession` in `@postern/jmap` runs PKCE sign-in with the TOTP step, keeps
the tokens in private fields, refreshes ahead of expiry with one refresh in
flight, and signs out after 8 idle hours. `web/src/auth` has the two-step
sign-in page, the session-expired dialog and `useJmap()`. Stalwart cannot
revoke tokens; [security.md](wiki/security.md) records what that costs.
Verified in Chrome and against `dev/`, including TOTP for bob. 182 tests.
[Brief](briefs/done/04-sign-in.md).

## [2026-10-20] done | Brief 05: the app shell and visual system

Gmail's layout in Postern's own palette, type and mark, with light and dark
themes, three densities, hash routes with working back and forward, label
counts from `Mailbox/get`, a toast, and states for loading, empty labels and
being offline. Later briefs fill placeholder files the shell already renders.
[design.md](wiki/design.md) records the tokens. Verified in Chrome against
`dev/`; 260 tests. [Brief](briefs/done/05-app-shell.md).

## [2026-10-20] done | Brief 06: the conversation list

One row per conversation, paged 50 at a time in one batched request each,
with Gmail's senders line, label chips, selection (ranges, "select all N"),
a toolbar, hover actions, and optimistic archive, delete, star, read and
important with Undo. All Mail lists everything outside Spam and Trash, as in
Gmail ([gmail-on-jmap.md](wiki/gmail-on-jmap.md)). The list exposes hooks for
live updates (brief 11) and shortcuts (brief 14). Checked from IMAP; 358
tests. [Brief](briefs/done/06-conversation-list.md).

## [2026-10-20] decision | Display settings and label colours stay per device

The owner chose the browser over a FileNode settings file or a hidden
settings message. Recorded in [decisions.md](wiki/decisions.md); the open
question is gone.

## [2026-10-20] done | Brief 09: labels

Gmail's label menu (checkboxes, indeterminate, search, create), Move to,
create, rename, nest and delete, a label manager in `#settings/labels`,
colours, "show if unread", and drag a conversation onto a label. Labels made
in Postern appear as IMAP folders and the reverse. Deleting a label never
leaves a message with no label (checked with `Email/get`).
[Brief](briefs/done/09-labels.md).

## [2026-10-20] done | Brief 10: search

A pure operator parser and filter builder in `@postern/jmap`, the search box
with suggestions and an advanced-search dropdown, and results with
highlighted snippets and every list action. What Stalwart's search can and
cannot do is now in [gmail-on-jmap.md](wiki/gmail-on-jmap.md).
[Brief](briefs/done/10-search.md).

## [2026-10-20] done | Brief 11: live updates and notifications

New mail, stars and moves show without a reload; the tab title and favicon
carry the Inbox unread count; desktop notifications are opt-in, per device,
Inbox only, sender and subject only. Reconnects after a server restart were
checked by the controller, which also fixed the dev proxy holding
event-stream headers. [architecture.md](wiki/architecture.md) has the as-built
notes. [Brief](briefs/done/11-live-updates.md).

## [2026-10-20] done | Brief 07: reading a conversation

The conversation view with Gmail's folding, message cards with the real
address beside every name, details from `Authentication-Results`, show
original, attachments with image and PDF preview, and bodies sanitised with
DOMPurify into sandboxed `srcdoc` frames with remote content blocked until
asked. Checked in Chrome against all 17 hostile fixtures. How it was built,
and its known gaps, are in [security.md](wiki/security.md).
[Brief](briefs/done/07-read-a-conversation.md).

## [2026-10-20] resume | Briefs 01-07 and 09-11 done; next 08, then 12 and 15

The owner's answers for this run (2026-10-20): sign in again after a reload,
display settings per device, no offline mail, and build every brief through
17 with brief 18 left for the owner to commit and deploy. Waves still to run:
08, then 12 with 15, then 13, 14, 16, 17 and 18. Each brief's outcome note in
`briefs/done/` names the hooks later briefs plug into (the shell renders
placeholder files at each later brief's paths). The dev Stalwart must not be
reset while agents run; integration test files run one at a time.

## [2026-10-20] maintenance | Rendering hardened after a security review

A review of brief 07 found no path from a message to script in Postern's
origin. It found one Important defect: a double-escaped CSS `url()` came out
of the sanitiser as a working single escape, so blocking a tracking pixel
rested on the frame's CSP alone. Fixed, with four Minor ones (nested-CSS
`position`, bidi isolation, forgeable link pills, preview size caps). See
[security.md](wiki/security.md).

## [2026-10-20] done | Brief 08: compose and send

Docked, stackable composer windows and inline replies; recipient chips;
a rich-text editor whose every HTML input is sanitised; attachments with
upload progress and pasted images as `cid:` parts; autosaved drafts; send
with undo; reply, reply all and forward threaded with `In-Reply-To` and
`References`. What Stalwart does with drafts, forwards and failed deliveries
is in [gmail-on-jmap.md](wiki/gmail-on-jmap.md).
[Brief](briefs/done/08-compose-and-send.md).

## [2026-10-20] done | Brief 12: settings

General, Accounts, Labels and a Filters placeholder under `#settings/`,
applying at once. Per-device preferences live in `web/src/prefs/`; the
decision now says which are device-wide and which per account. What
Stalwart's vacation responder, quota and identities do is in
[gmail-on-jmap.md](wiki/gmail-on-jmap.md). Conversation view off is filed as
[a todo](todos/conversation-view-off.md). [Brief](briefs/done/12-settings.md).

## [2026-10-20] done | Brief 15: contacts

JMAP Contacts in `@postern/jmap`, a Contacts page at `#contacts`, recipient
autocomplete from contacts and from people alice has written to, sender
hover cards, and a Contacts group in search suggestions. Checked over
CardDAV. Stalwart's contact quirks are in
[gmail-on-jmap.md](wiki/gmail-on-jmap.md). [Brief](briefs/done/15-contacts.md).

## [2026-10-20] maintenance | Composer fixed after a review

A review of brief 08 found the composer's sanitising sound and three
Important bugs: popping out an inline reply lost recent typing, two
composers could hold one draft and leave duplicates, and closing during an
upload saved the draft without the file. All fixed with tests, along with
three Minor ones (marker classes kept on pasted HTML, conversation actions
touching a hidden reply draft, discard during undo send). New messages now
start from the per-device default identity. Still open: deleting a
conversation from the list moves its open reply draft to Trash, and the
composer's next autosave puts it back (`web/src/actions/plans.ts`).

## [2026-10-20] done | Brief 13: filters, blocking and spam

Gmail-style filters saved as one generated Sieve script, "Filter messages
like these" with "Also apply to matching conversations", Block sender, and
Report spam / Not spam, which train Stalwart's classifier (the open question
is answered and gone). The vacation responder and the filters share
Stalwart's single active script slot; [gmail-on-jmap.md](wiki/gmail-on-jmap.md)
explains. Dev's inbound SMTP throttles are off. [Brief](briefs/done/13-filters-and-spam.md).

## [2026-10-20] done | Brief 14: keyboard shortcuts and accessibility

Gmail's shortcuts with `g` sequences and a searchable help sheet, and an
accessibility pass: axe-core clean on every route in both themes, contrast
checked per token pair, focus restored after list actions, reduced motion
honoured, no horizontal scroll at 640 px. The screen-reader check by ear is an
owner step listed in the [brief](briefs/done/14-keyboard-and-accessibility.md).

## [2026-10-20] decision | No offline mail; closed-app notifications name the sender

The owner chose no offline mail: the installed app caches its shell and
nothing else. The controller kept sender and subject in closed-app
notifications, which Stalwart's `emailpush` delivers encrypted without any
token in the worker, and recorded the cost (a displayed notification is
readable by any script on the origin) so the owner can flip it. Both are in
[decisions.md](wiki/decisions.md); the offline open question is gone.

## [2026-10-20] done | Brief 16: installable app, Web Push and the phone

A PWA scoped to `/webmail/` caching only its shell, Web Push while closed
(checked through FCM and Mozilla), and a phone layout with swipe actions,
pull to refresh and a floating Compose button. The service worker's estate
rules (no `Service-Worker-Allowed`, no root-scope worker anywhere on the
origin) are in [security.md](wiki/security.md).
[Brief](briefs/done/16-installable-and-mobile.md).

## [2026-10-20] done | Brief 17: security hardening

A Playwright suite behind Caddy proves every hostile fixture harmless, the
final CSP works on every screen, and no secret reaches storage, URLs, logs
or another page on the origin. The headers brief 18 must set are in
[security-headers.md](wiki/security-headers.md), findings in
[security-findings.md](wiki/security-findings.md). It found one High: the
service worker's cache is writable by any script on the origin.
[Brief](briefs/done/17-security-hardening.md).

## [2026-10-20] maintenance | The service worker serves only verified files (F1)

Brief 17 found that any script on the shared origin could rewrite the
service worker's precache and gain a lasting foothold. The worker now keeps
its own cache, checks every file against a SHA-256 baked into `sw.js` at build
time, and builds each response itself with the production headers, so a
forged entry or stripped headers are never served. The installed app still
opens offline to the sign-in page. Also fixed: `SKIP_WAITING` only from a
`/webmail/` window (F7), worker messages only from Postern's own worker (F8),
and a page reload on a worker update only while signed out and hidden. See
[security-findings.md](wiki/security-findings.md).

## [2026-10-21] done | Brief 18: the deploy, prepared for the owner

`../vps-deploy` gained the `postern` stack and the `/webmail-api` route
(committed there as `85f0934`, not pushed), with Postern's headers, a path
allowlist for the API and `webPushContact` for Web Push. The e2e Caddyfile
now matches production's block. Everything passes short of the deploy,
which is the owner's: commands and smoke test in
[status.md](wiki/status.md). With this, every brief is done.
[Brief](briefs/done/18-deploy.md).

## [2026-10-21] maintenance | Seams fixed after a final review

Seven seams between finished briefs, fixed with tests. Every sign-out, user
or idle, first saves drafts, sends what is held for Undo and drops Web Push
(at most 3 s, [security.md](wiki/security.md)), then clears the address bar
and the undo list. Search opens a conversation in the search's scope, once
the labels are in. A toast's Undo runs its own action, `z` the newest, Undo
send and Block sender included. Open conversations keep in-flight stars and
mark arrivals read; session errors no longer toast. Brief 12's note that the
composer does not read the default identity yet is stale: it does.

## [2026-10-21] decision | The shared-origin cost, revisited as built

The "Served at /webmail" entry in [decisions.md](wiki/decisions.md) still
said a script elsewhere on the origin could frame Postern and use its tokens.
As built, `frame-ancestors 'none'` and COOP close that, no token is in any
storage, and the service worker refuses planted files. The entry now names
what such a script can still do (preferences, notifications, the worker's
registration, and a look-alike sign-in form the password manager may fill).
The decision itself stands.

## 2026-10-21: brief 19 filed, Postern gets its own origin

The owner asked for Postern on its own subdomain, `postern.<domain>`. `../vps-deploy` brief 14 routes it, with Stalwart's API on the same host at `/webmail-api`, so Postern stays same-origin with its API and the CORS objection in "Served at /webmail, sharing the estate's origin" no longer applies. [Brief 19](briefs/done/19-served-at-the-root-of-postern-domain.md) moves the base from `/webmail/` to `/` and revisits that decision. Nothing was deployed at `/webmail`, so no install or push subscription is lost. Whether a session should now survive a reload is left as an open question for the owner.

## 2026-10-22: brief 19 done, Postern at the root of postern.<domain>

The base moved from `/webmail/` to `/`, with `../vps-deploy` brief 14 routing
`postern.<domain>` and Stalwart's API on the same host. The e2e harness now
puts the stand-in for another estate app on a second origin (same site,
`localhost:5194`), which is what the apex apps are to Postern now, and
`tokens.spec.ts` asserts that it sees nothing of Postern's: no cookie, no
worker registration, no preferences, no cache. The three cache-poisoning tests
write from a Postern page, because no other app can reach Postern's Cache
Storage any more; the hash check (F1) still refuses every rewritten file. A
first attempt wrote from Caddy's 404 for a refused API path, but Chrome
replaces an empty 404 with its own error page.

[decisions.md](wiki/decisions.md) records the revisit: the CORS objection held
only with the API on another origin. [security.md](wiki/security.md) drops the
list of what another app could do on the shared origin and keeps what a
script on Postern's own origin could. "No staying signed in across a reload"
named its own origin as the revisit condition; it is met, nothing changed, and
the question is in [open-questions.md](wiki/open-questions.md) for the owner.

Checked: typecheck, lint, 1135 unit tests, and all 34 browser tests against
the local Stalwart (started with `npm run dev:mail`, not reset). A production
build's `index.html`, manifest and worker use `/`. brief-board is down
(since 2026-10-13), so the brief's progress is recorded here only.

## [2026-10-23] todo | Briefs 20 and 21 filed: Base UI

The owner asked for Base UI in the apps that still hand-build their widgets.
Postern has the most, so the work is split in two.
[Brief 20](briefs/done/20-base-ui-dialogs.md) moves seven modal dialogs to Base
UI `Dialog`/`AlertDialog`, leaving the composer window native.
[Brief 21](briefs/done/21-base-ui-menus-and-popovers.md) moves the menus,
popovers and sender card, leaving the two comboboxes hand-built.
brief-board is down (since 2026-10-13), so this is recorded here only.

## [2026-10-23] done | Brief 20: Base UI for the modal dialogs

[Brief 20](briefs/done/20-base-ui-dialogs.md) is built. Six dialogs are Base UI
`Dialog`/`AlertDialog` through `shell/Modal`. The wrapper portals a dialog into
the full-screen composer (still a native modal `<dialog>`) when it is opened
from there or while it is up. `Question` keeps its Escape guard for the
composer, and `SessionExpiredDialog` loses its browser workarounds. LabelManager's
inline confirmation stays. 1166 unit and 34 browser tests pass. Focus now
returns to the trigger, where the native dialogs dropped it. The decision is in
[decisions.md](wiki/decisions.md).

## [2026-10-23] done | Brief 21: Base UI for the menus and popovers

[Brief 21](briefs/done/21-base-ui-menus-and-popovers.md) is built. The menus,
including the composer's More options, are Base UI `Menu`s. The account card,
the label panel (button and keyboard) and advanced search are `Popover`s. Menu
items run from `finalFocus`. The composer's menu portals into the full-screen
composer and keeps Escape to itself. Advanced search portals into the search
root. The keyboard's label popover now opens under the focused row. The sender
card stays hand-built, because PreviewCard isn't keyboard navigable and the
card has actions. 1166 unit and 34 browser tests pass.

## [2026-10-23] todo | Briefs 22 and 23 from the parked todos

[22](briefs/todo/22-conversation-view-off.md): conversation view off. A message row is a
`Conversation` holding one message, so the planners, selection and undo should work
unchanged; the list queries without `collapseThreads` and keys its cache on the mode.
[23](briefs/todo/23-schedule-send.md): schedule send. Step one tests a future `sendAt`
against the dev Stalwart, including cancel and restart; if Stalwart doesn't hold the
message the brief stops and moves to `superseded/` with the finding, since undo send is
client-held and there is no server-side precedent to lean on. Snooze, inbox category tabs
and calendar invites stay parked for the owner's call.

## [2026-10-23] decision | Snooze runs in the browser; brief 24

Asked what snooze does without a server-side mechanism, the owner chose the
browser-only version over a scheduler service or dropping it. Recorded in
[decisions-mail.md](wiki/decisions-mail.md). [Brief 24](briefs/todo/24-snooze.md) keeps the wake-up
time on the server as a keyword beside a hidden Snoozed label, so every device agrees,
and wakes conversations once a minute while Postern is open.

## [2026-10-23] maintenance | decisions.md split in two

Adding the snooze entry took `decisions.md` past 200 lines. The calls about how mail
behaves (labels and archive, per-device settings, no offline mail, closed-app
notifications, snooze) moved verbatim to [decisions-mail.md](wiki/decisions-mail.md);
architecture and security stay in [decisions.md](wiki/decisions.md). Links in
`security.md`, the conversation-view todo and two code comments now point at the new page.

## [2026-10-23] decision | No inbox category tabs

The owner dropped the inbox category tabs: with no classifier in Stalwart, header rules
would misfile too much. Recorded in [decisions-mail.md](wiki/decisions-mail.md); the todo
is marked dropped.

## [2026-10-23] todo | Brief 25: a calendar invite's card and reply

The owner chose a card and a reply only, over adding an "Add to Almanac" button or a
calendar inside Postern. [Brief 25](briefs/todo/25-calendar-invite-card.md) first checks
what Stalwart 0.16 does with an iMIP REQUEST and whether it can send the REPLY, then
parses the VEVENT fields the card needs and shows them as inert text. No todos are parked
now.
