import { describe, expect, it, vi } from "vitest";
import {
  JmapClient,
  JmapLimitError,
  JmapRequestError,
  JmapUnauthorizedError,
  cidDownloads,
  cidParts,
  normalizeCid,
  resolveCid,
  type Email,
  type UploadProgress,
  type UploadTransport,
} from "../../src/index.js";
import { BASE, fixture, json, problem, SESSION, setup, FakeServer } from "./helpers.js";

/** Recorded from Stalwart: "Photos from the offsite", two inline images by cid and one attachment. */
const EMAIL = fixture<Pick<Email, "bodyStructure" | "attachments" | "htmlBody" | "bodyValues">>("email-with-cid.json");

const UPLOADED = { accountId: "b", blobId: "Gblob1", type: "text/plain", size: 5 };

describe("upload", () => {
  it("POSTs to the rebased upload URL with Content-Type and Authorization, reporting 0 → 100%", async () => {
    const { server, client } = setup();
    server.always("POST /jmap/upload/b/", () => json(UPLOADED));
    const progress: UploadProgress[] = [];
    const res = await client.blob.upload("hello", { type: "text/plain", onProgress: (p) => progress.push(p) });
    expect(res).toEqual(UPLOADED);
    const req = server.requests.find((r) => r.method === "POST");
    expect(req?.url).toBe(`${BASE}/jmap/upload/b/`);
    expect(req?.headers["content-type"]).toBe("text/plain");
    expect(req?.headers["authorization"]).toBe("Basic dGVzdDp0ZXN0");
    expect(progress).toEqual([
      { loaded: 0, total: 5 },
      { loaded: 5, total: 5 },
    ]);
  });

  it("uploads binary bodies and counts their bytes", async () => {
    const { server, client } = setup();
    server.always("POST /jmap/upload/b/", () => json({ ...UPLOADED, size: 4 }));
    const progress: UploadProgress[] = [];
    await client.blob.upload(new Uint8Array([1, 2, 3, 4]), { type: "application/octet-stream", onProgress: (p) => progress.push(p) });
    await client.blob.upload(new Blob(["ab"]), { type: "text/plain", onProgress: (p) => progress.push(p) });
    expect(progress.map((p) => p.total)).toEqual([4, 4, 2, 2]);
  });

  it("uses an injected transport (the web app's XHR one) and still runs the 401 hook", async () => {
    const { client: base } = setup();
    await base.connect();
    const calls: string[] = [];
    const transport: UploadTransport = {
      send: vi.fn(async (req) => {
        calls.push(req.authorization);
        req.onProgress?.({ loaded: 3, total: 5 });
        if (calls.length === 1) return { status: 401, body: "", contentType: null };
        return { status: 201, body: JSON.stringify(UPLOADED), contentType: "application/json" };
      }),
    };
    let token = "Bearer a";
    const server = new FakeServer();
    server.always("GET /jmap/session", () => json(SESSION));
    const client = new JmapClient({
      baseUrl: BASE,
      fetch: server.fetch,
      uploadTransport: transport,
      auth: {
        authorization: () => token,
        onUnauthorized: () => {
          token = "Bearer b";
          return true;
        },
      },
    });
    const progress: UploadProgress[] = [];
    const res = await client.blob.upload("hello", { type: "text/plain", onProgress: (p) => progress.push(p) });
    expect(res.blobId).toBe("Gblob1");
    expect(calls).toEqual(["Bearer a", "Bearer b"]);
    expect(progress).toEqual([
      { loaded: 3, total: 5 },
      { loaded: 3, total: 5 },
    ]);
  });

  it("maps upload errors", async () => {
    const { server, client } = setup();
    server.once("POST /jmap/upload/b/", () => problem(401, { type: "about:blank", status: 401 }));
    server.once("POST /jmap/upload/b/", () => problem(400, { type: "urn:ietf:params:jmap:error:limit", limit: "maxSizeUpload" }));
    await expect(client.blob.upload("x", { type: "text/plain" })).rejects.toBeInstanceOf(JmapUnauthorizedError);
    await expect(client.blob.upload("x", { type: "text/plain" })).rejects.toBeInstanceOf(JmapRequestError);
  });

  it("refuses a body over maxSizeUpload before sending it", async () => {
    const { server, client } = setup({ session: { ...SESSION, capabilities: { ...SESSION.capabilities, "urn:ietf:params:jmap:core": { maxSizeUpload: 3 } } } });
    await expect(client.blob.upload("toolong", { type: "text/plain" })).rejects.toBeInstanceOf(JmapLimitError);
    expect(server.requests.filter((r) => r.method === "POST")).toHaveLength(0);
  });
});

describe("download", () => {
  it("builds the URL from the template with name and type", async () => {
    const { client } = setup();
    await client.connect();
    expect(client.blob.downloadUrl({ blobId: "Gx", name: "INV 0142.pdf", type: "application/pdf" })).toBe(
      `${BASE}/jmap/download/b/Gx/INV%200142.pdf?accept=application%2Fpdf`,
    );
  });

  it("fetches with Authorization", async () => {
    const { server, client } = setup();
    server.always("GET /jmap/download/b/Gx/a.txt", () => new Response("hi", { headers: { "content-type": "text/plain" } }));
    const res = await client.blob.download({ blobId: "Gx", name: "a.txt", type: "text/plain" });
    expect(await res.text()).toBe("hi");
    expect(server.requests.at(-1)?.headers["authorization"]).toBe("Basic dGVzdDp0ZXN0");
  });
});

describe("cid: resolution", () => {
  it("normalises cids from headers and from URLs", () => {
    expect(normalizeCid("<offsite-1@postern.test>")).toBe("offsite-1@postern.test");
    expect(normalizeCid("cid:offsite-1%40postern.test")).toBe("offsite-1@postern.test");
    expect(normalizeCid("CID:offsite-1@postern.test")).toBe("offsite-1@postern.test");
    expect(normalizeCid("cid:%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("finds the inline parts of a recorded message, not its plain attachment", () => {
    const parts = cidParts(EMAIL);
    expect([...parts.keys()]).toEqual(["offsite-1@postern.test", "offsite-2@postern.test"]);
    expect(parts.get("offsite-1@postern.test")?.name).toBe("lake.png");
  });

  it("maps each cid in the HTML to download parameters and URLs", async () => {
    const html = Object.values(EMAIL.bodyValues)[0]?.value ?? "";
    const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(srcs).toEqual(["cid:offsite-1@postern.test", "cid:offsite-2@postern.test"]);
    for (const src of srcs) expect(resolveCid(EMAIL, src)).toMatchObject({ type: "image/png" });
    expect(resolveCid(EMAIL, "cid:missing@x")).toBeUndefined();

    const downloads = cidDownloads(EMAIL);
    expect(downloads.get("offsite-2@postern.test")).toEqual({
      blobId: EMAIL.attachments.find((a) => a.cid === "offsite-2@postern.test")?.blobId,
      name: "boathouse.png",
      type: "image/png",
    });

    const { client } = setup();
    await client.connect();
    const urls = client.blob.cidUrls(EMAIL);
    expect(urls.get("offsite-1@postern.test")).toMatch(new RegExp(`^${BASE}/jmap/download/b/[^/]+/lake\\.png\\?accept=image%2Fpng$`));
  });

  it("works from attachments alone", () => {
    expect(cidParts({ attachments: EMAIL.attachments }).size).toBe(2);
  });
});
