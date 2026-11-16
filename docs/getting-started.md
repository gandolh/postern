# Getting started

How to run Postern against a local mail server, check it, and build it. The [main README](../README.md) has the short version.

## Prerequisites

- Node 24 and npm (`engines` in `package.json` asks for 24 or later).
- Docker, for the local Stalwart in `dev/`. Its ports are bound to `127.0.0.1`.
- Never develop against a real mailbox. Everything local lives on `postern.test`.

## The local mail server

```bash
npm ci
npm run dev:mail     # starts Stalwart, applies dev/plan.ndjson, creates alice and bob
npm run dev:seed     # fills the mailboxes from dev/seed/ and checks the counts
```

`dev:mail` writes random passwords to the git-ignored `dev/.env` on its first run. Alice has the full seed, 2,819 messages with labels, drafts, Sent, Spam, Trash and a set of hostile messages; Bob has 26. `npm run dev:mail:reset` stops the server and wipes its data. Ports, the accounts, the throttles turned off for testing and how to start over are in [dev/README.md](../dev/README.md).

## Run the app

```bash
npm run dev          # builds jmap/, then Vite on http://localhost:5173
```

Vite proxies `/webmail-api` to Stalwart on `127.0.0.1:18080`, the way Caddy serves the deploy on one host. Set `POSTERN_DEV_API` to point it somewhere else. Sign in as `alice@postern.test` with the password from `dev/.env`.

The port is fixed in `web/vite.config.ts`. For another one, build the client and pass Vite the port:

```bash
npx tsc -b jmap && npm run dev -w @postern/web -- --port 5180 --strictPort
```

There is no service worker under `vite dev`. To try the installable app and push locally, run `npm run build`, then `npm run preview -w @postern/web`.

## Check and build

```bash
npm run check        # typecheck, lint, format check, conventions, contrast, unit and integration tests
npm run check:fast   # the typechecks, then ESLint on the changed files (the Stop hook runs it)
npm run format       # Prettier over the code (Markdown stays out)
npm run build        # web/dist, what the deploy uploads
```

`npm run typecheck` is six `tsc` runs: `tsc -b`, the JMAP tests, `web`, the web tests, `dev` and `web/e2e`. `npm run contrast` measures the light and dark colour pairs and fails below their minimum.

The integration tests (`jmap/test/integration`, `web/test/integration`) talk to the local Stalwart and skip without it, so start `npm run dev:mail` first if a green `check` is to mean the whole suite ran.

## The browser checks

Two Playwright suites, both outside `npm run check`:

```bash
npm run test:e2e     # the security suite: the production build behind Caddy, needs Docker and the local Stalwart
npm run build && npx playwright test -c web/e2e/desk/desk.config.ts   # the redesign's checks, no Docker
```

The first runs the CSP, hostile-mail, token, reload and navigation specs against a real Stalwart. The second answers `/webmail-api` from a stub built on `dev/seed/`, so it runs anywhere a browser does; it checks the focus ring, reduced motion, overflow at 390 px, the theme and the first screen's row count, and with `SHOTS_DIR=<dir>` it takes a screenshot of every screen. Both are described in [web/e2e/README.md](../web/e2e/README.md).
