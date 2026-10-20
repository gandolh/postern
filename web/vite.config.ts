import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

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

export default defineConfig({
  base: "/webmail/",
  plugins: [react()],
  build: { outDir: "dist" },
  server: { port: 5173, proxy: devProxy() },
  preview: { proxy: devProxy() },
});
