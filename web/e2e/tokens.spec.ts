// The access token stays in memory; since brief 27 the refresh token is kept
// in this tab's sessionStorage, so a reload keeps the session
// (corpus/wiki/security.md). These tests catch every secret the sign-in
// handles (the password, the authorization code, the PKCE verifier, the
// access, refresh and ID tokens) as it crosses the network, then look for it
// everywhere else: storage, cookies, IndexedDB, Cache Storage, URLs, the DOM,
// console lines and errors, from Postern's page and from another estate app's
// page (the same site, another origin, as the apex is to postern.<domain>).
// Postern's sessionStorage may hold the refresh token and nothing else.
// Secrets are only ever compared, never printed: a failure names the place
// or the kind, not the value.

import { expect, test, type BrowserContext, type Page, type Request } from "@playwright/test";
import { goTo, openConversation, signIn, stubOutsideWorld } from "./lib/app.ts";
import { hostileSet, password } from "./lib/devmail.ts";
import { APP_URL, ORIGIN, PROBE_URL } from "./lib/env.ts";
import { APP_HEADERS } from "./lib/headers.ts";

test.use({ serviceWorkers: "allow" });

/** Every secret the sign-in and refreshes put on the wire, caught from the traffic. */
class Secrets {
  /** Each secret, with its kind. */
  readonly values = new Map<string, string>();
  readonly kinds = new Set<string>();

  constructor(context: BrowserContext) {
    this.add("password", password("alice"));
    context.on("request", (request) => {
      if (!request.url().endsWith("/webmail-api/auth/token") || request.method() !== "POST") return;
      const body = new URLSearchParams(request.postData() ?? "");
      this.add("authorization code", body.get("code"));
      this.add("PKCE verifier", body.get("code_verifier"));
      this.add("refresh token", body.get("refresh_token"));
    });
    context.on("response", async (response) => {
      const url = response.url();
      if (!url.endsWith("/webmail-api/api/auth") && !url.endsWith("/webmail-api/auth/token")) return;
      const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!json) return;
      this.add("authorization code", json["client_code"]);
      this.add("access token", json["access_token"]);
      this.add("refresh token", json["refresh_token"]);
      this.add("ID token", json["id_token"]);
    });
  }

  add(kind: string, value: unknown): void {
    if (typeof value !== "string" || value.length < 8) return;
    this.values.set(value, kind);
    this.kinds.add(kind);
  }

  /** The names of the places whose text holds any secret. */
  foundIn(places: Record<string, string>): string[] {
    return Object.entries(places)
      .filter(([, text]) => [...this.values.keys()].some((secret) => text.includes(secret)))
      .map(([place]) => place);
  }

  /** The kinds of secret a text holds, sorted. */
  kindsIn(text: string): string[] {
    return [...new Set([...this.values].filter(([secret]) => text.includes(secret)).map(([, kind]) => kind))].sort();
  }
}

/** Everything a script on this page can read without the app's help. */
function dumpOrigin(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const out: Record<string, string> = {};
    const storage = (s: Storage) => JSON.stringify(Array.from({ length: s.length }, (_, i) => [s.key(i), s.getItem(s.key(i) ?? "")]));
    out["localStorage"] = storage(localStorage);
    out["sessionStorage"] = storage(sessionStorage);
    out["document.cookie"] = document.cookie;
    out["window.name"] = window.name;
    out["location"] = location.href;
    const dbs = await indexedDB.databases();
    const idb: unknown[] = [];
    for (const info of dbs) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(info.name!);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const all = await new Promise<unknown[]>((resolve) => {
          const req = db.transaction(store, "readonly").objectStore(store).getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve([]);
        });
        idb.push([info.name, store, all]);
      }
      db.close();
    }
    out["IndexedDB"] = JSON.stringify(idb);
    const cached: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        const type = response?.headers.get("content-type") ?? "";
        cached.push(`${name} ${request.url} ${JSON.stringify([...(response?.headers.entries() ?? [])])}`);
        if (/text|javascript|json|html/.test(type)) cached.push((await response?.text()) ?? "");
      }
    }
    out["Cache Storage"] = cached.join("\n");
    out["cache names"] = JSON.stringify(await caches.keys());
    return out;
  });
}

function requestPlaces(requests: Request[]): Promise<Record<string, string>> {
  return Promise.all(
    requests.map(async (r) => {
      const headers = await r.allHeaders();
      // Authorization is where the access token belongs; every other header is checked.
      const { authorization: _authorization, ...rest } = headers;
      return [r.url(), JSON.stringify(rest)] as const;
    }),
  ).then((pairs) => ({
    "request URLs": pairs.map(([url]) => url).join("\n"),
    "request headers other than Authorization": pairs.map(([, h]) => h).join("\n"),
  }));
}

