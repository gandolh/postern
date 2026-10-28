# Task 27 — A reload keeps the session; closing the tab ends it

## Context

The owner decided on 2026-10-28, revisiting "No staying signed in across a
reload" and "Tokens in memory only" in
[decisions.md](../../wiki/decisions.md): **the refresh token is kept in
`sessionStorage`**, so a reload or a crashed tab signs in again silently, and
closing the tab (or Android killing the installed app) still signs out. The
access token stays in memory. IndexedDB was offered and declined. The
reason the old rule existed, another estate app's script reading Postern's
storage, ended when Postern got its own host (brief 19).

Production's tokens shrink the same day (`../vps-deploy` brief 20): access 15
minutes, refresh a day, and **a new refresh token on every refresh**. Dev's
Stalwart keeps the defaults (1 hour, 30 days, a new one only in the last 4
days), so the code must handle both: whenever a refresh returns a refresh
token, the stored one is replaced.

Where things are today:

- `jmap/src/auth/session.ts`: `AuthSession` holds both tokens in private
  fields (`#refresh` around `:130`, replaced at `:391` when a refresh returns
  one) and its header comment says tokens never touch storage.
- `jmap/src/auth/idle.ts`: the 8-hour idle timeout (`IDLE_TIMEOUT_MS`); activity
  only stamps a time, in memory.
- `web/src/auth/SessionProvider.tsx`: one `AuthSession` per signed-in stint;
  signing out (by the user or the idle timeout) runs the before-sign-out hooks
  and drops it.
- `corpus/wiki/security.md` and `corpus/wiki/architecture.md` (Sign-in) say
  tokens live in memory only.

## Files you OWN

- `jmap/src/auth/` (`session.ts`, `idle.ts`, `index.ts`, tests)
- `web/src/auth/` (`SessionProvider.tsx`, `useActivity.ts`, a small storage
  module if it helps, tests)
- Browser tests for this
- corpus: this brief's outcome, `corpus/wiki/security.md`,
  `corpus/wiki/architecture.md` (Sign-in), `corpus/wiki/status.md`,
  `corpus/log.md`

## Files you must NOT touch

- `../vps-deploy` (brief 20 there sets production's lifetimes).
- The sign-in form and the TOTP flow, beyond what resuming needs.

## What to do

1. **Keep the `jmap` package storage-free.** Give `AuthSession` a way to be
   told where to persist (an adapter the web app passes in, with `load`,
   `save` and `clear`), rather than having the package call `sessionStorage`.
   Only the refresh token, the account name shown in the UI, and the last
   activity time are stored. The access token is never stored.
2. **Save** after sign-in and after every refresh that returns a refresh
   token. **Clear** on sign-out, on the idle timeout, on a refused refresh
   (`invalid_grant`, the session-expired dialog), and before a different
   account signs in.
3. **Resume on load.** If storage holds a refresh token and the last activity
   is under `IDLE_TIMEOUT_MS` ago, refresh before showing the sign-in page and
   go straight to the app. Show a quiet loading state, not the sign-in form,
   while it runs. If the refresh fails with `invalid_grant`, clear and show the
   sign-in page; on a network error, show the sign-in page with the usual
   offline message and keep nothing half-signed-in.
4. **The idle clock survives a reload.** The last activity time is read back
   on load, so a reload after 8 idle hours signs out instead of resetting the
   clock.
5. **Two tabs.** A duplicated tab copies `sessionStorage`, so two tabs can
   hold the same refresh token. Make sure one tab's refresh never signs the
   other out (Stalwart keeps an old refresh token working until it expires;
   check that against the dev server and record it).
6. Update the comments that say tokens never touch storage, `security.md`'s
   threat notes (what a script on Postern's origin can now read) and the
   Sign-in section of `architecture.md`.

## Acceptance

- Sign in, reload: the Inbox shows without the sign-in form; the network shows
  one refresh grant and no password post.
- Close the tab and open Postern again: the sign-in form.
- Sign out, then reload: the sign-in form, and `sessionStorage` holds nothing
  of Postern's session.
- With the idle timeout shortened in a test, a reload after it passes signs
  out.
- A refused refresh on reload (a token from before a password change) shows
  the sign-in form and clears storage.
- Against the dev Stalwart with production's settings applied to it (brief 20's
  plan lines, if they are in by then), a reload works and the stored refresh
  token changes after each refresh.
- On Android (Chrome, installed app), killing the app signs out; a reload
  inside it does not. The iPhone is not tested, but nothing here is
  Android-only.
- `npm run typecheck`, `npm run lint`, `npm test` and the browser tests pass.
