// Blobs (RFC 8620 §6): upload with progress, download, and `cid:` resolution.
//
// Stalwart's download endpoint needs the Authorization header (a bare
// `<img src>` gets 401), always answers `Content-Disposition: attachment;
// filename="<name>"`, and uses the `{type}` variable (its `?accept=` query)
// only as the response Content-Type. To show an inline image, `download()` it
// and make an object URL.

import { JmapLimitError, JmapProtocolError } from "./errors.js";
import { assertOk, authorizedFetch, httpError, safeFetch, withAuthRetry, type AuthProvider, type FetchLike } from "./http.js";
import type { Limiter } from "./limiter.js";
import type { DownloadParams, Session } from "./session.js";
import type { Id, UploadResponse } from "./types/core.js";
import type { Email, EmailBodyPart } from "./types/mail.js";

/** What can be uploaded. Typed arrays must be over a plain ArrayBuffer (fetch and XHR both refuse SharedArrayBuffer). */
export type UploadBody = Blob | ArrayBuffer | Uint8Array<ArrayBuffer> | string;

export interface UploadProgress {
  /** Bytes sent so far. */
  loaded: number;
  /** Bytes in total. */
  total: number;
}

/** One upload, as handed to a transport. */
export interface UploadRequest {
  url: string;
  body: UploadBody;
  contentType: string;
  /** The Authorization header value for this attempt. Do not keep it. */
  authorization: string;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}

/** A transport's answer: the raw status and body. The client maps errors and runs the 401 hook. */
export interface UploadResult {
  status: number;
  statusText?: string;
  body: string;
  contentType: string | null;
}

/**
 * Sends an upload. The default uses `fetch`, which cannot report upload
 * progress, so it reports 0% then 100%. The web app can pass an
 * XMLHttpRequest-based one for real progress.
 */
export interface UploadTransport {
  send(request: UploadRequest): Promise<UploadResult>;
}

/** The size of an upload body in bytes. */
export function bodySize(body: UploadBody): number {
  if (typeof body === "string") return new TextEncoder().encode(body).byteLength;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body.byteLength;
  return body.size;
}

/** The default transport: one fetch, progress 0 → 100%. */
export function fetchUploadTransport(fetchImpl: FetchLike): UploadTransport {
  return {
    async send(req) {
      const total = bodySize(req.body);
      req.onProgress?.({ loaded: 0, total });
      const res = await safeFetch(fetchImpl, req.url, {
        method: "POST",
        headers: { authorization: req.authorization, "content-type": req.contentType },
        body: req.body as RequestInit["body"],
        signal: req.signal,
      });
      const text = await res.text();
      if (res.ok) req.onProgress?.({ loaded: total, total });
      return { status: res.status, statusText: res.statusText, body: text, contentType: res.headers.get("content-type") };
    },
  };
}

export interface UploadOptions {
  /** The blob's media type, sent as Content-Type. */
  type: string;
  /** Defaults to the mail account. */
  accountId?: Id;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}

/** What BlobMethods needs from the client. */
export interface BlobDeps {
  ensureSession(signal?: AbortSignal): Promise<Session>;
  currentSession(): Session;
  auth: AuthProvider;
  fetch: FetchLike;
  transport: UploadTransport;
  uploads: Limiter;
}

/** Upload and download. */
export class BlobMethods {
  readonly #d: BlobDeps;
  constructor(deps: BlobDeps) {
    this.#d = deps;
  }

