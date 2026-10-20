// The app shell the worker serves offline, checked on every read (finding F1,
// corpus/wiki/security-findings.md).
//
// Cache Storage belongs to the whole origin, so any script in any estate app
// can rewrite what is in it. The worker therefore trusts nothing it reads
// back: the build bakes a SHA-256 for every shell file into sw.js (the
// browser fetches the worker script itself from the network and keeps it
// where no page script can write), and every cached body is hashed and
// compared before it is served. The response is then built here from those
// verified bytes, with the Content-Type for its extension and production's
// full header set (headers.ts): cached headers are never used, so an entry
// with stripped headers cannot drop the CSP. A missing or wrong entry is
// deleted and the request goes to the network, untouched; the cache is
// refilled only with a body that matches its hash.
//
// Never cached or answered: anything under /webmail-api, anything outside
// /webmail/, any file the build did not list with a hash, any method but GET.
//
// Pure apart from what comes in through ShellDeps, so it is tested with a fake
// CacheStorage (shell.test.ts). sw.ts wires it to the worker's events.

import { APP_HEADERS } from "./headers";
import { mayAnswerFromPrecache, servesShell } from "./routing";

/** One entry of the build's list (vite-plugin-pwa injectManifest, plus our integrity). */
export interface ManifestEntry {
  url: string;
  revision?: string | null;
  /** "sha256-<base64>", added at build time (vite.config.ts manifestTransforms). */
  integrity?: string;
}

/** A shell file the worker may serve from its cache. */
export interface ShellFile {
  /** Absolute URL, the cache key. */
  url: string;
  pathname: string;
  integrity: string;
  contentType: string;
}

export interface ShellDeps {
  caches: Pick<CacheStorage, "open" | "keys" | "delete">;
  fetch: (input: Request | string, init?: RequestInit) => Promise<Response>;
  /** The registration's scope URL, e.g. https://example.org/webmail/ */
  scopeUrl: string;
}

/** Cache names this worker owns start with this; nothing else on the origin is touched. */
export const CACHE_PREFIX = "postern-shell-";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  png: "image/png",
  svg: "image/svg+xml",
  woff2: "font/woff2",
  webmanifest: "application/manifest+json",
};

/** The Content-Type a shell file is served with, or null for a type the worker does not serve. */
export function contentTypeFor(pathname: string): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(pathname)?.[1]?.toLowerCase();
  return (ext && TYPES[ext]) ?? null;
}

/** The files the worker may serve from its cache: listed with a hash, inside the scope, of a known type. */
export function shellFiles(manifest: readonly (ManifestEntry | string)[], scopeUrl: string): Map<string, ShellFile> {
  const scope = new URL(scopeUrl);
  const files = new Map<string, ShellFile>();
  for (const entry of manifest) {
    if (typeof entry === "string" || typeof entry.integrity !== "string" || !/^sha256-[A-Za-z0-9+/]+=*$/.test(entry.integrity)) continue;
    const url = new URL(entry.url, scope);
    if (!mayAnswerFromPrecache(url, scope.origin, scope.pathname)) continue;
    const contentType = contentTypeFor(url.pathname);
    if (!contentType) continue;
    files.set(url.pathname, { url: url.origin + url.pathname, pathname: url.pathname, integrity: entry.integrity, contentType });
  }
  return files;
}

