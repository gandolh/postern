---
summary: Genuinely unresolved questions as of 2026-10-20, each naming the brief that settles it. Whether production should shorten Stalwart's token lifetimes, since tokens cannot be revoked; whether an offline cache is acceptable on the shared origin. Delete an entry the moment it is answered.
updated: 2026-10-20
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

## Is an offline cache acceptable on the shared origin?

Gmail caches mail for offline reading. In IndexedDB on the production origin, the cache
would be readable by any script on the estate's origin, even with Postern
closed. Encrypting it with a key held only in memory protects nothing while
the app is open. Brief 16 decides, with the owner.
