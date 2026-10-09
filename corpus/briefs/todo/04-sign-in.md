# Task 04: Sign in through Stalwart

## Context

Stalwart is the identity provider. Postern signs in with OAuth (authorization
code + PKCE) through Stalwart's own endpoints on the same origin. TOTP is asked
when the account has it. Tokens live in memory only: Postern shares the
`gandolh.ro` origin with every estate app
([decisions.md](../../wiki/decisions.md), [security.md](../../wiki/security.md)).

Two questions from [open-questions.md](../../wiki/open-questions.md) are
settled here, the second by the owner:

- client registration;
- staying signed in across reloads.

## Files you OWN

- `jmap/src/auth/**`: the OAuth flow, token holder, refresh, revoke
- `web/src/auth/**`: the sign-in page, the TOTP step, the session-expired
  dialog, sign-out
- `dev/plan.ndjson`: only if Postern must be registered as a client
- `corpus/wiki/open-questions.md`, `corpus/wiki/decisions.md`: record the
  answers

## What to do

1. **Verify first, against brief 02's server and Stalwart's source:**
   - whether a public client must be registered (dynamic registration exists);
   - the exact `/api/auth` request and response, including `mfaRequired` and
     the `mfaToken` retry;
   - the `/auth/token` exchange and refresh;
   - whether refresh tokens rotate;
   - the revocation endpoint.

   Write the findings into the wiki before coding.
2. The sign-in page asks for email and password, then a TOTP code when
   required, with clear errors (wrong password, rate-limited, account
   disabled). It reads like Gmail's two-step sign-in, in Postern's identity.
3. **The token holder:**
   - access and refresh tokens in a closure, never storage, `BroadcastChannel`
     or a readable cookie;
   - proactive refresh before expiry, and a single in-flight refresh;
   - on failure, the session-expired dialog.
4. **Sign-out** revokes, then clears memory and in-memory caches.
5. **Staying signed in.** Present the options in open-questions to the owner
   with their leak paths, implement the chosen one, and record it as a
   decision.
6. App passwords stay for IMAP clients. Link to Stalwart's account page for
   them, and for turning on TOTP.

## Acceptance

- Against `dev/`:
  - sign in as alice without TOTP;
  - turn TOTP on for bob in Stalwart and sign in with a generated code;
  - a wrong password shows the right error, and the ban threshold is not
    reached in normal use;
  - sign-out revokes, so the old token is rejected.
- A search of the code finds no `localStorage`, `sessionStorage` or `indexedDB`
  touching a token.
- The two open questions are answered in the wiki.
