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
