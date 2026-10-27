---
summary: Postern's threat model and the rules that answer it. Untrusted message content (HTML, links, look-alike hosts, remote images, attachments, spoofed senders), its own host since 2026-10-22 (another estate app can no longer reach it) and what a script on Postern's own origin could still do, token handling (memory only, no revocation in Stalwart, the 8-hour idle timeout, the bounded last work before a sign-out, the failed-password ban threshold), the sandboxed-iframe rendering rule and why CSP inheritance makes "show images" work, and the browser tests that prove it (web/e2e). Headers are in security-headers.md, open findings in security-findings.md. Read before touching message rendering, sign-in, storage or headers.
updated: 2026-10-27
---

# Security

## What we defend against

1. **Message content.** HTML is written by strangers. It can carry scripts,
   CSS that disguises a phishing form, tracking pixels, `javascript:` and
   look-alike links, a forged `From:` display name, and attachments named to
   deceive (`invoice.pdf.html`).
2. **Script on Postern's origin.** Until 2026-10-22 that was any script in any
   estate app, because they shared one origin. Postern now has a host of its
   own, `postern.<domain>` ([decisions.md](decisions.md)), so it is only a
   script that gets to run on that host.
3. **Stolen tokens.** A bearer token is the mailbox.
4. **Framing.** Another site embedding Postern to trick clicks.

## Rules

- **Rendering.** Sanitise the HTML body (DOMPurify or equivalent), then render
  it through `srcdoc` in `<iframe sandbox="allow-popups
  allow-popups-to-escape-sandbox">`. No `allow-scripts`, no `allow-same-origin`,
  no `allow-forms`. Links open in a new tab with `rel="noopener noreferrer"`.
  Plain-text bodies are escaped text, never HTML.
- **Remote content.** Blocked by default. The sanitiser moves `src`, `srcset`,
  `background` and CSS `url()` aside. "Display images" restores them for one
  message, and "Always display images from <sender>" adds a per-sender
  allowance. A `srcdoc` frame inherits the embedder's CSP, so Postern's CSP
  must allow `img-src https:` for display-images to work. The blocking is the
  sanitiser's job, not the CSP's.
- **Senders and links.**
  - Always show the real address next to the display name.
  - Flag a mismatch between a link's text and its target, and a host
    written to pass for another (scripts mixed in one label, or every letter
    imitating Latin); an ordinary internationalised name is not flagged.
  - Show Stalwart's authentication results (SPF, DKIM, DMARC) on demand, as
    Gmail's "Show original" does.
- **Attachments.**
  - Download with the blob's real type and `Content-Disposition: attachment`.
  - Preview images and PDFs only, in sandboxed frames.
  - Never render an HTML attachment inline.
- **Tokens.** In memory only, in a closure in
  [jmap/src/auth](../../jmap/src/auth/). Never storage, IndexedDB, a readable
  cookie, `BroadcastChannel`, `postMessage`, a URL, a log line or an error
  message; any same-origin script can read the first four. Keep the access
  token short-lived, and run a session timeout (below).
- **Sign-out cannot revoke.** Stalwart 0.16.25 has no revocation endpoint
  ([architecture.md](architecture.md), Sign-in). Sign-out forgets the tokens
  and drops the JMAP client with its caches; a token copied before that stays
  valid until it expires (1 hour access, 30 days refresh). Changing the
  password on Stalwart's account page is the only kill switch, and it signs
  out every device. Whether to shorten the lifetimes is in
  [open-questions.md](open-questions.md).
- **Idle timeout: 8 hours.** With no key, pointer, wheel or touch input for
  `IDLE_TIMEOUT_MS` (8 hours), Postern signs out. Long enough that a working
  day of on-and-off use never meets it, short enough that a tab left open
  overnight on an unattended machine is signed out by morning. Timers may not
  count a machine's sleep, so the deadline is also checked when the tab becomes
  visible or gains focus, on the first input (which then signs out instead of
  restarting the clock) and before each request. Brief 17 tests it.
