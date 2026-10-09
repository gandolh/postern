---
summary: Postern's threat model and the rules that answer it. Untrusted message content (HTML, links, remote images, attachments, spoofed senders), the shared gandolh.ro origin, token handling, the sandboxed-iframe rendering rule and why CSP inheritance makes "show images" work, the CSP for /webmail, and the malicious-mail test corpus. Read before touching message rendering, sign-in, storage or headers.
updated: 2026-10-09
---

# Security

## What we defend against

1. **Message content.** HTML is written by strangers. It can carry scripts,
   CSS that disguises a phishing form, tracking pixels, `javascript:` and
   look-alike links, a forged `From:` display name, and attachments named to
   deceive (`invoice.pdf.html`).
2. **The shared origin.** Any script on `gandolh.ro`, in any estate app, runs
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
- **Tokens.** In memory only. Never storage, IndexedDB, a readable cookie or
  `BroadcastChannel`; any same-origin script can read those. Revoke on sign-out.
  Keep the access token short-lived, and run a session timeout.
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
