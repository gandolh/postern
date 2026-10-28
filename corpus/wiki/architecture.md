---
summary: How Postern is put together, as built (briefs 01-17, 2026-10-20). The three workspaces (jmap client, web app, dev mail server), the request path through Caddy to Stalwart on the same origin, JMAP session-URL rebasing, sign-in in brief (the details are in sign-in.md), live updates by fetch-streamed event source plus Web Push, where state lives, local development, and the deploy as built in brief 18 (a static stack for /webmail with its headers, and the allowlisted /webmail-api route in the mail stack of ../vps-deploy; not deployed yet).
updated: 2026-10-28
---

# Architecture

## Workspaces

npm workspaces, the estate's house layout:

| Workspace | Package | What it is |
|---|---|---|
| `jmap/` | `@postern/jmap` | A typed JMAP client: session, batched requests with back-references, the mail/submission/sieve/contacts methods, blobs, changes, push. No React, no DOM beyond `fetch`. Brief 03. |
| `web/` | `@postern/web` | The React app, built by Vite with base `/` (`/webmail/` until 2026-10-22, brief 19). Briefs 05 onward. |
| `dev/` | (not a package) | A local Stalwart in Docker with test accounts and seeded mail. Brief 02. |

The JMAP layer is its own package so it can be tested against a real Stalwart
without a browser. The UI then depends on a contract, not on raw JMAP.

## Request path

```
browser ── https://postern.example.com/…              → Caddy static files (SPA fallback)
        └─ https://postern.example.com/webmail-api/…  → Caddy, allowlisted paths, prefix stripped
                                                        → Stalwart HTTP listener (loopback)
```

Postern has the whole host, and Caddy writes the `/webmail-api` block above
the app's, so the API is matched first and the rest of the host is the app.
Any other `/webmail-api` path is a 404, not the app's fallback. Same origin
means no CORS. Stalwart's only CORS switch allows every origin, which is why
an API on another origin was not attractive.

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

## Sign-in

On its own page since 2026-10-28, when this one passed 200 lines:
[sign-in.md](sign-in.md) has Stalwart's sign-in endpoints as verified in
brief 04, refresh, token lifetimes, no revocation, client registration, the
account page, and the session a reload keeps since brief 27.

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
- **While it is closed:** Web Push, built in brief 16: the subscription asks
  Stalwart for the sender and subject of new Inbox mail, and the service worker
  shows them with no token (see [decisions.md](decisions.md)). The JMAP
  `PushSubscription` carries the browser's push endpoint, Stalwart signs with
  VAPID, and the subscription is destroyed on sign-out.
- **Fallback:** poll the `Email`, `Mailbox` and `Thread` states every 30 s
  (`Foo/get` with `ids: []`). The session `state` does not move when mail
  changes, so polling it would miss everything.

## Where state lives

- **Mail, labels, identities, filters, vacation, contacts:** Stalwart, always.
- **Display preferences** (density, reading pane, shortcuts on/off): per
  device, in the browser. Not secret. Brief 12 decides the store.
- **Label colours:** JMAP `Mailbox` has no colour field. Brief 09 decides.
- **Offline cache:** none, by the owner's decision of 2026-10-20. The
  service worker caches the app shell only ([decisions.md](decisions.md)).

## Local development

`dev/` runs Stalwart 0.16 (the version `../vps-deploy` pins) in Docker, with a
test domain, test accounts and seeded mail (brief 02). The Vite dev server
proxies `/webmail-api` to it, the same path as production. Docker on the dev
machine is Docker Desktop, so the proxy targets a port published on
`127.0.0.1`. Host networking reaches the Desktop VM, not this machine.

## Deploy (brief 18)

Built on 2026-10-20 in `../vps-deploy`, the estate's deploy tool. Deploying
is the owner's step; the commands are in [status.md](status.md), Owner steps.

- **`postern.<domain>`** is `../vps-deploy/stacks/postern.ts`, a static site
  on a host of its own (`../vps-deploy` brief 14, 2026-10-22). The
  deploy runs `npm ci` and `npm run build` in this checkout (Node 24, as
  `engines` says), checks that `web/dist/index.html` loads from
  `/assets/`, and uploads `web/dist` as a new release; a symlink swap
  makes it live, and five releases are kept. `VITE_STALWART_ACCOUNT_URL` is
  the mail host's `/account/`. Deep links fall back to `index.html`.
- **Its headers** are the set in [security-headers.md](security-headers.md),
  on every response. `Cache-Control` is `no-cache` wherever a path sets none,
  so `index.html`, `sw.js`, the manifest and every deep-link fallback
  revalidate; `/assets/*` is immutable; the manifest is served as
  `application/manifest+json`. The stack copies the text, so a header change
  touches `web/src/sw/headers.ts`, the e2e Caddyfile, security-headers.md and
  that stack.
- **`/webmail-api`** is a route of the mail stack (`../vps-deploy/stacks/mail.ts`),
  on Postern's host. It claims Stalwart's loopback port, which the mail stack
  owns, and a second stack claiming it fails synth. Only the allowlisted paths
  in [security-headers.md](security-headers.md) reach Stalwart, with the
  prefix stripped and the event stream flushed; any other `/webmail-api` path
  is a 404. No `encode`, no caching, no CORS, and Caddy's own
  `X-Forwarded-For`.
- **The Caddy renderer** gained per-route headers and path allowlists for
  this, and hosts of their own with allowlists (brief 14). Its synth refuses
  any route on the shared origin that sends `Service-Worker-Allowed`; since
  Postern left that origin, the rule protects the other apps.
- **Stalwart.** The mail plan sets `webPushContact`, the VAPID `sub` that
  Apple requires, to the domain's postmaster address. The VAPID key is the one
  Stalwart generated in its store on first start. Nothing is registered for
  sign-in (see Sign-in above).
- **Order.** In vps-deploy's graph postern depends on mail, so `all` brings
  mail up first.
