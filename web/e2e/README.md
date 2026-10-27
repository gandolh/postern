# Browser tests

Postern's security suite (brief 17): Playwright and Chromium against the
production build, served by Caddy in Docker with production's headers, and the
dev Stalwart in `dev/`. What it proves, and why, is in
[corpus/wiki/security.md](../../corpus/wiki/security.md); the headers are in
[security-headers.md](../../corpus/wiki/security-headers.md).

It is not part of `npm run check`: it needs Docker, the dev mail server and a
browser.

## Run it

```sh
npm run dev:mail             # once: the dev Stalwart (never reset it for this)
npx playwright install chromium   # once: the browser Playwright 1.63.0 drives
npm run test:e2e             # builds web/dist, then runs every spec
```

To run without rebuilding (after `npm run build`), or one spec:

```sh
npx playwright test -c web/e2e
npx playwright test -c web/e2e hostile -g script-tag
```

## What the run does to the machine

- **Caddy.** The global setup ([global-setup.ts](global-setup.ts)) starts
  `caddy:2.11.7` as the container `postern-e2e-caddy`, publishing Postern on
  `127.0.0.1:5193` and a stand-in for another estate app on `127.0.0.1:5194`,
  with `web/dist` mounted read-only at `/srv/webmail` and
  [Caddyfile](Caddyfile) as its config. It reaches Stalwart through
  `host.docker.internal:18080`. The container is removed when the run ends,
  failed or not; a leftover one is removed at the next start. Nothing in
  the `postern-dev` compose project is touched. Set `POSTERN_E2E_PORT` for
  another port, and `POSTERN_E2E_PROBE_PORT` for the stand-in's.
- **alice's mailbox.** Opening a conversation marks it read, and the
  signature preview writes alice's identity for a moment. The setup notes
  the unread messages and identities first; the teardown marks unread again
  what the run read, destroys any draft it saved, and puts the identities
  back. It then compares the Inbox and Hostile counts with the start and with
  `dev/seed/manifest.json` (Inbox 2147 messages, 2038 conversations, 129
  unread; Hostile 18, 18, 5) and fails the run if the start and end differ.

## The specs

| Spec | What it checks |
| --- | --- |
| [hostile.spec.ts](hostile.spec.ts) | One test per hostile fixture: no script, no early request, no navigation, the exact sandbox, no message markup in the app's DOM; then spoofed senders, link warnings, attachments. |
| [dns.spec.ts](dns.spec.ts) | Chrome's net log: no host a message names is looked up before "Display images". |
| [csp.spec.ts](csp.spec.ts) | The served headers against [lib/headers.ts](lib/headers.ts), the `/webmail-api` path allowlist, and every screen under the CSP with zero violations. |
| [tokens.spec.ts](tokens.spec.ts) | No secret in storage, cookies, caches, URLs, the DOM or the console; what another estate app's page (same site, another origin) can and cannot reach; cache entries rewritten on the origin are never served; the idle timeout; sign-out. |

Three tests are controls, there to show a green run means something: an
unsandboxed frame does set the canary, an injected inline script is caught by
the CSP watch, and F1 (a page elsewhere on the origin rewriting the service
worker's cache) is marked as an expected failure. When F1 is fixed that test
passes, Playwright reports the unexpected pass, and the mark comes off
([security-findings.md](../../corpus/wiki/security-findings.md)).

## Conventions

- **Passwords.** Read from `dev/.env` (`ALICE_PASSWORD`), typed into the form,
  never printed. No traces or videos: a trace records what was typed. The
  config sets `PLAYWRIGHT_NO_COPY_PROMPT`, which stops the page snapshot a
  failure writes to `test-results/`. A failing locator matcher still writes
  its receiver's accessibility tree, input values included, so `signIn()`
  empties the password field before reporting a failed sign-in, and no spec
  may assert on a locator while the password is in a field. Assertions about
  secrets compare booleans or place names, never values.
- **Service workers.** Blocked by default (the config), because Playwright's
  request routing is not reliable under a worker and the worker never touches
  message content. `csp.spec.ts` and `tokens.spec.ts` turn it on.
- **The outside world.** [lib/app.ts](lib/app.ts) `stubOutsideWorld` answers
  every request that leaves the origin (a small page for new tabs, a 1x1 PNG
  for `track.evil.test`, 404 otherwise), so nothing reaches the network and
  every such request is still recorded. `dns.spec.ts` stubs nothing.
- **Inside a message frame,** drive only real input (mouse moves, clicks at
  coordinates, Tab and Enter). Playwright's locators inside the sandboxed
  frame try to run script there once it is clicked, which the sandbox blocks
  and logs exactly as it would the message's.
- **Output.** `web/e2e/test-results/` and `web/e2e/screenshots/` are
  git-ignored. Take any screenshot to `screenshots/<spec>-<step>.png`.
- **`POSTERN_CSP`** overrides the policy for one run, to try a change before
  writing it into the Caddyfile and `lib/headers.ts`.
