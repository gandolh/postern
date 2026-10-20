// The shell cache against a fake CacheStorage (finding F1): a cached file is
// served only when its bytes hash to the build's value, the response is
// rebuilt with production's headers, and a forged or missing entry goes to
// the network and is never served.

import { describe, expect, it } from "vitest";
import { APP_HEADERS } from "./headers";
import { buildResponse, cacheNameFor, cleanupCaches, contentTypeFor, installShell, integrityOf, pick, readVerified, serve, shellFiles, type ShellDeps } from "./shell";

const SCOPE = "https://estate.example/webmail/";
const enc = new TextEncoder();

const INDEX = '<!doctype html><title>Postern</title><script type="module" src="/webmail/assets/index-a.js"></script>';
const APP_JS = "console.log('postern')";
const FORGED = "<!doctype html><title>Postern</title><script>window.__POSTERN_POISONED = true</script>";

const bytes = (text: string) => enc.encode(text).buffer as ArrayBuffer;

class FakeCache {
  readonly entries = new Map<string, Response>();
  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(String(request instanceof Request ? request.url : request))?.clone();
  }
  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(String(request instanceof Request ? request.url : request), response);
  }
  async delete(request: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(String(request instanceof Request ? request.url : request));
  }
}

class FakeCaches {
  readonly byName = new Map<string, FakeCache>();
  async open(name: string): Promise<Cache> {
    if (!this.byName.has(name)) this.byName.set(name, new FakeCache());
    return this.byName.get(name) as unknown as Cache;
  }
  async keys(): Promise<string[]> {
    return [...this.byName.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.byName.delete(name);
  }
}

/** The server: what `fetch` answers, and what it was asked. */
function server(files: Record<string, string>, online = true) {
  const asked: string[] = [];
  const fetch = async (input: Request | string): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.url);
    asked.push(url.pathname);
    if (!online) throw new TypeError("Failed to fetch");
    const key = typeof input !== "string" && input.mode === "navigate" ? "/webmail/index.html" : url.pathname;
    const body = files[key];
    // Node's Response has type "default"; the worker sees "basic" for its own origin.
    const response = body === undefined ? new Response("not found", { status: 404 }) : new Response(body, { headers: { "content-type": "text/plain", "x-from": "network" } });
    Object.defineProperty(response, "type", { value: "basic" });
    return response;
  };
  return { fetch, asked };
}

async function setup(online = true) {
  const manifest = [
    { url: "index.html", revision: "1", integrity: await integrityOf(bytes(INDEX)) },
    { url: "assets/index-a.js", revision: null, integrity: await integrityOf(bytes(APP_JS)) },
    { url: "manifest.webmanifest", revision: "2" }, // the plugin's own entry: no hash, never served from the cache
    { url: "notes.txt", revision: "3", integrity: await integrityOf(bytes("x")) }, // a type the worker does not serve
    { url: "/webmail-api/jmap/session", revision: "4", integrity: await integrityOf(bytes("{}")) }, // never, whatever the list says
    { url: "https://cdn.example/x.js", revision: "5", integrity: await integrityOf(bytes("x")) },
  ];
  const files = shellFiles(manifest, SCOPE);
  const caches = new FakeCaches();
  const net = server({ "/webmail/index.html": INDEX, "/webmail/assets/index-a.js": APP_JS }, online);
  const deps: ShellDeps = { caches, fetch: net.fetch, scopeUrl: SCOPE };
  const name = cacheNameFor(files);
  return { files, caches, net, deps, name };
}

const navigation = (url: string) => {
  const request = new Request(url);
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
};

describe("the build's list", () => {
  it("keeps only hashed files of a known type inside the scope", async () => {
    const { files } = await setup();
    expect([...files.keys()]).toEqual(["/webmail/index.html", "/webmail/assets/index-a.js"]);
    expect(files.get("/webmail/index.html")?.contentType).toBe("text/html; charset=utf-8");
    expect(files.get("/webmail/assets/index-a.js")?.contentType).toBe("text/javascript; charset=utf-8");
  });

  it("knows the type of every file the build precaches", () => {
    for (const path of ["a.html", "a.js", "a.css", "a.png", "a.svg", "a.woff2", "manifest.webmanifest"]) expect(contentTypeFor(path), path).not.toBeNull();
    expect(contentTypeFor("a.txt")).toBeNull();
  });

  it("names the cache after the build", async () => {
    const { files, name } = await setup();
    expect(name).toMatch(/^postern-shell-[0-9a-f]{8}$/);
    const other = new Map(files);
    other.set("/webmail/index.html", { ...files.get("/webmail/index.html")!, integrity: "sha256-AAAA" });
    expect(cacheNameFor(other)).not.toBe(name);
  });
});

describe("pick", () => {
  it("answers navigations inside the scope with index.html, and listed files by path", async () => {
    const { files } = await setup();
    expect(pick(navigation(`${SCOPE}#inbox/T1`), files, SCOPE)?.pathname).toBe("/webmail/index.html");
    expect(pick(navigation(`${SCOPE}settings`), files, SCOPE)?.pathname).toBe("/webmail/index.html");
    expect(pick(new Request(`${SCOPE}assets/index-a.js`), files, SCOPE)?.pathname).toBe("/webmail/assets/index-a.js");
  });

  it("leaves everything else to the network", async () => {
    const { files } = await setup();
    expect(pick(new Request("https://estate.example/webmail-api/jmap/session"), files, SCOPE)).toBeNull();
    expect(pick(navigation("https://estate.example/webmail-api/jmap/"), files, SCOPE)).toBeNull();
    expect(pick(navigation("https://estate.example/atrium/"), files, SCOPE)).toBeNull();
    expect(pick(new Request(`${SCOPE}manifest.webmanifest`), files, SCOPE)).toBeNull();
    expect(pick(new Request(`${SCOPE}assets/other.js`), files, SCOPE)).toBeNull();
    expect(pick(new Request(`${SCOPE}assets/index-a.js`, { method: "POST", body: "x" }), files, SCOPE)).toBeNull();
  });
});

