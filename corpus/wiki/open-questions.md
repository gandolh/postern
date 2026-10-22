---
summary: Genuinely unresolved questions as of 2026-10-22, each naming the brief or owner call that settles it. Whether production should shorten Stalwart's token lifetimes, since tokens cannot be revoked; whether Postern should keep a session across reloads now that it has its own origin. Delete an entry the moment it is answered.
updated: 2026-10-22
---

# Open questions

Delete an entry the moment it is answered. The history goes to `log.md`.

## Should production shorten Stalwart's token lifetimes?

Stalwart cannot revoke a token ([architecture.md](architecture.md), Sign-in),
so sign-out only forgets it: a copied access token works for up to an hour, a
copied refresh token for up to 30 days. Production's `OidcProvider` could set
`accessTokenExpiry` to 15 minutes, and `refreshTokenExpiry` and
`refreshTokenRenewal` both to about a day, so each refresh hands out a new
refresh token and an unused one dies within a day. The settings are
server-wide: Stalwart's own web UI and any OAuth mail app would also sign in
again after a day away. An owner call in `../vps-deploy`; brief 17 or 18.

## Should Postern keep a session across reloads, now that it has its own origin?

"No staying signed in across a reload" ([decisions.md](decisions.md)) said to
revisit only if Postern got its own origin, and since 2026-10-22 (brief 19) it
has `postern.<domain>`. The reason on record was that every way to survive a
reload stores a secret where another estate app's script could reach it, and
that no longer holds. What remains is a script on Postern's own origin, which
the CSP, the sandbox and having no third-party scripts are there to prevent.
The options, roughly: keep today's rule; keep the refresh token in
`sessionStorage` (one tab, gone when it closes); or keep it in IndexedDB
(survives a restart). Each also needs the 8-hour idle timeout and sign-out to
clear it. An owner call; nothing is built until it is made.
