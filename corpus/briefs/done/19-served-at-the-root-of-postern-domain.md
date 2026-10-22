# Brief 19: Served at the root of postern.<domain>

## Context

On 2026-10-21 the owner asked for Postern on its own subdomain,
`postern.<domain>`, instead of `/webmail` on the estate's shared origin. The
routing is `../vps-deploy`'s brief 14. Stalwart's API moves onto the same host,
at `postern.<domain>/webmail-api`, so Postern stays same-origin with its API.

This revisits "Served at /webmail, sharing the estate's origin" in
[decisions.md](../../wiki/decisions.md). Its reason for rejecting a subdomain
was CORS, and that only applied with the API on another origin, which is no
longer the plan. Postern was never deployed, so no user has a `/webmail`
install, bookmark or push subscription to lose.

What has the base baked in (checked 2026-10-21):

- `BASE = "/webmail/"` in `web/vite.config.ts`. It drives the build's base, the
  service worker's scope and the manifest's `id`, `scope` and `start_url`.
- `redirectUri()` in `web/src/auth/config.ts` derives from the origin plus
  `BASE_URL`, so it follows the base on its own.
- JMAP session URLs are rebased onto the base (`jmap/src/session.ts`).
- The e2e harness hardcodes `/webmail`: `web/e2e/Caddyfile` and
  `web/e2e/lib/env.ts`.

## Files you OWN

- `web/vite.config.ts`, `web/e2e/Caddyfile`, `web/e2e/lib/env.ts`, and any
  test or comment that names `/webmail/` as Postern's base.
- `corpus/wiki/decisions.md`, `corpus/wiki/security.md`,
  `corpus/wiki/architecture.md`, `corpus/wiki/status.md`, `corpus/log.md`.

## Files you must NOT touch

- `API_BASE = "/webmail-api"` and the service worker's `API_PREFIX`. The API
  keeps its path. Renaming it touches `../vps-deploy` too and buys nothing.
- The token handling. "Tokens live in memory only" says "Revisit only if
  Postern gets its own origin", and this brief gives it one. Whether to keep a
  session across reloads is a separate call for the owner. Record it in
  `open-questions.md` and leave it.

## What to do

1. Set the base to `/`. Check that the service worker's scope, the manifest and
   the denylist in `web/src/sw/routing.ts` still exclude `/webmail-api`, now
   that the app's scope covers the whole host.
2. Point the e2e harness at the root, and run the full e2e suite against the
   local Stalwart in `dev/`, never the real mailbox.
3. Revisit the decision in `decisions.md`: the date, the owner's ask, the new
   origin, and why the CORS objection no longer applies. Shorten the list of
   same-origin risks in `security.md`: other estate apps no longer share
   Postern's origin. Keep the hash check on cached files.
4. Update `status.md`'s deploy steps to the new host, after `../vps-deploy`
   brief 14.

## Acceptance

- The typecheck, the unit tests and the e2e suite pass with the base at `/`.
- A production build's `index.html`, manifest and service worker all use `/`,
  and nothing in `web/dist` names `/webmail/`.
- Signing in through the local dev setup lands back on `/` with a working
  session, and every API call goes to `/webmail-api` on the same origin.
- The decision entry carries the revisit, and the open question about keeping
  a session across reloads is filed.

## Outcome (2026-10-22)

Done. The base is `/` (`web/vite.config.ts`); the worker's scope, the
manifest's `id`, `scope` and `start_url`, and the sign-in redirect all follow
it. `isApiPath` and the navigation denylist keep `/webmail-api` out of the
worker now that the scope covers the whole host, and `routing.test.ts` tests
the root scope. The e2e harness serves Postern at the root of `:80` and moves
the stand-in for another estate app to its own origin on `:81` (5194), as the
apex apps are to `postern.<domain>`. From there it sees no cookie, worker,
preferences or cache of Postern's. The cache-poisoning tests write from a
Postern page instead, since no other app can reach the cache now, and the
hash check still refuses every rewritten file. The typecheck, lint, 1135 unit
tests and all 34 browser tests pass against the local Stalwart, and
`web/dist` names `/webmail/` nowhere. The decision carries the revisit, the
security pages lost the shared-origin list, and keeping a session across
reloads is filed as an open question. brief-board is down, so nothing was
posted there.