  /**
   * Upload a blob. Stays within `maxConcurrentUpload`, refuses bodies over
   * `maxSizeUpload`, and runs the 401 hook like any request.
   */
  async upload(body: UploadBody, options: UploadOptions): Promise<UploadResponse> {
    const session = await this.#d.ensureSession(options.signal);
    const size = bodySize(body);
    if (size > session.limits.maxSizeUpload) {
      throw new JmapLimitError("maxSizeUpload", `Upload of ${size} bytes is over the server's ${session.limits.maxSizeUpload}`);
    }
    const url = session.uploadUrlFor(options.accountId);
    const result = await this.#d.uploads.run(() =>
      withAuthRetry(this.#d.auth, (authorization) =>
        this.#d.transport.send({
          url,
          body,
          contentType: options.type,
          authorization,
          signal: options.signal,
          onProgress: options.onProgress,
        }),
      ),
    );
    if (result.status < 200 || result.status > 299) {
      throw httpError(result.status, result.statusText ?? "", result.body, result.contentType);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.body);
    } catch {
      throw new JmapProtocolError("Upload response is not JSON");
    }
    if (!parsed || typeof (parsed as UploadResponse).blobId !== "string") throw new JmapProtocolError("Upload response has no blobId");
    return parsed as UploadResponse;
  }

  /** The download URL for a blob (needs a loaded session). Fetch it with `download()`; it needs Authorization. */
  downloadUrl(params: DownloadParams): string {
    return this.#d.currentSession().downloadUrlFor(params);
  }

  /** Download a blob with Authorization. Turn it into an object URL or save it. @throws JmapHttpError on 404 etc. */
  async download(params: DownloadParams, options: { signal?: AbortSignal } = {}): Promise<Response> {
    const session = await this.#d.ensureSession(options.signal);
    const res = await authorizedFetch(this.#d.fetch, this.#d.auth, session.downloadUrlFor(params), { signal: options.signal });
    return assertOk(res);
  }

  /** `cid` → download URL for every part of a message that has a Content-ID. */
  cidUrls(email: CidSource): Map<string, string> {
    const session = this.#d.currentSession();
    const out = new Map<string, string>();
    for (const [cid, params] of cidDownloads(email)) out.set(cid, session.downloadUrlFor(params));
    return out;
  }
}

// ---- cid: resolution -------------------------------------------------------

/** The parts of an Email the cid helpers read. Fetch `bodyStructure` (best) or `attachments`. */
export type CidSource = Partial<Pick<Email, "bodyStructure" | "attachments" | "htmlBody">>;

/**
 * The bare Content-ID: `<a@b>` → `a@b`, `cid:a%40b` → `a@b`. Compare cids
 * through this; HTML uses the URL form, MIME headers the bracketed one.
 */
export function normalizeCid(value: string): string {
  let v = value.trim();
  if (/^cid:/i.test(v)) {
    v = v.slice(4);
    try {
      v = decodeURIComponent(v);
    } catch {
      // Leave malformed escapes as they are.
    }
  }
  if (v.startsWith("<") && v.endsWith(">")) v = v.slice(1, -1);
  return v;
}

function walk(part: EmailBodyPart | null | undefined, visit: (p: EmailBodyPart) => void): void {
  if (!part) return;
  visit(part);
  for (const sub of part.subParts ?? []) walk(sub, visit);
}

/** Every part with a Content-ID and a blob, keyed by bare cid. The first part wins on duplicates. */
export function cidParts(email: CidSource): Map<string, EmailBodyPart> {
  const out = new Map<string, EmailBodyPart>();
  const add = (p: EmailBodyPart): void => {
    if (!p.cid || !p.blobId) return;
    const cid = normalizeCid(p.cid);
    if (!out.has(cid)) out.set(cid, p);
  };
  walk(email.bodyStructure, add);
  for (const p of email.attachments ?? []) add(p);
  for (const p of email.htmlBody ?? []) add(p);
  return out;
}

/** `cid` → download parameters (blobId, name, type), for `download()` or `downloadUrl()`. */
export function cidDownloads(email: CidSource): Map<string, DownloadParams> {
  const out = new Map<string, DownloadParams>();
  for (const [cid, part] of cidParts(email)) {
    out.set(cid, { blobId: part.blobId as Id, name: part.name ?? cid, type: part.type });
  }
  return out;
}

/** Look up one `cid:` URL (as found in HTML) in a message. */
export function resolveCid(email: CidSource, url: string): DownloadParams | undefined {
  return cidDownloads(email).get(normalizeCid(url));
}
