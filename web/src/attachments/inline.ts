// Inline images (cid:) for the message frame. Stalwart's downloads need
// Authorization, so an <img src> pointing at the download URL would 401; and
// a blob: URL made by the app does not load inside the opaque-origin
// sandboxed srcdoc frame (Chrome partitions blob URLs; checked 2026-10-20).
// So each raster part the HTML refers to is downloaded and inlined as a
// data: URL (the CSP draft allows img-src data:). SVG and anything that is
// not a raster image by its bytes is never inlined: it stays an attachment.

import { cidParts, isAbortError, normalizeCid, type DownloadParams, type EmailBodyPart, type Id } from "@postern/jmap";
import { sniffRaster } from "./kind";

/** Inline images larger than this stay attachments (a data: URL is held in memory twice). */
export const MAX_INLINE_IMAGE_BYTES = 8_000_000;

/** Every cid the HTML refers to (src, background, CSS url()), bare. */
export function findCids(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/cid:([^\s"'()<>\\]+)/gi)) out.add(normalizeCid(`cid:${m[1] as string}`));
  return out;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** A data: URL for raster image bytes, typed by their signature, or null if they are not a raster image. */
export function rasterDataUrl(bytes: Uint8Array): string | null {
  const type = sniffRaster(bytes);
  return type ? `data:${type};base64,${base64(bytes)}` : null;
}

export interface InlineImages {
  /** Bare cid → data: URL. */
  urls: Map<string, string>;
  /** The cids shown inline: their parts are left off the attachment chips. */
  cids: Set<string>;
}

type PartSource = { attachments?: EmailBodyPart[] | null; htmlBody?: EmailBodyPart[] | null };

/** Download and inline the raster parts among `wanted`. Failures leave that image out (its alt text shows). */
export async function cidPartsToInline(
  email: PartSource,
  wanted: ReadonlySet<string>,
  fetchBlob: ((params: DownloadParams, signal: AbortSignal) => Promise<Blob>) | undefined,
  signal: AbortSignal,
): Promise<InlineImages> {
  const urls = new Map<string, string>();
  const cids = new Set<string>();
  if (!fetchBlob || wanted.size === 0) return { urls, cids };
  const parts = cidParts({ attachments: email.attachments ?? undefined, htmlBody: email.htmlBody ?? undefined });
  await Promise.all(
    [...wanted].map(async (cid) => {
      const part = parts.get(cid);
      if (!part?.blobId || !part.type.toLowerCase().startsWith("image/") || /svg/i.test(part.type)) return;
      if (part.size > MAX_INLINE_IMAGE_BYTES) return;
      try {
        const blob = await fetchBlob({ blobId: part.blobId as Id, name: part.name ?? cid, type: part.type }, signal);
        const url = rasterDataUrl(new Uint8Array(await blob.arrayBuffer()));
        if (url) {
          urls.set(cid, url);
          cids.add(cid);
        }
      } catch (err) {
        if (!isAbortError(err)) console.warn("Inline image not loaded", err);
      }
    }),
  );
  return { urls, cids };
}
