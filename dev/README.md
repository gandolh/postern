# The local mail server

A Stalwart in Docker to develop and test Postern against, with two seeded
accounts and a corpus of ordinary and hostile mail. It mirrors production's
setup (`../vps-deploy/infrastructure/mail/`): same images, a `config.json` that
only says where the database lives, and everything else in `plan.ndjson`,
applied with the CLI. What this one drops: no recursive resolver, no
PROXY-protocol trust, no ACME, no TLS, no inbound SMTP throttles. It is plain
HTTP, SMTP and IMAP on loopback, and the only mailbox we ever test against.

> Never develop against the owner's real mailbox. That is a hard rule
> (`corpus/CLAUDE.md`). Everything here lives on `postern.test`.

## Requirements

- Docker Desktop (running). Ports are published on `127.0.0.1`; host networking
  would land in the Desktop VM and be unreachable.
- Node 24+ (the repo's engine). `setup.sh` and `seed.ts` run on plain `node`.

## Use it

| Command | What it does |
| --- | --- |
| `npm run dev:mail` | Start the stack, apply the plan, create the accounts and labels. Idempotent. |
| `npm run dev:seed` | Fill the mailboxes from `dev/seed/`, then check the counts against `dev/seed/manifest.json`. Idempotent (refuses if mail is already present). |
| `npm run dev:mail:reset` | Stop the stack and wipe `dev/data/`. Keeps `dev/.env`. |

From a clean checkout:

```sh
npm run dev:mail && npm run dev:seed
```

To start over with empty mailboxes:

```sh
npm run dev:mail:reset && npm run dev:mail && npm run dev:seed
```

Stop without wiping: `docker compose -f dev/docker-compose.yml down`
(the passwords in `dev/.env` are needed to parse the file; any value works for
`down`). Start again with `npm run dev:mail`.

## Ports (all on 127.0.0.1)

| Port | Protocol | Notes |
| --- | --- | --- |
| `18080` | HTTP | JMAP (`/jmap/session`, `/jmap/`), the web admin, OAuth. The Vite dev proxy points here. |
| `12525` | SMTP | Plain text. Accepts unauthenticated local delivery to `@postern.test` from the host, so you can test inbound mail. |
| `11143` | IMAP | Plain text. Plain-text auth is allowed in dev. |

No TLS: these are cleartext, loopback only.

Stalwart's two default inbound throttles are off here (`MtaInboundThrottle` in
`plan.ndjson`): "Sender IP throttle" (5 messages a second per IP, and every
local connection arrives from the same Docker gateway) and "Sender address to
recipient throttle" (25 messages an hour from one sender domain to one
recipient). With them on, a burst of test mail to alice from `postern.test`
made Stalwart refuse bob's replies for an hour and broke the compose
integration test. Production keeps both.

## Accounts

| Address | Display name | Password key in `dev/.env` |
| --- | --- | --- |
| `alice@postern.test` | Alice Archer | `ALICE_PASSWORD` |
| `bob@postern.test` | Bob Baker | `BOB_PASSWORD` |

Alice has the full seed (over 2,800 messages, labels, drafts, Sent, Spam,
Trash, the hostile set). Bob has a small mailbox, including a conversation
shared with Alice.

Alice's labels: the system labels (Inbox, Sent, Drafts, Spam, Trash and **All
Mail**, which is the archive-role mailbox) plus the user labels **Work**,
**Work/Clients** (nested), **Receipts**, **Travel** and **Hostile**.

## Passwords

They live in `dev/.env`, which is git-ignored and written `0600` by
`setup.sh` on first run (random, via `openssl rand`). The keys are
`STALWART_ADMIN_PASSWORD`, `ALICE_PASSWORD` and `BOB_PASSWORD`. Read them from
there; never print or commit the values.

```sh
set -a; . dev/.env; set +a
curl -u "alice@postern.test:$ALICE_PASSWORD" http://127.0.0.1:18080/jmap/session
```

## The admin UI

Open <http://127.0.0.1:18080/admin/>, sign in as `admin` with
`STALWART_ADMIN_PASSWORD` from `dev/.env`. Use it to turn on TOTP for an
account (brief 04), inspect mailboxes, or watch the logs.

## The seed

- `dev/seed/` holds the fixture generators (`*.ts`) and the hostile `.eml`
  files under `dev/seed/hostile/`. Mail is generated deterministically at seed
  time (fixed anchor date, seeded PRNG), so every run produces the same
  mailboxes.
- `dev/seed/manifest.json` records the expected counts per label (messages,
  conversations, unread, starred) for both accounts and lists the hostile
  fixtures with their Message-IDs. Integration tests in later briefs assert
  against it. Regenerate it after changing the fixtures with
  `node dev/seed.ts --write-manifest`, but only alongside a clean reseed, since
  `dev:seed` fails if the server and the manifest disagree.
- The hostile set is filed in Alice's Inbox and in her **Hostile** label, and
  each message carries an `X-Postern-Fixture: hostile/<slug>` header. Every
  payload is harmless and points only at `.test` / `example.com` hosts; the
  script payloads set a `window.__POSTERN_PWNED` canary that brief 17 asserts
  stays unset.