- **The last work before a sign-out.** Both sign-outs, the user's and the
  idle timeout's, first give the app at most `BEFORE_SIGN_OUT_MS` (3 s) with
  the tokens still valid ([../../web/src/auth/beforeSignOut.ts](../../web/src/auth/beforeSignOut.ts)):
  unsaved drafts are saved, a message held for Undo send goes out (the user
  already saw "Message sent"), and this device's Web Push subscription is
  destroyed. The hooks' requests share the client, so in that window
  `authorization()` answers any caller. Then the address bar goes back to
  `/` with no hash (replaced, not pushed; the page cannot erase the
  earlier history entries) and the undo list empties, so the next person on
  the tab inherits neither the route nor an undo.
- **Failed passwords and the ban.** Stalwart counts failed sign-ins per IP and
  per address; by default 100 failures in 24 hours (`authBanRate`) block the
  IP. Production keeps that rate, bans for 24 hours (`authBanPeriod`), and
  reads the client IP from `X-Forwarded-For` (`useXForwarded`), so a ban hits
  one client, not Caddy. Anonymous requests (sign-in, token) are also limited
  to 100 a minute per IP. Postern never retries a password on its own: every
  attempt is a click or Enter, the password field empties after a rejection,
  and a refresh never uses the password. Dev bans for 1 minute and
  allow-lists Docker's gateway, so tests never ban the machine.
- **No third-party scripts, fonts or analytics.** Everything is self-hosted
  from Postern's own host.

## Message rendering as built (brief 07, 2026-10-20)

- **Sanitiser:** DOMPurify 3.4.16 in a detached document
  (`web/src/render/sanitize.ts`), then a `srcdoc` frame with exactly
  `sandbox="allow-popups allow-popups-to-escape-sandbox"`. Each frame also
  carries its own CSP and `no-referrer`, as a second layer.