describe("install", () => {
  it("stores each file whose bytes are the build's", async () => {
    const { files, caches, deps, name } = await setup();
    expect(await installShell(files, name, deps)).toEqual({ stored: ["/webmail/assets/index-a.js", "/webmail/index.html"], skipped: [] });
    expect(caches.byName.get(name)?.entries.size).toBe(2);
  });

  it("skips, without failing, a file the server serves differently (a newer deploy)", async () => {
    const { files, caches, name } = await setup();
    const net = server({ "/webmail/index.html": "<!doctype html>newer", "/webmail/assets/index-a.js": APP_JS });
    expect(await installShell(files, name, { caches, fetch: net.fetch, scopeUrl: SCOPE })).toEqual({ stored: ["/webmail/assets/index-a.js"], skipped: ["/webmail/index.html"] });
  });
});

describe("serving from the cache", () => {
  it("serves a verified file with production's headers, never the cached ones", async () => {
    const { files, caches, deps, name, net } = await setup();
    await installShell(files, name, deps);
    // Strip the stored entry's headers: the right bytes, no CSP.
    await (await caches.open(name)).put(`${SCOPE}index.html`, new Response(INDEX));
    net.asked.length = 0;
    const response = await serve(files.get("/webmail/index.html")!, navigation(`${SCOPE}#inbox`), name, deps);
    expect(await response.text()).toBe(INDEX);
    for (const [header, value] of Object.entries(APP_HEADERS)) expect(response.headers.get(header), header).toBe(value);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(net.asked).toEqual([]);
  });

  it("never serves a forged entry: it is dropped and the network answers", async () => {
    const { files, caches, deps, name, net } = await setup();
    await installShell(files, name, deps);
    const cache = await caches.open(name);
    await cache.put(`${SCOPE}index.html`, new Response(FORGED, { headers: { "content-type": "text/html" } }));
    net.asked.length = 0;
    const response = await serve(files.get("/webmail/index.html")!, navigation(`${SCOPE}`), name, deps);
    expect(await response.text()).toBe(INDEX);
    expect(response.headers.get("x-from")).toBe("network");
    expect(net.asked).toEqual(["/webmail/"]);
  });

  it("refills the cache from the network, but only with the build's bytes", async () => {
    const { files, caches, deps, name } = await setup();
    const work: Promise<unknown>[] = [];
    await serve(files.get("/webmail/assets/index-a.js")!, new Request(`${SCOPE}assets/index-a.js`), name, deps, (p) => work.push(p));
    await Promise.all(work);
    expect(await (await caches.open(name)).match(`${SCOPE}assets/index-a.js`).then((r) => r?.text())).toBe(APP_JS);

    const wrong = server({ "/webmail/index.html": FORGED });
    const work2: Promise<unknown>[] = [];
    await serve(files.get("/webmail/index.html")!, navigation(SCOPE), name, { ...deps, fetch: wrong.fetch }, (p) => work2.push(p));
    await Promise.all(work2);
    expect(await (await caches.open(name)).match(`${SCOPE}index.html`)).toBeUndefined();
  });

  it("offline: serves the verified shell; with a forged or missing one, a network error, never the forgery", async () => {
    const online = await setup();
    await installShell(online.files, online.name, online.deps);
    const offline = server({}, false);
    const deps = { ...online.deps, fetch: offline.fetch };
    const good = await serve(online.files.get("/webmail/index.html")!, navigation(SCOPE), online.name, deps);
    expect(good.status).toBe(200);
    expect(await good.text()).toBe(INDEX);

    await (await online.caches.open(online.name)).put(`${SCOPE}index.html`, new Response(FORGED));
    const forged = await serve(online.files.get("/webmail/index.html")!, navigation(SCOPE), online.name, deps);
    expect(forged.type).toBe("error");
    expect(await (await online.caches.open(online.name)).match(`${SCOPE}index.html`)).toBeUndefined();
  });

  it("checks the bytes it serves, whatever the cache holds under another name", async () => {
    const { files, caches, deps, name } = await setup();
    // A script on the origin writes a lookalike cache: the worker never reads it.
    await (await caches.open("postern-shell-00000000")).put(`${SCOPE}index.html`, new Response(FORGED));
    expect(await readVerified(files.get("/webmail/index.html")!, name, deps)).toBeNull();
  });
});

describe("cleanup", () => {
  it("deletes only this worker's old caches and brief 16's workbox cache", async () => {
    const { caches, deps, name } = await setup();
    for (const n of [name, "postern-shell-deadbeef", `workbox-precache-v2-${SCOPE}`, "workbox-precache-v2-https://estate.example/satchel/", "atrium-cache"]) await caches.open(n);
    expect((await cleanupCaches(name, deps)).sort()).toEqual(["postern-shell-deadbeef", `workbox-precache-v2-${SCOPE}`]);
    expect((await caches.keys()).sort()).toEqual(["atrium-cache", name, "workbox-precache-v2-https://estate.example/satchel/"].sort());
  });
});

describe("buildResponse", () => {
  it("is a fresh 200 with the file's type and every production header", async () => {
    const { files } = await setup();
    const r = buildResponse(files.get("/webmail/assets/index-a.js")!, bytes(APP_JS));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(Object.keys(APP_HEADERS).every((h) => r.headers.get(h) === APP_HEADERS[h])).toBe(true);
  });
});
