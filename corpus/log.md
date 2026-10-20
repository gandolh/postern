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
