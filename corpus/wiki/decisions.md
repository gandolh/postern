---
summary: Locked calls for Postern, each with date, rejected alternatives and reason. Own Gmail-like app rather than an existing client; JMAP not IMAP; no backend of its own; served at /webmail with Stalwart at /webmail-api on the shared estate origin (and what that costs); labels are JMAP mailboxes and archive means leaving the Inbox; message HTML only in a sandboxed iframe; tokens in memory only; the house stack. Read before proposing to change any of these.
updated: 2026-10-09
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
dependency they load) runs in the same origin as Postern. A script injected into
any of them can read Postern's memory through a same-origin frame, call
`/webmail-api` with its tokens, and act as the mailbox. Ward and the other apps
already share that origin, so this adds no new kind of risk to the estate. It
puts much more value behind the existing one.

**Mitigations, all required:**

- tokens in memory only;
- message HTML only in the sandbox;
- a strict CSP on `/webmail`;
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
means signing in again, which Gmail users do not expect. Brief 04 looks for the
least-bad way to soften that, and the owner decides.

## The house stack
_2026-10-09_. TypeScript, React 19 and Vite 8, with Vitest and ESLint, in npm
workspaces. Versions are pinned exactly, matching Satchel's at bootstrap.
Rejected: a different framework for this one app. Every other estate app uses
this stack, and so does the owner's muscle memory.