- **Dropped on purpose:** inline SVG and MathML, audio and video, forms and
  every form control, remote fonts and `@import` (even after "Display
  images"). `position: fixed`, `absolute` and `sticky` become `static`, which
  can flatten a newsletter's layout. A message with its own `<style>` stays on
  a light background in dark mode.
- **Inline images** are `data:` URLs. A `blob:` URL made by the app shows as a
  broken image inside the opaque-origin frame (tested in Chrome).
- **Frame height** cannot be measured, because the frame cannot script and
  the app cannot read it. It is estimated from the sanitised document, capped
  at 1.5 times the viewport, and scrolls inside past that, with "Show full
  message" to lift the cap.
- **PDF preview** opens in a new tab with no opener, after checking the bytes
  start with `%PDF-`. Chrome refuses a PDF in any sandboxed frame. Images
  preview in a `sandbox=""` frame and are typed by their bytes.
- **Hardening after review (2026-10-20):** CSS escapes are decoded to a fixed
  point and leftover backslashes dropped, so a double-escaped `url()` or
  `@import` cannot slip through. Names, addresses and file names sit in
  `<bdi>`, and bidi control characters are stripped from attachment names for
  display, checks and saving. The in-frame link pill carries an inline
  `!important` style, and message markup loses any `postern*` class or id.
  Image previews stop at 20 MB; inline images load up to 8 MB each and 16 MB
  per message on open, the rest on request.
- **Brief 17 (2026-10-20):**
  - Look-alike hosts are decided in `web/src/render/idn.ts`: a label that
    mixes scripts (Japanese, Chinese and Korean mixes with Latin allowed),
    one whose letters all imitate Latin under a TLD of another script, or a
    Latin letter made to pass for another. münchen.de and почта.test are not
    flagged; аpple.test and аррӏе.test are.
  - "Always display images from <sender>" applies only when the topmost
    Authentication-Results (Stalwart's own) says `dmarc=pass` for the
    sender's domain. Stalwart keeps a sender-written header with its own
    name underneath its result, so only the topmost one counts. The global
    "always display" setting is unchanged.
  - Every frame turns DNS prefetching off, so no link's host is resolved
    before a click.
  - Plain-text bodies, quotes and display names are scanned in linear time;
    before, one hostile message could freeze the tab
    ([security-findings.md](security-findings.md), F2).

## The service worker (brief 16)

- Scope `/`, the whole host, since 2026-10-22 (`/webmail/` before). It
  precaches the app shell only, routes nothing under `/webmail-api` (inside
  the scope, kept out by `web/src/sw/routing.ts`), holds no token and makes
  no JMAP call. No other app can register a worker on Postern's host.
- **Notifications are readable.** While one is on screen, any script on the
  origin can read its sender and subject through
  `registration.getNotifications()` ([decisions-mail.md](decisions-mail.md)).

## Headers (final since brief 17)

The CSP, COOP, CORP, Permissions-Policy and the rest, with the reason for each
and the Caddy shape, are in [security-headers.md](security-headers.md).
`style-src 'unsafe-inline'` stays, and only for the message frames: a
`srcdoc` frame inherits the app's policy and cannot loosen it, and message
markup needs inline styles. `frame-ancestors 'none'` and COOP `same-origin`
mean no other page can frame Postern or script a Postern window it opened.

## What another estate app can reach, and what a script on the origin could

From a stand-in estate page on another origin of the same site
(`tokens.spec.ts`, 2026-10-22), as the apex apps are to `postern.<domain>`:
no cookie, worker registration, preferences or cache of Postern's, nothing on
a BroadcastChannel, no frame, and a window it opens comes back closed. On the
shared origin, until 2026-10-22, it could reach the preferences, the worker
and notifications.

What is left is a script on Postern's own origin, which none should be (no
third-party scripts, message HTML only in the sandbox). It could not read a
token (none is in storage, cookies, IndexedDB, Cache Storage, a URL, the DOM
or a console line), but it **could**:

- read and write the per-device preferences, including ones that load remote
  images or turn Web Push on (F6), and read the last username;
- read a notification on screen, show its own, and unregister the worker;
- write to Cache Storage, but not have it served: the worker checks every
  cached file against a hash baked into `sw.js` (F1, fixed 2026-10-20, still
  tested);
- show a sign-in form the browser's password manager may fill.

## The malicious-mail corpus and the browser tests

`dev/` seeds 18 hostile messages (brief 02; brief 25 added an invite): script tags,
event handlers, SVG with script, CSS overlays, `javascript:` and `data:` links,
a meta refresh, a `<base>`, forms, frames and embeds, remote trackers, link
text that lies, look-alike hosts, forged display names, and attachments
named to deceive. Brief 17's suite in [web/e2e](../../web/e2e/README.md)
(`npm run test:e2e`, Playwright and Chromium against the production build
behind Caddy and the dev Stalwart) opens each in the real app and checks:

- **No script runs.** The `__POSTERN_PWNED` canary stays unset in the app
  and in the frame. Nothing in the frame is left for the sandbox to block:
  no script, handler or `javascript:` URL in the `srcdoc`, and no "Blocked
  script execution" line after a real pointer has crossed the frame and Tab
  plus Enter has followed every link.
- **Nothing leaves early.** No request outside `/webmail` and `/webmail-api`
  before "Display images", and after it only the message's image hosts, with
  no Referer. Chrome's net log shows no DNS lookup of any message host.
- **No navigation.** The app's URL never changes, and each link opens one new
  tab with no opener and no referrer.
- **The frame.** Exactly `allow-popups allow-popups-to-escape-sandbox`, one
  frame per HTML body, and no message markup in the app's own DOM.
- **Outside the frame.** The real address and the forged-name warning, the
  link warnings, and attachments that download under their real name.

The token tests check the places above for every secret sign-in handles, the
idle timeout (with a fake clock), and that sign-out forgets the session.
Control tests prove the canary and the CSP watch do catch a script that
runs. The hostile specs block the service worker (Playwright's routing is
unreliable under one; the worker never touches message content); the CSP and
token specs run with it.
