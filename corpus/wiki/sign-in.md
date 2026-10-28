---
summary: How Postern signs in through Stalwart and keeps the session, as built. Brief 04's checked shapes (Postern's own form posting to /api/auth, the TOTP retry, the code exchange at /auth/token with PKCE, /auth/userinfo), refresh (no rotation on Stalwart's defaults) and token lifetimes, no revocation (sealed stateless tokens; a password change kills them all), no client registration, Stalwart's account page; and since brief 27 the refresh token in sessionStorage, so a reload resumes with one refresh grant (the SessionStore adapter, resume() and its outcomes, the idle clock across a reload, two tabs). The rules are in security.md.
updated: 2026-10-28
---

# Sign-in and the session

Moved here from [architecture.md](architecture.md) on 2026-10-28, unchanged
but for its heading. The token rules and their threats are in
[security.md](security.md).

## As built in brief 04

Stalwart is the identity provider. Verified on 2026-10-20 against Stalwart
0.16.25's source (the OAuth and auth modules of its `http` and `common`
crates) and the dev server. Code: [jmap/src/auth](../../jmap/src/auth/),
[web/src/auth](../../web/src/auth/).

1. Postern's own form posts JSON to `/webmail-api/api/auth`: `{type:
   "authCode", accountName, accountSecret, clientId: "postern", redirectUri,
   scope, codeChallenge, codeChallengeMethod: "S256"}`. No browser redirect
   happens; the code comes back in the answer.
2. The answer is always 200 with one of `{type: "authenticated", client_code,
   iss}` (note the snake case), `{type: "mfaRequired"}` (the password was
   right and TOTP is on) or `{type: "failure"}`. The TOTP retry re-posts the
   same body plus `mfaToken`, password included, so the form keeps the
   password in component state until the code is accepted.
3. The code goes to `/webmail-api/auth/token` (form-encoded,
   `grant_type=authorization_code`, `code`, `client_id`, `redirect_uri`,
   `code_verifier`). It is single use, expires in 10 minutes, and
   `client_id` and `redirect_uri` must match step 1 byte for byte. The answer
   has `access_token`, `refresh_token`, `expires_in`, `id_token` (discarded).
4. JMAP calls send `Authorization: Bearer`. The display name comes from
   `GET /auth/userinfo` (`name` is the account's description).

**What `failure` means.** Wrong password, wrong TOTP code, unknown address,
a disabled account (no `Authenticate` permission) and the attempt that trips
the ban all answer `failure`, on purpose, against account enumeration. The UI
cannot tell a disabled account from a wrong password and says so. Other
answers: 429 is the anonymous rate limit (100 a minute per IP by default),
403 is an IP already banned, 401 is a malformed request (a Postern bug, never
"wrong password"), a thrown `fetch` is the network.

**Refresh.** `grant_type=refresh_token` returns a new access token. It
returns a new refresh token only when the old one has less than
`refreshTokenRenewal` (4 days) left, and the old one keeps working until it
expires. Old access tokens also keep working after a refresh. Defaults, the
same in dev and production (production's plan sets no `OidcProvider`): access
token 1 hour, refresh token 30 days. Postern refreshes 5 minutes before
expiry, one refresh in flight at a time. A 400 `invalid_grant` ends the
session (the session-expired dialog); a network error keeps the tokens and
tries again.

**No revocation.** Stalwart 0.16.25 has no revocation or end-session
endpoint. Tokens are sealed, stateless `sw1.` blobs; the only check beyond
expiry is the account's credential version, a hash of the password hash. So
a password change kills every token of the account, everywhere, and nothing
else does (turning TOTP on or off does not). Sign-out can only forget the
tokens: a copied access token stays valid for up to an hour, a copied refresh
token for up to 30 days. [security.md](security.md) has the mitigation.

**Client registration: none.** `requireClientRegistration` is false by
default and production does not change it, so Stalwart accepts any
`client_id` without looking it up. Postern uses the constant `postern`,
with `redirectUri` = `${origin}/` (the base). See
[decisions.md](decisions.md).

**Stalwart's account page** (password, TOTP, app passwords) is its own web
app at `/account/` on Stalwart's host, not under `/webmail-api` (its asset
paths are absolute). Postern links to it through `VITE_STALWART_ACCOUNT_URL`,
set at build time; the dev default is the dev server's own `/account/`.

**A reload keeps the session (brief 27).** The access token stays in
memory. The refresh token, with the account's address and display name and
the time of the last activity, is kept in this tab's `sessionStorage` under
`postern.session`, so a reload or a crashed tab signs in again, and closing
the tab ends it ([decisions.md](decisions.md)). The `jmap` package touches no
storage: `AuthSession` takes a `SessionStore` (`load`, `save`, `clear`) from
the web app ([../../web/src/auth/sessionStore.ts](../../web/src/auth/sessionStore.ts)).
It saves after sign-in and after every refresh that returns a refresh token,
and clears on sign-out, the idle timeout, a refused refresh and before another
account signs in. On load, `SessionProvider` asks `resumable()`; if so it shows
a quiet "Signing you in…" page instead of the form while `resume()` runs: one
refresh grant, then `/auth/userinfo` for the account (which also proves the new
access token works), then the JMAP session. A refused token clears and shows
the form; an unreachable server shows the form with the offline notice and
keeps the token for the next reload. The same refresh token served three
refreshes in a row on the dev server (2026-10-28), as stateless tokens should,
so a duplicated tab, which copies `sessionStorage`, never signs the other out.

After 8 hours without input Postern signs out ([security.md](security.md));
the clock survives a reload.