test("no secret reaches storage, cookies, caches, URLs, the DOM or the console", async ({ page, context }) => {
  test.setTimeout(120_000);
  await stubOutsideWorld(context);
  const secrets = new Secrets(context);
  const requests: Request[] = [];
  context.on("request", (r) => requests.push(r));
  const consoleLines: string[] = [];
  const errors: string[] = [];
  context.on("console", (m) => consoleLines.push(m.text()));
  page.on("pageerror", (e) => errors.push(`${e.message}\n${e.stack ?? ""}`));

  await signIn(page);
  await page.evaluate(async () => navigator.serviceWorker.ready);
  const hostile = await hostileSet();
  await openConversation(page, hostile.labelId, hostile.bySlug.get("forged-sender")!.threadId);
  for (const hash of ["#inbox", "#search/from%3Abob", "#settings/general", "#contacts", "#starred"]) {
    await goTo(page, hash);
    await page.waitForTimeout(400);
  }
  expect([...secrets.kinds].sort()).toEqual(["ID token", "PKCE verifier", "access token", "authorization code", "password", "refresh token"]);

  const probe = await context.newPage();
  await probe.goto(PROBE_URL);
  // Brief 27: Postern's sessionStorage is checked on its own, below.
  const { sessionStorage: kept, ...postern } = await dumpOrigin(page);
  const places: Record<string, string> = {
    ...Object.fromEntries(Object.entries(postern).map(([k, v]) => [`Postern's ${k}`, v])),
    ...Object.fromEntries(Object.entries(await dumpOrigin(probe)).map(([k, v]) => [`another app's ${k}`, v])),
    ...(await requestPlaces(requests)),
    "console lines": consoleLines.join("\n"),
    "uncaught errors": errors.join("\n"),
    "Postern's DOM": await page.evaluate(() => document.documentElement.outerHTML),
    "history length and URL": `${await page.evaluate(() => history.length)} ${page.url()}`,
  };
  expect(secrets.foundIn(places), "places holding a secret").toEqual([]);
  // Nothing at all in the places a token would hide in. (Booleans: a failure must not print what was found.)
  // sessionStorage holds Postern's session record, with the refresh token and no other secret (brief 27).
  const keys = (JSON.parse(kept ?? "[]") as [string, string][]).map(([key]) => key);
  expect(keys.join(",") === "postern.session", "sessionStorage holds only postern.session").toBe(true);
  expect(secrets.kindsIn(kept ?? "")).toEqual(["refresh token"]);
  expect(places["Postern's document.cookie"] === "", "no cookie").toBe(true);
  expect(places["Postern's IndexedDB"] === "[]", "IndexedDB is empty").toBe(true);
  // What Cache Storage does hold is the app shell, nothing from Stalwart.
  expect(places["Postern's Cache Storage"]?.includes("/webmail-api/"), "no Stalwart response in Cache Storage").toBe(false);
});

test("another estate app's page cannot reach Postern's window, worker or tokens", async ({ page, context }) => {
  await stubOutsideWorld(context);
  await signIn(page);
  const probe = await context.newPage();
  await probe.goto(PROBE_URL);

  const heard = await test.step("a BroadcastChannel hears nothing while Postern works", async () => {
    await probe.evaluate(() => {
      const w = window as unknown as { heard: string[] };
      w.heard = [];
      for (const name of ["postern", "Postern", "auth", "session", "token", "jmap", "workbox", "sw", "webmail"]) {
        new BroadcastChannel(name).onmessage = (e) => w.heard.push(`${name}: ${JSON.stringify(e.data)}`);
      }
    });
    for (const hash of ["#inbox", "#settings/general", "#inbox"]) {
      await goTo(page, hash);
      await page.waitForTimeout(300);
    }
    return probe.evaluate(() => (window as unknown as { heard: string[] }).heard);
  });
  expect(heard).toEqual([]);

  await test.step("framing Postern is refused (frame-ancestors 'none')", async () => {
    const framed = await probe.evaluate(async (url) => {
      const frame = document.createElement("iframe");
      frame.src = url;
      document.body.append(frame);
      await new Promise((r) => setTimeout(r, 1_500));
      try {
        return frame.contentWindow?.document?.body?.innerHTML ?? "(no document)";
      } catch (err) {
        return `blocked: ${(err as Error).name}`;
      }
    }, APP_URL);
    expect(framed).not.toContain('id="root"');
    test.info().annotations.push({ type: "framing Postern", description: framed.slice(0, 120) });
  });

  await test.step("a window it opens on Postern is cut off from it (COOP same-origin)", async () => {
    const opened = await probe.evaluate(async (url) => {
      const w = window.open(url, "_blank");
      await new Promise((r) => setTimeout(r, 1_500));
      if (!w) return "null";
      try {
        return w.closed ? "closed" : `open: ${w.document.title}`;
      } catch (err) {
        return `blocked: ${(err as Error).name}`;
      }
    }, APP_URL);
    expect(opened).toMatch(/^(null|closed|blocked)/);
    test.info().annotations.push({ type: "window.open(Postern)", description: opened });
    for (const p of context.pages()) if (p !== page && p !== probe) await p.close();
  });

  await test.step("what it can see of Postern: no worker, no prefs, no shell cache, no cookie", async () => {
    const seen = await probe.evaluate(async () => ({
      cookie: document.cookie,
      registrations: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope),
      localStorageKeys: Object.keys(localStorage).sort(),
      caches: await caches.keys(),
    }));
    // Before 2026-10-22, on the shared origin, it saw the first three
    // (corpus/wiki/security.md). On its own origin it sees none of them.
    expect(seen).toEqual({ cookie: "", registrations: [], localStorageKeys: [], caches: [] });
  });
});

