// Where the browser tests run and what they run against. Shared by the
// Playwright config, the global setup and the specs.

import { fileURLToPath } from "node:url";

/** The Caddy container's published port (127.0.0.1 only). */
export const E2E_PORT = Number(process.env.POSTERN_E2E_PORT ?? 5193);

/** The stand-in for another estate app (127.0.0.1 only). */
export const PROBE_PORT = Number(process.env.POSTERN_E2E_PROBE_PORT ?? 5194);

/**
 * The origin the app is served on, the whole of it, as postern.<domain> is.
 * `localhost` is a secure context, so the service worker registers.
 */
export const ORIGIN = `http://localhost:${E2E_PORT}`;

/** The app. */
export const APP_URL = `${ORIGIN}/`;

/** Another estate app: the same site, another origin (a static page in the Caddyfile). */
export const PROBE_URL = `http://localhost:${PROBE_PORT}/probe/`;

export const CADDY_IMAGE = "caddy:2.11.7";
export const CADDY_CONTAINER = "postern-e2e-caddy";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const E2E_DIR = fileURLToPath(new URL("../", import.meta.url));
export const DIST_DIR = fileURLToPath(new URL("../../dist/", import.meta.url));

/** True when a URL belongs to Postern: on its origin, or a data:/blob: URL the app made. Any other request from the app is a leak. */
export function isPosternUrl(url: string): boolean {
  if (url.startsWith("data:")) return true;
  if (url.startsWith(`blob:${ORIGIN}/`)) return true;
  return url.startsWith(`${ORIGIN}/`) || url === ORIGIN;
}
