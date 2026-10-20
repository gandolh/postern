---
summary: Postern's threat model and the rules that answer it. Untrusted message content (HTML, links, remote images, attachments, spoofed senders), the shared production origin, token handling (memory only, no revocation in Stalwart, the 8-hour idle timeout, the failed-password ban threshold), the sandboxed-iframe rendering rule and why CSP inheritance makes "show images" work, the CSP for /webmail, and the malicious-mail test corpus. Read before touching message rendering, sign-in, storage or headers.
updated: 2026-10-20
---

# Security

## What we defend against

1. **Message content.** HTML is written by strangers. It can carry scripts,
   CSS that disguises a phishing form, tracking pixels, `javascript:` and
   look-alike links, a forged `From:` display name, and attachments named to
   deceive (`invoice.pdf.html`).
2. **The shared origin.** Any script on the production origin, in any estate app, runs
   with Postern's origin ([decisions.md](decisions.md)).
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
  allowance. A `srcdoc` frame inherits the embedder's CSP, so `/webmail`'s CSP
  must allow `img-src https:` for display-images to work. The blocking is the
  sanitiser's job, not the CSP's.
- **Senders and links.**
  - Always show the real address next to the display name.
  - Flag a mismatch between a link's text and its target, and punycode or
    mixed-script domains.
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
  from `/webmail`.

## CSP for /webmail (draft, set by Caddy in brief 18)

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:; media-src 'self' blob:; font-src 'self';
connect-src 'self'; frame-src 'self' blob:; frame-ancestors 'none';
base-uri 'none'; form-action 'self'; object-src 'none'
```

`style-src 'unsafe-inline'` is there for the message frames, whose sanitised
inline styles inherit this policy. Tighten it if brief 17 finds a way.

## The malicious-mail corpus

`dev/` seeds a set of hostile messages (brief 02), and brief 17 turns them into
automated browser tests that must stay green. The set:

- script tags and event handlers, SVG with script, CSS that overlays the page;
- `javascript:` and `data:` links, and a meta refresh;
- remote-image trackers;
- a forged display name, and an attachment with a double extension.