test("the idle timeout signs out after 8 hours without input, and the session is gone", async ({ page, context }) => {
  await stubOutsideWorld(context);
  await page.clock.install();
  await signIn(page);
  // A refresh comes due within the hour: the session lives on through it.
  await page.clock.fastForward("01:00:00");
  await page.waitForTimeout(1_000);
  await expect(page.locator(".shell")).toBeVisible();

  const authorized: string[] = [];
  page.on("request", async (r) => {
    if (r.url().startsWith(`${ORIGIN}/webmail-api/`) && (await r.headerValue("authorization"))) authorized.push(r.url());
  });
  await page.clock.fastForward("07:00:01");
  await expect(page.locator(".auth-notice")).toHaveText("You were signed out after a long time without activity. Sign in again to continue.");
  expect((await page.locator("input[name=password]").inputValue()) === "", "the password field is empty").toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem("postern.session") === null), "the kept session is gone").toBe(true);
  const after = authorized.length;
  await goTo(page, "#inbox");
  await page.clock.fastForward("00:05:00");
  await page.waitForTimeout(1_000);
  await expect(page.locator(".shell")).toHaveCount(0);
  expect(authorized.slice(after), "authorized requests after the idle sign-out").toEqual([]);
});

test("sign-out forgets the session; Stalwart 0.16 cannot revoke the token", async ({ page, context, request }) => {
  await stubOutsideWorld(context);
  let accessToken: string | undefined;
  context.on("response", async (response) => {
    if (!response.url().endsWith("/webmail-api/auth/token")) return;
    const json = (await response.json().catch(() => null)) as { access_token?: string } | null;
    if (json?.access_token) accessToken = json.access_token;
  });
  const streams: Request[] = [];
  const ended = new Set<Request>();
  page.on("request", (r) => {
    if (r.url().includes("/webmail-api/jmap/eventsource")) streams.push(r);
  });
  page.on("requestfailed", (r) => ended.add(r));
  page.on("requestfinished", (r) => ended.add(r));
  await signIn(page);
  await expect.poll(() => streams.length).toBeGreaterThan(0);
  expect(accessToken, "the access token was seen on the wire").toBeTruthy();

  const authorized: string[] = [];
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator("input[name=username]")).toBeVisible();
  page.on("request", async (r) => {
    if (r.url().startsWith(`${ORIGIN}/webmail-api/`) && (await r.headerValue("authorization"))) authorized.push(r.url());
  });
  // The live stream is closed, and nothing signed is sent again, wherever the app goes.
  const stream = streams[streams.length - 1]!;
  await expect.poll(() => ended.has(stream), { message: "the live event stream closed at sign-out" }).toBe(true);
  await goTo(page, "#inbox");
  await page.goBack();
  await page.waitForTimeout(1_500);
  await expect(page.locator(".shell")).toHaveCount(0);
  expect(authorized, "authorized requests after sign-out").toEqual([]);

  // Known gap (security.md): a token copied before sign-out still works until it expires.
  const copied = await request.get(`${ORIGIN}/webmail-api/jmap/session`, { headers: { authorization: `Bearer ${accessToken}` } });
  const session = (await copied.json()) as { accounts?: Record<string, unknown> };
  expect(Object.keys(session.accounts ?? {}).length, "Stalwart 0.16.25 has no revocation: the copied token still opens the session").toBeGreaterThan(0);
});

// ---- Finding F1 (corpus/wiki/security-findings.md), fixed ---------------------
// Cache Storage belongs to the whole origin: any script that runs on it can
// rewrite the worker's cache. The worker checks every cached body against a
// SHA-256 baked into sw.js and builds the response itself with production's
// headers (web/src/sw/shell.ts), so a rewritten entry is never served and a
// stripped one cannot drop the CSP.
//
// Since 2026-10-22 the origin is Postern's alone, so no other estate app can
// reach the cache. The writer here is a Postern page, standing in for any
// script that gets to run on the origin. (Caddy's 404 for a refused API path
// would be a page that is not the app, but its body is empty, and Chrome
// shows its own error page instead.)

