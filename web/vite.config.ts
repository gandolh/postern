import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Local dev on one origin, the way Caddy serves the deploy: `/webmail-api` is
 * Stalwart with the prefix stripped, so it sees `/jmap/...`, `/api/...` and
 * `/auth/...`. Server-sent events (`text/event-stream`) stream through: the
 * proxy adds no buffering, and nothing here should.
 *
 * Node holds a proxied response's headers until the first body chunk, and
 * Stalwart's event source sends nothing until its first ping (30 s). So the
 * push reader would sit in "Reconnecting…" for half a minute after every
 * reconnect. Flush the headers once the proxy has written them, as Caddy does
 * in production.
 */
function devProxy(): Record<string, ProxyOptions> {
  return {
    "/webmail-api": {
      target: process.env.POSTERN_DEV_API ?? "http://127.0.0.1:18080",
      rewrite: (url) => url.replace(/^\/webmail-api/, ""),
      ws: true,
      configure: (proxy) => {
        proxy.on("proxyRes", (proxyRes, _req, res) => {
          if (!/^text\/event-stream/i.test(proxyRes.headers["content-type"] ?? "")) return;
          setImmediate(() => res.flushHeaders());
        });
      },
    },
  };
}

/** Where Postern is served. Scope, start URL and the navigation fallback all hang off it. */
const BASE = "/webmail/";

/** build.outDir, where the shell files are read back to hash them. */
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "dist");

/**
 * Finding F1: bake a SHA-256 of every shell file into sw.js. The worker checks
 * each cached body against it before serving, because any script on the
 * shared origin can rewrite Cache Storage (src/sw/shell.ts).
 */
interface ShellEntry {
  url: string;
  revision: string | null;
  size: number;
  integrity?: string;
}

async function withIntegrity(entries: ShellEntry[]): Promise<{ manifest: ShellEntry[]; warnings: string[] }> {
  const manifest = await Promise.all(
    entries.map(async (entry) => {
      const body = await readFile(resolve(DIST, entry.url));
      return { ...entry, integrity: `sha256-${createHash("sha256").update(body).digest("base64")}` };
    }),
  );
  return { manifest, warnings: [] };
}

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    /*
     * The installable app (brief 16). Our own worker, src/sw/sw.ts, in
     * vite-plugin-pwa's injectManifest mode (as Satchel does): workbox only
     * injects the list of app-shell files, here with a hash for each. The
     * worker caches the shell and nothing else (never mail, never a
     * /webmail-api response: owner decision 2026-10-20, no offline mail) and
     * serves a cached file only after checking its hash. It also shows Web
     * Push notifications. There is no worker under `vite dev`; check it with
     * `npm run build` and `vite preview`, or `npm run test:e2e`.
     */
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "sw.ts",
      // A new worker waits; push/register.ts decides when it may take over
      // (never under a signed-in page: a reload signs you out).
      registerType: "prompt",
      // push/register.ts registers through `virtual:pwa-register`.
      injectRegister: false,
      // The icons are in public/ and the png glob below precaches them once.
      includeManifestIcons: false,
      manifest: {
        id: BASE,
        name: "Postern",
        short_name: "Postern",
        description: "Postern, a webmail client for Stalwart.",
        lang: "en",
        dir: "ltr",
        display: "standalone",
        scope: BASE,
        start_url: BASE,
        // Raw hex only here: the manifest can't read CSS tokens. Keep in step
        // with --color-canvas (light) in src/theme/tokens.css and the
        // theme-color meta in index.html.
        theme_color: "#f2f4f1",
        background_color: "#f2f4f1",
        // Relative, so they resolve against the manifest under BASE. Made from
        // public/postern-mark.svg; the maskable one keeps the mark inside the
        // safe zone on a limestone ground.
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        // The app shell only: HTML, JS, CSS, icons, the manifest and the woff2
        // fonts (the .woff fallbacks are built but never needed by a browser
        // that runs a service worker). Nothing is cached at runtime. Each file
        // gets its SHA-256 (withIntegrity); the plugin's own manifest entry,
        // added after the transforms and so without one, is ignored by the
        // worker in favour of this hashed copy.
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest,woff2}"],
        manifestTransforms: [withIntegrity],
      },
    }),
  ],
  build: { outDir: "dist" },
  server: { port: 5173, proxy: devProxy() },
  // `vite preview` serves the built app (with its service worker) behind the
  // same proxy, for checking installability and push locally.
  preview: { proxy: devProxy() },
});
