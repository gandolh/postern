# Task 17: Security hardening

## Context

Postern shows hostile content, holds the keys to the owner's mailbox, and
shares the production origin with every estate app
([security.md](../../wiki/security.md), [decisions.md](../../wiki/decisions.md)).
Briefs 04 and 07 built the defences. This brief proves them with automated
tests, and sets the HTTP headers production will send.

## Files you OWN

- `web/e2e/**`: Playwright tests against `dev/`, with the hostile seed set as
  fixtures (use `ui-test-plans` for the hub conventions; screenshots
  git-ignored)
- `corpus/wiki/security.md`: the final CSP and anything learned
- `web/src/render/**` and `web/src/auth/**`: fixes only, each with a test

## What to do

1. **One browser test per hostile fixture**, asserting all of:
   - no script runs (a canary global stays unset);
   - no network request leaves `/webmail` or `/webmail-api` before "Display
     images";
   - no navigation of the top frame;
   - the frame's sandbox attributes are exactly the allowed set.
2. **The CSP.** Settle the final policy (draft in security.md). Verify every
   screen works under it in a production build served with the header, using
   a tiny local static server or Caddy in Docker. Tighten `style-src` if
   possible.
3. **Token review.**
   - Grep and test that no token reaches storage, URLs, logs or error reports.
   - The session timeout and sign-out revoke work.
   - A second same-origin page cannot read the token through
     `BroadcastChannel` or storage.
4. **Links and senders.**
   - Display-name spoofing shows the real address.
   - Text/target mismatch and punycode links get a warning.
   - `rel="noopener noreferrer"` on every message link.
5. **Dependencies.** `npm audit` and a review of every runtime dependency.
   Pin exact versions; no CDN.
6. Run `security-review` over the whole repo, and fix or record each finding.

## Acceptance

- `npm run test:e2e` runs the hostile suite green against `dev/`.
- The CSP is final in security.md, and the production build works under it.
- No serious finding from `security-review` is left unrecorded.

## Outcome (2026-10-20)

Built. `npm run test:e2e` builds Postern, serves it behind Caddy in Docker
with the final headers, proxies `/webmail-api` to `dev/`, and runs 32
Playwright tests: one per hostile fixture (no script, no request before
"Display images", no top navigation, the exact sandbox, no message markup in
the app's DOM), DNS, the CSP walk with zero violations across every screen,
and the token checks. No fixture got through. The final CSP and headers, and
the `/webmail-api` path allowlist, are in
[security-headers.md](../../wiki/security-headers.md); `style-src
'unsafe-inline'` stays, because sandboxed frames inherit the app's policy.
Fixes: slow regexes a hostile plain-text message could exploit, look-alike
link detection that no longer flags every internationalised domain, a
DMARC-pass check before a per-sender image allowance applies, and DNS
prefetching off in frames. `npm audit` found nothing.

Open at this commit: F1 (High), any script on the shared origin can rewrite
the service worker's precache and gain a lasting foothold. The controller
fixes it in the next commit (see [log.md](../../log.md)). Lower findings are
in [security-findings.md](../../wiki/security-findings.md).