/** The cache for this build: its name changes with any file, so two builds never share one. */
export function cacheNameFor(files: ReadonlyMap<string, ShellFile>): string {
  const text = [...files.values()]
    .map((f) => `${f.pathname} ${f.integrity}`)
    .sort()
    .join("\n");
  // FNV-1a, 32-bit: a name, not a security check (the hashes are).
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${CACHE_PREFIX}${h.toString(16).padStart(8, "0")}`;
}

/** "sha256-<base64>" of a body. */
export async function integrityOf(body: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return `sha256-${btoa(binary)}`;
}

async function matches(body: ArrayBuffer, integrity: string): Promise<boolean> {
  try {
    return (await integrityOf(body)) === integrity;
  } catch {
    return false;
  }
}

/** A response made here from verified bytes: its type, production's headers, nothing from the cache. */
export function buildResponse(file: ShellFile, body: ArrayBuffer): Response {
  return new Response(body, { status: 200, statusText: "OK", headers: { ...APP_HEADERS, "content-type": file.contentType } });
}

/** Which shell file answers this request, or null to leave it to the network. Synchronous: fetch handlers decide at once. */
export function pick(request: Request, files: ReadonlyMap<string, ShellFile>, scopeUrl: string): ShellFile | null {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  const scope = new URL(scopeUrl);
  if (request.mode === "navigate") return servesShell(url, scope.origin, scope.pathname) ? (files.get(`${scope.pathname}index.html`) ?? null) : null;
  if (!mayAnswerFromPrecache(url, scope.origin, scope.pathname)) return null;
  return files.get(url.pathname) ?? null;
}

/** The cached copy of a file, only if its bytes are the build's; a wrong one is deleted. */
export async function readVerified(file: ShellFile, cacheName: string, deps: ShellDeps): Promise<Response | null> {
  const cache = await deps.caches.open(cacheName);
  const hit = await cache.match(file.url);
  if (!hit) return null;
  let body: ArrayBuffer;
  try {
    body = await hit.arrayBuffer();
  } catch {
    body = new ArrayBuffer(0);
  }
  // The same bytes are checked and served: nothing can change between the two.
  if (await matches(body, file.integrity)) return buildResponse(file, body);
  await cache.delete(file.url).catch(() => false);
  return null;
}

/** Store a body under a file's URL, only if it is the build's. */
async function store(file: ShellFile, body: ArrayBuffer, cacheName: string, deps: ShellDeps): Promise<boolean> {
  if (!(await matches(body, file.integrity))) return false;
  const cache = await deps.caches.open(cacheName);
  await cache.put(file.url, buildResponse(file, body));
  return true;
}

/**
 * Answer a request for a shell file: the verified cached copy, else the
 * network as it is (the server's own response and headers), refilling the
 * cache when that body is the build's. Offline with no good copy, a network
 * error: forged bytes are never served.
 */
export async function serve(
  file: ShellFile,
  request: Request,
  cacheName: string,
  deps: ShellDeps,
  waitUntil: (work: Promise<unknown>) => void = () => {},
): Promise<Response> {
  const cached = await readVerified(file, cacheName, deps).catch(() => null);
  if (cached) return cached;
  let response: Response;
  try {
    response = await deps.fetch(request);
  } catch {
    return Response.error();
  }
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    waitUntil(
      copy
        .arrayBuffer()
        .then((body) => store(file, body, cacheName, deps))
        .catch(() => false),
    );
  }
  return response;
}

/** Fill this build's cache, file by file. A file that fails or does not match is skipped, never fatal. */
export async function installShell(files: ReadonlyMap<string, ShellFile>, cacheName: string, deps: ShellDeps): Promise<{ stored: string[]; skipped: string[] }> {
  const stored: string[] = [];
  const skipped: string[] = [];
  await Promise.all(
    [...files.values()].map(async (file) => {
      try {
        // A redirect or a newer deploy is harmless: only bytes that hash right are kept.
        const response = await deps.fetch(file.url, { cache: "no-cache", credentials: "same-origin" });
        if (!response.ok) throw new Error(String(response.status));
        if (await store(file, await response.arrayBuffer(), cacheName, deps)) stored.push(file.pathname);
        else skipped.push(file.pathname);
      } catch {
        skipped.push(file.pathname);
      }
    }),
  );
  return { stored: stored.sort(), skipped: skipped.sort() };
}

/** Delete this worker's older caches and brief 16's workbox cache. Other apps' caches on the origin are left alone. */
export async function cleanupCaches(current: string, deps: ShellDeps): Promise<string[]> {
  const legacy = `workbox-precache-v2-${deps.scopeUrl}`;
  const gone = (await deps.caches.keys()).filter((name) => name === legacy || (name.startsWith(CACHE_PREFIX) && name !== current));
  await Promise.all(gone.map((name) => deps.caches.delete(name)));
  return gone;
}
