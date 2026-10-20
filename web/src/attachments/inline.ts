// Inline images (cid:) for the message frame. Stalwart's downloads need
// Authorization, so an <img src> pointing at the download URL would 401; and
// a blob: URL made by the app does not load inside the opaque-origin
// sandboxed srcdoc frame (Chrome partitions blob URLs; checked 2026-10-20).
// So each raster part the HTML refers to is downloaded and inlined as a
// data: URL (the CSP draft allows img-src data:). SVG and anything that is
// not a raster image by its bytes is never inlined: it stays an attachment.
// Opening a message fetches at most MAX_INLINE_TOTAL_BYTES of them (each at
// most MAX_INLINE_IMAGE_BYTES); the rest wait for the reader's "Load images".

import { cidParts, isAbortError, normalizeCid, type DownloadParams, type EmailBodyPart, type Id } from "@postern/jmap";
import { sniffRaster } from "./kind";

/** Inline images larger than this are not fetched on open (a data: URL is held in memory twice). */
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
  /** Raster cids left for later because they passed the budget: the reader loads them on request. */
  deferred: Set<string>;
  /** Their total size in bytes. */
  deferredBytes: number;
}

/** Inline images fetched on open, at most this much per message; the rest wait for "Load images". */
export const MAX_INLINE_TOTAL_BYTES = 16_000_000;
/** No inline image larger than this, even on request: it stays an attachment to download. */
export const MAX_INLINE_ON_REQUEST_BYTES = 20_000_000;

export interface InlineBudget {
  /** Total bytes to fetch. Default MAX_INLINE_TOTAL_BYTES. */
  total?: number;
  /** Largest single image. Default MAX_INLINE_IMAGE_BYTES. */
  perImage?: number;
}

type PartSource = { attachments?: EmailBodyPart[] | null; htmlBody?: EmailBodyPart[] | null };

function rasterPart(part: EmailBodyPart | undefined): part is EmailBodyPart & { blobId: string } {
  return !!part?.blobId && part.type.toLowerCase().startsWith("image/") && !/svg/i.test(part.type);
}

/**
 * Download and inline the raster parts among `wanted` (in the order the HTML
 * refers to them) within the budget; the rest are `deferred`. Failures leave
 * that image out (its alt text shows).
 */
export async function cidPartsToInline(
  email: PartSource,
  wanted: Iterable<string>,
  fetchBlob: ((params: DownloadParams, signal: AbortSignal) => Promise<Blob>) | undefined,
  signal: AbortSignal,
  budget: InlineBudget = {},
): Promise<InlineImages> {
  const out: InlineImages = { urls: new Map(), cids: new Set(), deferred: new Set(), deferredBytes: 0 };
  if (!fetchBlob) return out;
  const total = budget.total ?? MAX_INLINE_TOTAL_BYTES;
  const perImage = budget.perImage ?? MAX_INLINE_IMAGE_BYTES;
  const parts = cidParts({ attachments: email.attachments ?? undefined, htmlBody: email.htmlBody ?? undefined });
  const chosen: [string, EmailBodyPart & { blobId: string }][] = [];
  let spent = 0;
  for (const cid of wanted) {
    const part = parts.get(cid);
    if (!rasterPart(part) || out.deferred.has(cid) || chosen.some(([c]) => c === cid)) continue;
    if (part.size > MAX_INLINE_ON_REQUEST_BYTES) continue;
    if (part.size > perImage || spent + part.size > total) {
      out.deferred.add(cid);
      out.deferredBytes += part.size;
      continue;
    }
    spent += part.size;
    chosen.push([cid, part]);
  }
  await Promise.all(
    chosen.map(async ([cid, part]) => {
      try {
        const blob = await fetchBlob({ blobId: part.blobId as Id, name: part.name ?? cid, type: part.type }, signal);
        const url = rasterDataUrl(new Uint8Array(await blob.arrayBuffer()));
        if (url) {
          out.urls.set(cid, url);
          out.cids.add(cid);
        }
      } catch (err) {
        if (!isAbortError(err)) console.warn("Inline image not loaded", err);
      }
    }),
  );
  return out;
}
