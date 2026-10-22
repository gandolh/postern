// What the service worker answers (brief 16), as pure functions so they can be
// tested without a worker. sw.ts is the thin part that wires them to workbox.
//
// The worker caches the app shell and nothing else (owner decision
// 2026-10-20: no offline mail). It never routes, answers or caches a request
// under /webmail-api (Stalwart: mail, tokens, attachments), nor anything
// outside its scope or on another origin. Requests it does not route go to the
// network untouched. Since 2026-10-22 the scope is `/`, the whole host, so the
// API is inside it and only these checks keep the worker off it.

/** The API prefix on Postern's host, Stalwart behind Caddy (and Vite's proxy in dev). */
export const API_PREFIX = "/webmail-api";

/** Paths the navigation fallback must never answer, whatever the scope. */
export const NAVIGATION_DENYLIST: readonly RegExp[] = [/^\/webmail-api(\/|$)/];

/** The scope path from the build's base (`/`); one trailing slash. */
export function scopePath(base: string): string {
  const withLead = base.startsWith("/") ? base : `/${base}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
}

/** True for Stalwart's API, the part of the origin the worker must never touch. */
export function isApiPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
}

/**
 * Should a navigation get the app shell (`<scope>index.html`, precached)?
 * Only same-origin navigations inside the app's scope, never the API.
 */
export function servesShell(url: URL, origin: string, scope: string): boolean {
  if (url.origin !== origin) return false;
  if (isApiPath(url.pathname)) return false;
  if (NAVIGATION_DENYLIST.some((re) => re.test(url.pathname))) return false;
  return url.pathname === scope || url.pathname.startsWith(scope) || url.pathname === scope.slice(0, -1);
}

/**
 * May the precache answer this request? Same origin, inside the scope, not the
 * API. Workbox only answers URLs in its build-time manifest anyway; this is the
 * guard that keeps it so if the manifest or the scope ever widens.
 */
export function mayAnswerFromPrecache(url: URL, origin: string, scope: string): boolean {
  return url.origin === origin && !isApiPath(url.pathname) && url.pathname.startsWith(scope);
}
