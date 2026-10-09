# Task 17: Security hardening

## Context

Postern shows hostile content, holds the keys to the owner's mailbox, and
shares the `gandolh.ro` origin with every estate app
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
