// Which URLs a message may keep, and in what form. Pure.
//
// Every URL is parsed with `new URL(raw)` and no base, so the browser's own
// parser normalises the tricks (`java\tscript:`, `  javascript:`, `DATA:`,
// entity-decoded schemes): what comes back is the scheme the browser would
// really use. Relative URLs are dropped: inside a srcdoc frame they resolve
// against Postern's own address.

import { normalizeCid } from "@postern/jmap";

/** Schemes a link may keep. Anything else (javascript:, data:, vbscript:, file:, tel:...) loses its href. */
const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Raster images only: an SVG is a document and never goes into a message frame. */
export const RASTER_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp"] as const;

const RASTER_DATA_URL = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]*$/i;

/** A link target the message may keep (normalised), or null to drop the href. `#fragment` stays as it is. */
export function safeLinkUrl(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  if (/^#[^\s]*$/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return LINK_PROTOCOLS.has(url.protocol) ? url.href : null;
}

/** Where an image URL stands. */
export type ImageUrlDecision =
  /** Keep it, as this URL. */
  | { kind: "keep"; url: string }
  /** A remote image, blocked until the reader asks for it. */
  | { kind: "blocked" }
  /** Never: relative, unknown scheme, a non-raster data: URL, an unresolved cid:. */
  | { kind: "drop" };

export interface ImageUrlContext {
  /** Load remote (https) images. False until "Display images". */
  allowRemote: boolean;
  /** Bare Content-ID → data: URL, for the message's own inline images. */
  cidUrls?: ReadonlyMap<string, string>;
}

/**
 * What to do with a URL the message would fetch as an image (img src,
 * srcset, background, CSS url()). Remote URLs are upgraded to https: the
 * production CSP allows `img-src https:` only.
 */
export function imageUrl(raw: string, ctx: ImageUrlContext): ImageUrlDecision {
  const value = raw.trim();
  if (value === "") return { kind: "drop" };
  if (/^cid:/i.test(value)) {
    const url = ctx.cidUrls?.get(normalizeCid(value));
    return url ? { kind: "keep", url } : { kind: "drop" };
  }
  if (/^data:/i.test(value)) return RASTER_DATA_URL.test(value) ? { kind: "keep", url: value } : { kind: "drop" };
  let url: URL;
  try {
    url = new URL(value.startsWith("//") ? `https:${value}` : value);
  } catch {
    return { kind: "drop" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "drop" };
  if (!ctx.allowRemote) return { kind: "blocked" };
  url.protocol = "https:";
  return { kind: "keep", url: url.href };
}

/** One candidate of a srcset: its URL and descriptor ("2x", "480w", or ""). */
export interface SrcsetCandidate {
  url: string;
  descriptor: string;
}

/** Parse a srcset the way the HTML spec does: URLs may contain commas (data:), descriptors end at a comma. */
export function parseSrcset(value: string): SrcsetCandidate[] {
  const out: SrcsetCandidate[] = [];
  let i = 0;
  const n = value.length;
  const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);
  while (i < n) {
    while (i < n && (isSpace(value[i]) || value[i] === ",")) i++;
    if (i >= n) break;
    let url = "";
    while (i < n && !isSpace(value[i])) url += value[i++];
    let descriptor = "";
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      let depth = 0;
      while (i < n) {
        const c = value[i] as string;
        if (c === "(") depth++;
        else if (c === ")") depth = Math.max(0, depth - 1);
        else if (c === "," && depth === 0) break;
        descriptor += c;
        i++;
      }
      descriptor = descriptor.trim();
    }
    if (url) out.push({ url, descriptor });
  }
  return out;
}

/** A srcset with each candidate run through imageUrl(); blocked ones are counted and left out. */
export function rewriteSrcset(value: string, ctx: ImageUrlContext, onBlocked: () => void): string | null {
  const kept: string[] = [];
  for (const candidate of parseSrcset(value)) {
    const decision = imageUrl(candidate.url, ctx);
    if (decision.kind === "blocked") onBlocked();
    // A data: URL is fine in src but awkward in srcset (its commas); srcset keeps https only.
    if (decision.kind === "keep" && /^https:/i.test(decision.url)) {
      kept.push(candidate.descriptor ? `${decision.url} ${candidate.descriptor}` : decision.url);
    }
  }
  return kept.length > 0 ? kept.join(", ") : null;
}

/** The host a link really goes to (punycode, as the browser sends it), or null for mailto: and fragments. */
export function linkHost(href: string): string | null {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}
