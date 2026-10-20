---
summary: How Postern is put together, as designed on 2026-10-09 (nothing built yet). The three workspaces (jmap client, web app, dev mail server), the request path through Caddy to Stalwart on the same origin, JMAP session-URL rebasing, sign-in with OAuth and PKCE through Stalwart's own endpoints (verified and built in brief 04: the /api/auth and /auth/token shapes, the TOTP retry, refresh without rotation, token lifetimes, no revocation, the account page URL), live updates by fetch-streamed event source plus Web Push, where state lives, local development, and the deploy.
updated: 2026-10-20
---

# Architecture (designed, not built)

## Workspaces

npm workspaces, the estate's house layout:

| Workspace | Package | What it is |
|---|---|---|
| `jmap/` | `@postern/jmap` | A typed JMAP client: session, batched requests with back-references, the mail/submission/sieve/contacts methods, blobs, changes, push. No React, no DOM beyond `fetch`. Brief 03. |
| `web/` | `@postern/web` | The React app, built by Vite with base `/webmail/`. Briefs 05 onward. |
| `dev/` | (not a package) | A local Stalwart in Docker with test accounts and seeded mail. Brief 02. |

The JMAP layer is its own package so it can be tested against a real Stalwart
without a browser. The UI then depends on a contract, not on raw JMAP.

## Request path

```
browser ── https://example.com/webmail/…      → Caddy static files (SPA fallback)
        └─ https://example.com/webmail-api/…  → Caddy handle_path (prefix stripped)
                                                → Stalwart HTTP listener (loopback)
```

`/webmail` and `/webmail-api` are disjoint for Caddy (a literal `/webmail/*`
match needs `/` next), the same pattern as `/ward` and `/ward-api`. Same origin
means no CORS. Stalwart's only CORS switch allows every origin, which is why a
separate origin was not attractive.

The `/webmail-api` route is declared in the mail stack (`../vps-deploy`), not in
Postern's. The route claims Stalwart's loopback port, and the mail stack already
owns that port; a second claimant fails synth.

## JMAP session and URL rebasing

The session object (`GET /jmap/session`) returns absolute URLs built from
Stalwart's hostname: `https://mail.<domain>/jmap/…` for `apiUrl`,
`downloadUrl`, `uploadUrl` and `eventSourceUrl`. The client rewrites each onto
`/webmail-api/` before use (brief 03). The rejected alternative was setting
`STALWART_PUBLIC_URL=https://example.com/webmail-api`. That would move every
discovery URL, the admin UI's OAuth included.

## Sign-in (built in brief 04)

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
with `redirectUri` = `${origin}/webmail/`. See
[decisions.md](decisions.md).

**Stalwart's account page** (password, TOTP, app passwords) is its own web
app at `/account/` on Stalwart's host, not under `/webmail-api` (its asset
paths are absolute). Postern links to it through `VITE_STALWART_ACCOUNT_URL`,
set at build time; the dev default is the dev server's own `/account/`.

Tokens stay in memory and die with the tab ([decisions.md](decisions.md)).
After 8 hours without input Postern signs out ([security.md](security.md)).

## Live updates

Stalwart's push endpoints (`/jmap/eventsource`, `/jmap/ws`) accept only an
`Authorization` header (checked in its source 2026-10-09). A browser
`EventSource` or `WebSocket` cannot send one, so:

- **While the app is open:** read the event-source stream with `fetch()`, which
  can send the header, and parse the server-sent events by hand. The
  `StateChange` events drive `Email/changes` and `Email/queryChanges` (brief 11).
  Caddy flushes `text/event-stream` responses as they arrive.
- **As built (brief 11):** one reader per sign-in for `Email`, `Mailbox`,
  `Thread` and `EmailDelivery`. Each `StateChange` re-syncs the labels and
  every mounted list, and announces "settled" on the actions bus so an open
  conversation and search results refresh. Mail sent over SMTP showed in an
  open Inbox 295 ms later. After a Stalwart restart the reader polls, then
  retries the stream every 60 s; it was back within 6 s in the dev test. The
  Vite dev proxy holds a proxied response's headers until the first body
  chunk, so `web/vite.config.ts` flushes event-stream headers itself.
- **While it is closed:** Web Push. JMAP `PushSubscription` with the browser's
  push endpoint; Stalwart signs with VAPID. A service worker shows the
  notification (brief 16).
- **Fallback:** poll the `Email`, `Mailbox` and `Thread` states every 30 s
  (`Foo/get` with `ids: []`). The session `state` does not move when mail
  changes, so polling it would miss everything.

## Where state lives

- **Mail, labels, identities, filters, vacation, contacts:** Stalwart, always.
- **Display preferences** (density, reading pane, shortcuts on/off): per
  device, in the browser. Not secret. Brief 12 decides the store.
- **Label colours:** JMAP `Mailbox` has no colour field. Brief 09 decides.
- **Offline cache:** none until brief 16, which has to weigh the shared origin
  first.

## Local development

`dev/` runs Stalwart 0.16 (the version `../vps-deploy` pins) in Docker, with a
test domain, test accounts and seeded mail (brief 02). The Vite dev server
proxies `/webmail-api` to it, the same path as production. Docker on the dev
machine is Docker Desktop, so the proxy targets a port published on
`127.0.0.1`. Host networking reaches the Desktop VM, not this machine.

## Deploy (brief 18)

- **In `../vps-deploy`:** a static-site stack for `/webmail` from this repo's
  `web/dist`; the `/webmail-api` route added to the mail stack; and security
  headers for `/webmail` (CSP, `frame-ancestors`), which needs the Caddy
  renderer to support per-route headers.
- **Who runs it:** the owner, from `../vps-deploy`.
