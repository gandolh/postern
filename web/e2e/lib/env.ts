// Where the browser tests run and what they run against. Shared by the
// Playwright config, the global setup and the specs.

import { fileURLToPath } from "node:url";

/** The Caddy container's published port (127.0.0.1 only). */
export const E2E_PORT = Number(process.env.POSTERN_E2E_PORT ?? 5193);

/** The origin the app is served on. `localhost` is a secure context, so the service worker registers. */
export const ORIGIN = `http://localhost:${E2E_PORT}`;

/** The app. */
export const APP_URL = `${ORIGIN}/webmail/`;

/** Another estate app on the same origin (a static page in the Caddyfile). */
export const PROBE_URL = `${ORIGIN}/probe/`;

/** Where the two paths Postern owns start. Any other request from the app is a leak. */
export const APP_PREFIXES = [`${ORIGIN}/webmail/`, `${ORIGIN}/webmail-api/`] as const;

export const CADDY_IMAGE = "caddy:2.11.7";
export const CADDY_CONTAINER = "postern-e2e-caddy";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const E2E_DIR = fileURLToPath(new URL("../", import.meta.url));
export const DIST_DIR = fileURLToPath(new URL("../../dist/", import.meta.url));

/** True when a URL belongs to Postern: under /webmail/ or /webmail-api/ on this origin, or a data:/blob: URL the app made. */
export function isPosternUrl(url: string): boolean {
  if (url.startsWith("data:")) return true;
  if (url.startsWith(`blob:${ORIGIN}/`)) return true;
  return APP_PREFIXES.some((prefix) => url.startsWith(prefix)) || url === `${ORIGIN}/webmail`;
}
