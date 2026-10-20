# Task 02: A local mail server to develop against

## Context

Every later brief needs a real Stalwart with real mail, and the hard rule is
never to develop against the owner's mailbox. This brief gives Postern its own
Stalwart in Docker, on the same version and configuration style as production.
Production's setup is `../vps-deploy/infrastructure/mail/` (compose,
`config.json`, and `plan.ndjson` applied with `stalwart-cli`); read it first and
reuse its shape.

Docker on the dev machine is Docker Desktop. Publish ports on `127.0.0.1` and
point the Vite proxy there; host networking reaches the Desktop VM, not this
machine.

## Files you OWN

- `dev/docker-compose.yml`: Stalwart (the tag `../vps-deploy` pins), its CLI,
  a data-owner helper. Publishes HTTP on `127.0.0.1:18080` and SMTP on
  `127.0.0.1:12525`. No resolver; no PROXY trust.
- `dev/config.json`, `dev/plan.ndjson`: domain `postern.test`, listeners, plain
  HTTP, no ACME, ban periods short.
- `dev/setup.sh`:
  - writes `dev/.env` (git-ignored) with random passwords;
  - starts the stack, applies the plan;
  - creates accounts `alice@postern.test` and `bob@postern.test`, plus an
    identity and a few labels.
- `dev/seed/`: `.eml` fixtures, and `dev/seed.ts`, which imports them with JMAP
  `Email/import`.
- `dev/README.md`: start, stop, reset, the accounts, where the passwords are.
- `corpus/.planned-roots`: remove `dev`.
- Root `package.json`: `dev:mail`, `dev:mail:reset`, `dev:seed` scripts.

## What to do

1. The seed set, enough to exercise every later brief:
   - long conversations (12+ messages), replies with quoted text;
   - HTML newsletters with remote images, plain-text mail, `cid:` inline images;
   - attachments (PDF, image, `.ics`, a large file);
   - many senders, unread and starred messages, mail in several labels;
   - 2,000+ generated messages for list performance.
2. The hostile set from [security.md](../../wiki/security.md):
   - script tags and event handlers, SVG with script;
   - `javascript:` and `data:` links, a meta refresh, CSS overlays;
   - tracking pixels, a forged display name, a double-extension attachment.

   Label them so brief 17 can find them.
3. `dev/setup.sh` is idempotent, and `dev:mail:reset` wipes `dev/data/`.

## Acceptance

- From a clean clone: `npm run dev:mail && npm run dev:seed`, then
  `curl -u alice@postern.test:… http://127.0.0.1:18080/jmap/session` returns a
  session.
- Alice's Inbox holds the seeded conversations. `Email/query` with
  `collapseThreads` counts the expected threads.
- No password appears in any committed file.

## Outcome (2026-10-20)

Built, with IMAP published as well (`127.0.0.1:11143`, plain) so later briefs
can check from an IMAP client. Departures and findings:

- Stalwart 0.16 creates no archive-role mailbox, so `dev/accounts.ts` creates
  "Archive" (Postern's All Mail) for each account. Its system mailbox names are
  Inbox, Sent Items, Drafts, Junk Mail, Deleted Items: resolve by `role`.
- The seed is TypeScript split across `dev/seed/*.ts`, generating most mail at
  seed time; `dev/seed/manifest.json` holds the expected counts and the 17
  hostile fixtures (`X-Postern-Fixture` header, `Hostile` label).
- Docker Desktop's gateway, on a pinned subnet, is allow-listed in `dev/plan.ndjson`
  so wrong-password tests never ban the host. The spam score threshold is
  raised to 100, because unauthenticated loopback delivery scores 13-15.
- `Email/query` cannot filter on `Message-ID` or custom headers in 0.16, so
  seeding is idempotent by "the account already has mail".
- The root `typecheck` script also checks `dev/` (`tsc -p dev`).
