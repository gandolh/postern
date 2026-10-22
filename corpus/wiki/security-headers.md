---
summary: The HTTP headers production sends for Postern and /webmail-api on postern.<domain>, final since brief 17 (2026-10-20), on its own host since brief 19 (2026-10-22). The exact CSP and why each directive is there (style-src 'unsafe-inline' exists only for the message frames, and why it cannot go), COOP, CORP, Permissions-Policy, nosniff, no-referrer, X-Frame-Options, the /webmail-api path allowlist, which screens were proven under them, and the Caddy route shape ../vps-deploy renders. Read before changing a header or the Caddy route.
updated: 2026-10-22
---

# Security headers

Settled by brief 17 and proven by the browser tests in [web/e2e](../../web/e2e/README.md)
(`csp.spec.ts`): the production build, served by Caddy 2.11.7 with
[the e2e Caddyfile](../../web/e2e/Caddyfile), every screen walked with zero
CSP violations. The same text lives in
[web/src/sw/headers.ts](../../web/src/sw/headers.ts), which the test checks
the served headers against. Change the three together. Why the headers
matter: [security.md](security.md).

## Postern (every response on the host but /webmail-api: HTML, JS, CSS, sw.js, the manifest)

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

Also: `Cache-Control: no-cache` by default (`?Cache-Control` in Caddy, so
`index.html`, `sw.js`, the manifest and deep-link fallbacks all revalidate; a
path list would miss the fallbacks, since Caddy's matchers run before
`try_files`); `public, max-age=31536000, immutable` on `/assets/*`;
`Content-Type: application/manifest+json` on the manifest; no `Server`
header; never `Service-Worker-Allowed` (brief 16's estate rule).

## /webmail-api/ (Stalwart, prefix stripped)

Only the paths Postern calls pass: `/webmail-api/jmap/*` (session, API,
upload, download, event source), `/webmail-api/api/auth`,
`/webmail-api/auth/token` and `/webmail-api/auth/userinfo`. Everything else is
404, so Stalwart's admin UI, account pages, OAuth login page, management API
(`/api/*`), discovery and health endpoints stay off Postern's origin. The
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
  Postern, not even another estate app. On the shared origin this closed the
  "same-origin frame" route to Postern's memory ([decisions.md](decisions.md));
  `tokens.spec.ts` checks it from another origin now.
- **`Cross-Origin-Opener-Policy: same-origin`.** A window another estate app
  opens on Postern comes back closed to it (tested), so it cannot script a
  Postern tab it opened. The PDF preview tab and Web Push are unaffected
  (tested). On the shared origin this held only while the opener did not send
  COOP `same-origin` too; an opener on another origin is always cut off, so
  that caveat ended on 2026-10-22.
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
worker registering at `/webmail/` (at `/` since 2026-10-22, re-run then); the phone layout at 390 px. A control test
injects an inline script and sees the watch catch it.

## The Caddy shape on postern.<domain>

`../vps-deploy` renders Postern's site block from its stacks
(`../vps-deploy/stacks/postern.ts`, and the `/webmail-api` route in
`../vps-deploy/stacks/mail.ts`). What
[the e2e Caddyfile](../../web/e2e/Caddyfile) proves, in the order Caddy tries
the blocks:

```
@api path /webmail-api/jmap/* /webmail-api/api/auth /webmail-api/auth/token /webmail-api/auth/userinfo
handle @api {
	uri strip_prefix /webmail-api
	header { <the /webmail-api/ set above> ; -Server }
	reverse_proxy <stalwart> { flush_interval -1 }
}
@api_refused path /webmail-api /webmail-api/*
handle @api_refused {
	respond 404
}
handle {
	root * <web/dist on the server>
	header { <the Postern set above> ; ?Cache-Control "no-cache" ; -Server }
	header /assets/* Cache-Control "public, max-age=31536000, immutable"
	header /manifest.webmanifest Content-Type "application/manifest+json"
	encode gzip zstd
	try_files {path} {path}/ /index.html
	file_server
}
```

Caddy adds `X-Forwarded-For`; production's Stalwart reads it
(`useXForwarded`, [security.md](security.md)), so a ban hits one client.
