# Getting started

How to run Postern against a local mail server, check it, and build it. The [main README](../README.md) has the short version.

## Prerequisites

- Node 24 and npm.
- Docker, for the local Stalwart in `dev/`. Its ports are bound to `127.0.0.1`.
- Never develop against a real mailbox. Everything local lives on `postern.test`.

## The local mail server

```bash
npm ci
npm run dev:mail     # starts Stalwart, applies dev/plan.ndjson, creates alice and bob
npm run dev:seed     # fills the mailboxes from dev/seed/ and checks the counts
```

`dev:mail` writes random passwords to the git-ignored `dev/.env` on its first run. Alice has the full seed, over 2,800 messages with labels, drafts, Sent, Spam, Trash and a set of hostile messages; Bob has a small mailbox. Ports, the accounts, the throttles turned off for testing and how to start over are in [dev/README.md](../dev/README.md).

## Run the app

```bash
npm run dev          # builds jmap/, then Vite on http://localhost:5173
```

Vite proxies `/webmail-api` to Stalwart on `127.0.0.1:18080`, the way Caddy serves the deploy on one host. Set `POSTERN_DEV_API` to point it somewhere else. Sign in as `alice@postern.test` with the password from `dev/.env`.

## Check and build

```bash
npm run check        # typecheck, lint, unit and integration tests
npm run build        # web/dist, what the deploy uploads
npm run test:e2e     # the browser security suite: the production build behind Caddy, needs Docker
```

The integration tests and the browser suite talk to the local Stalwart, so start it first. The browser suite's details are in [web/e2e/README.md](../web/e2e/README.md).
