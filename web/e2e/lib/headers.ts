// The response headers production sends, as the Caddyfile sets them. The text
// lives in web/src/sw/headers.ts, where the service worker also builds every
// response it serves from its cache with it; csp.spec.ts checks the served
// headers against it. corpus/wiki/security-headers.md records the same text
// for brief 18. Change the Caddyfile, that file and the wiki together.

export { API_HEADERS, APP_HEADERS, CSP } from "../../src/sw/headers.ts";
