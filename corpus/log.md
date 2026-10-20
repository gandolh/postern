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