/** Open Postern once so its worker installs (and fills its cache), then close it. */
async function installWorker(context: BrowserContext): Promise<void> {
  const app = await context.newPage();
  await app.goto(APP_URL);
  await app.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => app.evaluate(async () => (await caches.keys()).some((n) => n.startsWith("postern-shell-")))).toBe(true);
  await app.close();
}

/** Open a page on Postern's origin to write to its caches from. */
async function writerPage(context: BrowserContext): Promise<Page> {
  const writer = await context.newPage();
  await writer.goto(APP_URL);
  expect(new URL(writer.url()).origin).toBe(ORIGIN);
  return writer;
}

/** From the writer page: replace every cached copy of a Postern path, in every cache on the origin. */
function poison(writer: Page, path: RegExp, body: string, headers: Record<string, string>): Promise<number> {
  return writer.evaluate(
    async ({ source, flags, body, headers }) => {
      const re = new RegExp(source, flags);
      let n = 0;
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (!re.test(new URL(request.url).pathname)) continue;
          await cache.put(request, new Response(body, { headers }));
          n++;
        }
      }
      return n;
    },
    { source: path.source, flags: path.flags, body, headers },
  );
}

const FORGED_PAGE = "<!doctype html><title>Postern</title><script>window.__POSTERN_POISONED = true</script>";
const poisoned = (p: Page) => p.evaluate(() => (window as unknown as { __POSTERN_POISONED?: boolean }).__POSTERN_POISONED).catch(() => undefined);

test("a script on the origin cannot replace what the service worker serves as Postern", async ({ context }) => {
  await installWorker(context);
  const writer = await writerPage(context);
  expect(await poison(writer, /^\/index\.html$/, FORGED_PAGE, { "content-type": "text/html" }), "cached copies replaced").toBeGreaterThan(0);

  const next = await context.newPage();
  await next.goto(APP_URL);
  await next.waitForTimeout(500);
  expect(await poisoned(next), "a replaced shell ran").toBeUndefined();
  await expect(next.locator("input[name=username]")).toBeVisible();
});

test("a cached file with the right bytes but stripped headers is served with production's headers; a forged script never runs", async ({ context }) => {
  await installWorker(context);
  const writer = await writerPage(context);
  // The genuine page with no headers at all (no CSP), and a forged app script.
  const genuine = await writer.evaluate(async () => (await fetch("/index.html")).text());
  expect(await poison(writer, /^\/index\.html$/, genuine, {})).toBeGreaterThan(0);
  expect(await poison(writer, /^\/assets\/index-[^/]+\.js$/, "window.__POSTERN_POISONED = true", { "content-type": "text/javascript" })).toBeGreaterThan(0);

  const next = await context.newPage();
  const response = await next.goto(APP_URL);
  expect(response?.fromServiceWorker(), "the page came from the worker's cache").toBe(true);
  const headers = response?.headers() ?? {};
  for (const [name, value] of Object.entries(APP_HEADERS)) expect(headers[name], name).toBe(value);
  await expect(next.locator("input[name=username]")).toBeVisible();
  expect(await poisoned(next), "a forged script ran").toBeUndefined();
});

test("offline, the installed app opens to the sign-in page from the verified cache; a forged copy never runs", async ({ context }) => {
  await installWorker(context);
  const writer = await writerPage(context);
  await context.setOffline(true);
  try {
    const offline = await context.newPage();
    const response = await offline.goto(APP_URL);
    expect(response?.fromServiceWorker(), "served by the worker").toBe(true);
    for (const [name, value] of Object.entries(APP_HEADERS)) expect(response?.headers()[name], name).toBe(value);
    await expect(offline.getByText("You're offline.", { exact: false })).toBeVisible();
    await expect(offline.locator("input[name=username]")).toBeVisible();
    await offline.close();

    // Rewritten while offline: the worker drops it, the network is down, so the page does not open at all.
    expect(await poison(writer, /^\/index\.html$/, FORGED_PAGE, { "content-type": "text/html" })).toBeGreaterThan(0);
    const next = await context.newPage();
    const failed = await next.goto(APP_URL).then(
      () => null,
      (err: Error) => err.message.split("\n")[0] ?? "error",
    );
    expect(await poisoned(next), "a replaced shell ran offline").toBeUndefined();
    expect(failed, "the forged copy is refused, and with the network down the page does not open").toMatch(/ERR_FAILED|ERR_INTERNET_DISCONNECTED/);
  } finally {
    await context.setOffline(false);
  }
});
