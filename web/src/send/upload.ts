// Uploading attachments with real progress. fetch() cannot report upload
// progress, so this is an XMLHttpRequest `UploadTransport` (brief 03's seam),
// and `uploadFile` drives it the way `client.blob.upload` does: within the
// session's size limit, Authorization per attempt (never kept), one retry
// after a 401 when the auth provider has refreshed.
//
//   const { blobId } = await uploadFile(client, file, { onProgress: (p) => ... , signal });
//
// The app's JmapClient is built by the sign-in code (web/src/auth) without a
// transport; passing `uploadTransport: xhrUploadTransport()` there would let
// `client.blob.upload` report progress too. Until then the composer uploads
// through here.

import {
  JmapHttpError,
  JmapLimitError,
  JmapNetworkError,
  JmapProtocolError,
  JmapUnauthorizedError,
  bodySize,
  type Id,
  type JmapClient,
  type UploadProgress,
  type UploadRequest,
  type UploadResult,
  type UploadTransport,
} from "@postern/jmap";

/** An UploadTransport over XMLHttpRequest, for upload progress events. */
export function xhrUploadTransport(createXhr: () => XMLHttpRequest = () => new XMLHttpRequest()): UploadTransport {
  return {
    send(req: UploadRequest): Promise<UploadResult> {
      return new Promise<UploadResult>((resolve, reject) => {
        const total = bodySize(req.body);
        const xhr = createXhr();
        const abort = () => xhr.abort();
        const done = () => req.signal?.removeEventListener("abort", abort);
        if (req.signal?.aborted) {
          reject(new DOMException("The upload was cancelled.", "AbortError"));
          return;
        }
        xhr.open("POST", req.url);
        xhr.setRequestHeader("Authorization", req.authorization);
        xhr.setRequestHeader("Content-Type", req.contentType);
        xhr.responseType = "text";
        xhr.upload.onprogress = (event) => req.onProgress?.({ loaded: event.loaded, total: event.lengthComputable ? event.total : total });
        xhr.onload = () => {
          done();
          if (xhr.status >= 200 && xhr.status < 300) req.onProgress?.({ loaded: total, total });
          resolve({ status: xhr.status, statusText: xhr.statusText, body: xhr.responseText, contentType: xhr.getResponseHeader("content-type") });
        };
        xhr.onerror = () => {
          done();
          reject(new JmapNetworkError("The upload could not reach the mail server."));
        };
        xhr.ontimeout = xhr.onerror;
        xhr.onabort = () => {
          done();
          reject(new DOMException("The upload was cancelled.", "AbortError"));
        };
        req.signal?.addEventListener("abort", abort, { once: true });
        req.onProgress?.({ loaded: 0, total });
        xhr.send(req.body as XMLHttpRequestBodyInit);
      });
    },
  };
}

export interface UploadFileOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  /** Defaults to the XHR transport. Tests pass their own. */
  transport?: UploadTransport;
}

export interface UploadedBlob {
  blobId: Id;
  type: string;
  size: number;
}

/** Upload one file to the mail account's blob store. @throws JmapLimitError when it is over the server's limit. */
export async function uploadFile(client: JmapClient, file: Blob, options: UploadFileOptions = {}): Promise<UploadedBlob> {
  const session = await client.ensureSession(options.signal);
  const limit = session.limits.maxSizeUpload;
  if (file.size > limit) throw new JmapLimitError("maxSizeUpload", `The file is ${file.size} bytes; the server takes up to ${limit}.`);
  const transport = options.transport ?? xhrUploadTransport();
  const type = file.type || "application/octet-stream";
  const attempt = async () =>
    transport.send({
      url: session.uploadUrlFor(),
      body: file,
      contentType: type,
      authorization: await client.auth.authorization(),
      signal: options.signal,
      onProgress: options.onProgress,
    });
  let result = await attempt();
  if (result.status === 401 && client.auth.onUnauthorized && (await client.auth.onUnauthorized())) result = await attempt();
  if (result.status === 401) throw new JmapUnauthorizedError();
  if (result.status < 200 || result.status > 299) {
    throw new JmapHttpError(result.status, result.status === 413 ? "The file is too large for the mail server." : `Upload failed (${result.status} ${result.statusText ?? ""})`.trim());
  }
  let parsed: { blobId?: unknown; type?: unknown; size?: unknown };
  try {
    parsed = JSON.parse(result.body) as typeof parsed;
  } catch {
    throw new JmapProtocolError("The upload answer is not JSON");
  }
  if (typeof parsed.blobId !== "string") throw new JmapProtocolError("The upload answer has no blobId");
  return { blobId: parsed.blobId, type: typeof parsed.type === "string" ? parsed.type : type, size: typeof parsed.size === "number" ? parsed.size : file.size };
}
