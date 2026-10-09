---
summary: How Postern is put together, as designed on 2026-10-09 (nothing built yet). The three workspaces (jmap client, web app, dev mail server), the request path through Caddy to Stalwart on the same origin, JMAP session-URL rebasing, sign-in with OAuth and PKCE through Stalwart's own endpoints, live updates by fetch-streamed event source plus Web Push, where state lives, local development, and the deploy.
updated: 2026-10-09
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
browser ── https://gandolh.ro/webmail/…      → Caddy static files (SPA fallback)
        └─ https://gandolh.ro/webmail-api/…  → Caddy handle_path (prefix stripped)
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
Stalwart's hostname: `https://mail.gandolh.ro/jmap/…` for `apiUrl`,
`downloadUrl`, `uploadUrl` and `eventSourceUrl`. The client rewrites each onto
`/webmail-api/` before use (brief 03). The rejected alternative was setting
`STALWART_PUBLIC_URL=https://gandolh.ro/webmail-api`. That would move every
discovery URL, the admin UI's OAuth included.

## Sign-in

Stalwart is the identity provider. The plan (brief 04, to verify):

1. Postern shows its own sign-in form and posts it to `/webmail-api/api/auth`
   with `type: "authCode"` and a PKCE challenge.
2. If TOTP is on, the answer is `mfaRequired`, and the form asks for the code
   and retries with `mfaToken`.
3. The authorization code goes to `/webmail-api/auth/token` for an access
   token and a refresh token.
4. JMAP calls send `Authorization: Bearer`.

Tokens stay in memory ([security.md](security.md)). Still open: whether the
client must be registered with Stalwart ([open-questions.md](open-questions.md)).

## Live updates

Stalwart's push endpoints (`/jmap/eventsource`, `/jmap/ws`) accept only an
`Authorization` header (checked in its source 2026-10-09). A browser
`EventSource` or `WebSocket` cannot send one, so:

- **While the app is open:** read the event-source stream with `fetch()`, which
  can send the header, and parse the server-sent events by hand. The
  `StateChange` events drive `Email/changes` and `Email/queryChanges` (brief 11).
  Caddy flushes `text/event-stream` responses as they arrive.
- **While it is closed:** Web Push. JMAP `PushSubscription` with the browser's
  push endpoint; Stalwart signs with VAPID. A service worker shows the
  notification (brief 16).
- **Fallback:** poll the session `state` every 30-60 s.

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
