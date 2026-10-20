// Where sign-in talks to, and where Stalwart's own account page is.

/** Stalwart on Postern's own origin: Vite's proxy in dev, Caddy in production. */
export const API_BASE = "/webmail-api";

/**
 * Stalwart's account page, where the user changes the password, turns on
 * 2-step verification (TOTP) and creates app passwords for mail apps. It is
 * Stalwart's own web app at `/account/` on the mail host, not under
 * `/webmail-api` (its asset paths are absolute).
 *
 * Set `VITE_STALWART_ACCOUNT_URL` at build time (production: the mail host's
 * `/account/`). Unset, dev links to the dev server's account page and a
 * production build shows no link.
 */
export const STALWART_ACCOUNT_URL: string | undefined =
  (import.meta.env.VITE_STALWART_ACCOUNT_URL as string | undefined) ||
  (import.meta.env.DEV ? "http://127.0.0.1:18080/account/" : undefined);

/**
 * The redirect URI Stalwart binds the authorization code to: the app's own
 * URL, same origin. Nothing is ever redirected there; it only has to be the
 * same on both calls.
 */
export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}
