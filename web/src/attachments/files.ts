// Getting an attachment's bytes out of Stalwart and to the reader.
//
// Stalwart's download URL needs the Authorization header, so nothing can
// point at it directly: the bytes are fetched (client.blob.download) and
// handed on as an object URL.
//
//   saveAttachment   a download, under the attachment's real name (bidi
//                    reordering characters taken out); the blob
//                    is typed application/octet-stream so nothing renders it
//   openPdf          Chrome's PDF viewer in a new tab. A PDF in a sandboxed
//                    iframe is blocked by Chrome (checked 2026-10-20), and an
//                    unsandboxed frame would let a link in the PDF navigate a
//                    frame inside Postern (and, on a click, the whole tab) to a
//                    look-alike page. A new tab with no opener has neither
//                    problem. The bytes must start like a PDF, and the blob is
//                    typed application/pdf by Postern, never by the sender.
//   imageDataUrl     a raster image, typed by its own signature, for the
//                    sandboxed viewer frame (srcdoc; a data: URL loads there,
//                    an app blob: URL does not)

import type { DownloadParams, JmapClient } from "@postern/jmap";
import { rasterDataUrl } from "./inline";
import { isPdf, stripBidiControls } from "./kind";

/** What a download needs to know about a part. */
export interface AttachmentRef {
  blobId: string;
  name: string | null;
  type: string;
}

/** Object URLs live this long after use: long enough for the download or the new tab to read them. */
const REVOKE_AFTER_MS = 60_000;

function later(url: string): void {
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** The name to show and save under: bidi controls taken out, so it reads (and sorts, and opens) as what it really is. */
export function fileName(part: AttachmentRef): string {
  const name = stripBidiControls(part.name ?? "").trim();
  return name || "attachment";
}

/** Image previews are a base64 data: URL in a srcdoc: larger images are offered as a download instead. */
export const MAX_PREVIEW_BYTES = 20_000_000;

async function bytesOf(client: JmapClient, part: AttachmentRef, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const params: DownloadParams = { blobId: part.blobId, name: fileName(part), type: "application/octet-stream" };
  const res = await client.blob.download(params, { signal });
  return new Uint8Array(await res.arrayBuffer());
}

/** Download an attachment under its own name. Never opens it. */
export async function saveAttachment(client: JmapClient, part: AttachmentRef, signal?: AbortSignal): Promise<void> {
  const bytes = await bytesOf(client, part, signal);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName(part);
  a.rel = "noopener";
  a.click();
  later(url);
}

/** The bytes were not what the attachment claimed to be. */
export class NotPreviewableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotPreviewableError";
  }
}

/**
 * Open a PDF in Chrome's viewer in a new tab. Call it from the click itself:
 * the tab opens at once (so no popup blocker objects), with no opener, and
 * is pointed at the PDF when the download finishes.
 */
export async function openPdf(client: JmapClient, part: AttachmentRef): Promise<void> {
  const tab = window.open("about:blank", "_blank");
  if (tab) {
    tab.opener = null;
    tab.document.title = fileName(part);
    tab.document.body.textContent = `Opening ${fileName(part)}…`;
  }
  try {
    const bytes = await bytesOf(client, part);
    if (!isPdf(bytes)) throw new NotPreviewableError("This file isn't a PDF.");
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    if (tab) tab.location.replace(url);
    else window.open(url, "_blank", "noopener,noreferrer");
    later(url);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** A data: URL for a raster image attachment, typed by its signature, for the sandboxed viewer frame. */
export async function imageDataUrl(client: JmapClient, part: AttachmentRef, signal?: AbortSignal): Promise<string> {
  const bytes = await bytesOf(client, part, signal);
  if (bytes.length > MAX_PREVIEW_BYTES) throw new NotPreviewableError("This image is too large to preview. Download it instead.");
  const url = rasterDataUrl(bytes);
  if (!url) throw new NotPreviewableError("This file isn't an image Postern can show.");
  return url;
}
