---
summary: The HTTP headers production sends for /webmail and /webmail-api, final since brief 17 (2026-10-20). The exact CSP and why each directive is there (style-src 'unsafe-inline' exists only for the message frames, and why it cannot go), COOP, CORP, Permissions-Policy, nosniff, no-referrer, X-Frame-Options, the /webmail-api path allowlist, which screens were proven under them, and the Caddy route shape brief 18 deploys. Read before changing a header or the Caddy route.
updated: 2026-10-20
---

# Security headers

Settled by brief 17 and proven by the browser tests in [web/e2e](../../web/e2e/README.md)
(`csp.spec.ts`): the production build, served by Caddy 2.11.7 with
[the e2e Caddyfile](../../web/e2e/Caddyfile), every screen walked with zero
CSP violations. The same text lives in
[web/src/sw/headers.ts](../../web/src/sw/headers.ts), which the test checks
the served headers against. Change the three together. Why the headers
matter: [security.md](security.md).

## /webmail/ (every response: HTML, JS, CSS, sw.js, the manifest)

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'self'; manifest-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), midi=(), display-capture=(), publickey-credentials-get=(), browsing-topics=()
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-DNS-Prefetch-Control: off
```

Also: `Cache-Control: no-cache` on `/`, `index.html`, `sw.js` and
`manifest.webmanifest`; `public, max-age=31536000, immutable` on `/webmail/assets/*`;
`Content-Type: application/manifest+json` on the manifest; no `Server`
header; never `Service-Worker-Allowed` (brief 16's estate rule).

## /webmail-api/ (Stalwart, prefix stripped)

Only the paths Postern calls pass: `/webmail-api/jmap/*` (session, API,
upload, download, event source), `/webmail-api/api/auth`,
`/webmail-api/auth/token` and `/webmail-api/auth/userinfo`. Everything else is
404, so Stalwart's admin UI, account pages, OAuth login page, management API
(`/api/*`), discovery and health endpoints stay off the shared origin. The
responses gain:

```
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox
Cross-Origin-Resource-Policy: same-origin
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

Postern reads these with `fetch()`, where a CSP does nothing; it stops any
page Stalwart serves on those paths from running script on the origin. The
event source needs `flush_interval -1`, so each event is written as it comes.

## Why each one

- **`script-src 'self'`.** The build has no inline script and no `eval`.
- **`style-src 'unsafe-inline'`, the only loosening, is for the frames.** A
  `srcdoc` frame inherits the app's policy, and its own meta CSP can only
  narrow it. Message markup needs `<style>` blocks and `style=""`, and so does
  Postern's own frame CSS, so the app's policy must allow both. Hashes and
  nonces cannot cover arbitrary message styles. Checked 2026-10-20 by running
  the walk with `style-src 'self'`: the app's own screens (every list,
  settings, contacts) raised no violation, because React sets styles through
  the CSSOM, which CSP does not govern. Every document holding message or
  pasted HTML did: each message frame, the image viewer, the signature
  preview, and the inert DOMParser documents the two sanitisers parse in,
  which inherit the policy too. Splitting into `style-src-elem` and
  `style-src-attr` gains nothing: the frames need both.
- **`img-src data: blob: https:`.** `https:` is "Display images" (the sanitiser,
  not the CSP, does the blocking); `blob:` is the composer's inline images;
  `data:` is inline `cid:` images, the image viewer and the unread favicon.
- **`media-src`, `object-src`, `frame-src 'none'`.** Postern plays no media
  and frames no URL: its frames are all `srcdoc`, which `frame-src` does not
  govern (tested).
- **`worker-src`, `manifest-src 'self'`.** Brief 16's worker and manifest.
- **`form-action 'none'`.** Every form is handled by script; a submission that
  escaped would go nowhere.
- **`base-uri 'none'`.** Side effect, expected: the sanitiser parses a message
  in an inert DOMParser document, which inherits this policy, so a message
  carrying `<base>` logs one refused `base-uri` violation before DOMPurify
  drops the element (the base-href fixture).
- **`frame-ancestors 'none'` and `X-Frame-Options: DENY`.** Nothing frames
  Postern, not even another estate app on the origin. That closes the
  "same-origin frame" route to Postern's memory named in
  [decisions.md](decisions.md); `tokens.spec.ts` checks it.
- **`Cross-Origin-Opener-Policy: same-origin`.** A window another estate app
  opens on `/webmail/` comes back closed to it (tested), so it cannot script a
  Postern tab it opened. The PDF preview tab and Web Push are unaffected
  (tested). Caveat: this holds only while the opener's own document does not
  send COOP `same-origin` too. `noopener-allow-popups` removes that dependency
  and works in Chrome; check Firefox and Safari before switching.
- **`Cross-Origin-Resource-Policy: same-origin`.** No other origin loads
  Postern's files or Stalwart's answers as images or scripts.
- **`Permissions-Policy`.** Features Postern never uses, closed for the app
  and, by inheritance, for every frame. `bluetooth` is left out: Chrome 153
  logs it as an unrecognised feature.
- **`X-DNS-Prefetch-Control: off`** (and the same as a meta in every message
  frame). Chrome may resolve a link's host before any click, which tells the
  sender's DNS server the message was read. `dns.spec.ts` reads Chrome's net
  log and finds no lookup of any host a hostile message names.
- **`Referrer-Policy: no-referrer`, `nosniff`.** No URL leaves in a Referer;
  no file is read as another type.

Not adopted: Trusted Types (`require-trusted-types-for 'script'`) would make
any stray `innerHTML` throw, but `srcdoc` is itself a Trusted Types sink, so
`MessageFrame` and the two viewers would need one policy wrapping
`buildSrcdoc`. A later hardening, not a gap.

## Proven under these headers (2026-10-20, Chromium 153, Playwright 1.63.0)

Zero `securitypolicyviolation` events and zero CSP or Permissions-Policy
console lines on: sign-in; Inbox, Starred, Sent, Drafts, Spam, Trash, All
Mail, a user label, search results, contacts; settings General (with the
Web Push opt-in), Accounts, Labels, Filters; the HTML signature preview in its
`sandbox=""` frame; a conversation with inline `cid:` images; the image
preview; the PDF preview tab; "Display images" on the remote-content fixture;
the composer with a formatted paste and a pasted inline image; the service
worker registering at `/webmail/`; the phone layout at 390 px. A control test
injects an inline script and sees the watch catch it.

## The Caddy shape brief 18 deploys

The estate's route generator (`../vps-deploy/lib/constructs/caddy.ts`,
`renderRoute`) writes `handle_path` blocks with no headers and no path
matchers today, so brief 18 extends the construct rather than pasting this in.
What [the e2e Caddyfile](../../web/e2e/Caddyfile) proves:

```
redir /webmail /webmail/ 308
handle_path /webmail/* {
	root * <web/dist on the server>
	header { <the /webmail/ set above> ; -Server }
	@revalidate path / /index.html /sw.js /manifest.webmanifest
	header @revalidate Cache-Control "no-cache"
	header /assets/* Cache-Control "public, max-age=31536000, immutable"
	header /manifest.webmanifest Content-Type "application/manifest+json"
	try_files {path} {path}/ /index.html
	file_server
}
@api path /webmail-api/jmap/* /webmail-api/api/auth /webmail-api/auth/token /webmail-api/auth/userinfo
handle @api {
	uri strip_prefix /webmail-api
	header { <the /webmail-api/ set above> ; -Server }
	reverse_proxy <stalwart> { flush_interval -1 }
}
```

Caddy adds `X-Forwarded-For`; production's Stalwart reads it
(`useXForwarded`, [security.md](security.md)), so a ban hits one client.
