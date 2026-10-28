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

## Outcome (2026-10-28)

Done, in `c8dd3cb`, but for two acceptance lines: the one against the dev
Stalwart with production's settings was **skipped** on the coordinator's
instruction (built against dev's default lifetimes, without waiting for
`../vps-deploy` brief 20), and the Android one is an owner step (below).

- **The adapter.** `jmap/src/auth/store.ts` defines `SessionStore` (`load`,
  `save`, `clear`) and `StoredSession`: the refresh token, the account's
  address and display name, and the last activity time. Never the access
  token. `AuthSession` takes it as `store`; the package touches no browser
  API. The web app's adapter, `web/src/auth/sessionStore.ts`, keeps one
  versioned record under `postern.session` in this tab's `sessionStorage`,
  every access wrapped (storage that throws reads as empty). `memorySessionStore`
  is there for tests.
- **Save and clear.** Saved after sign-in and after every refresh that
  returns a refresh token; the last activity at most once a minute
  (`ACTIVITY_SAVE_MS`, since input events come many times a second; a stamp a
  minute behind only makes the reload's idle check sign out sooner). Cleared
  on sign-out, the idle timeout, a refused refresh (the session-expired
  dialog; signing in again there saves anew), and before another account
  signs in (compared on the trimmed, lower-cased address, before the password
  post, so even a failed sign-in of another account clears it). A sign-out of
  a session that never started leaves the store alone: React's StrictMode
  signs out a fresh `AuthSession` on mount (the provider's cleanup) before the
  resume runs again.
- **Resume.** `SessionProvider` asks `auth.resumable()` when it mounts; if
  so it shows a quiet "Signing you in…" page, never the form, while
  `auth.resume()` runs: the idle check against the stored activity, one
  refresh grant, then `/auth/userinfo` for the account id the
  session-expired dialog compares (the store keeps only the address and
  name), then the JMAP session. Outcomes: `resumed`; `idle` (cleared, the
  form with the idle notice); `refused` (cleared, the form); `unreachable`
  (the form with the offline notice; nothing is signed in, and the token is
  **kept**, so a reload once the server answers resumes: my reading of "keep
  nothing half-signed-in" is the in-memory state); `cancelled` (a sign-out
  overtook it; the store untouched). If the JMAP session fails right after a
  good refresh, the provider signs out as a form sign-in does, which clears
  the store. Under `vite dev` StrictMode's rehearsal makes the first resume a
  cancelled one, so dev shows two refresh grants per reload; the production
  build shows one.
- **The idle clock** starts from the stored last activity
  (`IdleTimeout.start(from)`), so a reload neither resets it nor survives
  past the deadline.
- **Two tabs.** Each tab has its own `sessionStorage` after duplication and
  saves its own token. On the dev Stalwart (2026-10-28) the same refresh token
  served three refreshes in a row, and a tampered one got `400
  invalid_grant`; with dev's defaults no refresh returned a new token, so
  rotation itself was not exercised live. Stalwart's tokens are sealed and
  stateless (architecture.md, Sign-in), so an older refresh token works until
  it expires whatever was issued since; a unit test runs the rotating case
  with two tabs.
- **Docs.** The header comments of `session.ts`, `idle.ts`, the auth index
  and `SessionProvider.tsx`; `security.md` (the Tokens rule, what a script on
  the origin can now read, Chrome bringing back a closed tab's
  `sessionStorage`, sign-out and the idle clock across a reload) and
  `architecture.md` (Sign-in).

Files beyond the brief's list: `web/src/auth/SignInPage.tsx` (the
"Signing you in…" page and an `offline` notice; the form itself is
unchanged) and `auth.css`, and three browser-test files besides the new one:
`tokens.spec.ts` (it asserted an empty `sessionStorage`; it now asserts one
key holding the refresh token and no other kind of secret),
`conversation-view-off.spec.ts` (its reload step now asserts the session
resumes with no form, where brief 26 signed in again) and `lib/app.ts`
(helpers). The jsdom test that said "keeps nothing in storage" now says
what it keeps.

Not verified: that a refresh token from before a password change is refused
on reload. Brief 04 read it in Stalwart's source (the token carries the
credential version), but changing a dev password and putting it back has no
obvious path here, so the tests refuse a tampered token instead.

Owner steps:

- **Android** (Chrome, the installed app, after the deploy): sign in, pull
  to reload or use the menu's Reload: the Inbox comes back without the form.
  Close the app from the recent-apps screen and open it again: the sign-in
  form. Nothing here is Android-only; the iPhone is not tested.
- **Production's tokens** (after `../vps-deploy` brief 20 is deployed): on
  `https://postern.<domain>/`, sign in, reload a few times a minute or more
  apart, and in DevTools (Application, Session Storage) see `postern.session`
  change its refresh token after each refresh. This is the skipped
  acceptance line.

Checked:

- `npm run typecheck`, `npm run lint`, 1291 unit and integration tests with
  the dev Stalwart up (new: the store and resume in `jmap/src/auth`, a reload
  in `SessionProvider.test.tsx`, StrictMode included, with the idle timeout
  shortened to 5 s and a 6-s gap).
- The browser suite, 46 passed, with the new `web/e2e/reload.spec.ts`: a
  reload shows the Inbox with the form never appearing (a `MutationObserver`
  from the first byte), one refresh grant, no code grant and no password post,
  and no access token in `sessionStorage`; a closed tab's successor shows the
  form; sign-out then reload shows the form with nothing kept; a reload after
  the stored last activity was set back 8 hours and a minute signs out with
  the idle notice and sends no grant; a tampered refresh token gets 400 and
  the form, storage cleared; a second tab given the first one's
  `sessionStorage` resumes, and both reload twice more, still signed in.

brief-board is down (since 2026-10-13), so nothing was posted there.
