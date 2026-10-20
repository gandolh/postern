// The response headers production sends, as the Caddyfile sets them: the one
// copy of their text. The service worker builds every response it serves
// from its cache with APP_HEADERS (shell.ts), so a cache entry with stripped
// or forged headers cannot remove the CSP; web/e2e/lib/headers.ts re-exports
// this file, and csp.spec.ts checks the served headers against it.
// corpus/wiki/security-headers.md records the same text for brief 18 and the
// e2e Caddyfile sets it: change all three together.
//
// No imports: the worker, the app and the e2e suite (verbatimModuleSyntax) all read it.

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** On every response under /webmail/. */
export const APP_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": CSP,
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), midi=(), display-capture=(), publickey-credentials-get=(), browsing-topics=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-dns-prefetch-control": "off",
};

/** On every response under /webmail-api/ (Stalwart's own headers pass through beside them). */
export const API_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
