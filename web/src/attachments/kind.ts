// What an attachment is, for the chip and for what Postern will do with it.
// Pure.
//
//   image   a raster image (png, jpeg, gif, webp, avif, bmp): preview in a
//           sandboxed frame, inline in a message as a data: URL
//   pdf     preview in Chrome's PDF viewer, in a new tab (see pdf.ts)
//   active  HTML, SVG, XML and other documents that can run script in a
//           browser: download only, never rendered, flagged
//   other   download only
//
// The type is decided from the declared type AND the file name's last
// extension, the more dangerous winning: `invoice.pdf.html` is HTML whatever
// its Content-Type says, and its name is flagged as a double extension.
// Names are read with bidi controls taken out (stripBidiControls), so
// "Invoice_\u202Efdp.exe", shown as "Invoice_exe.pdf", is read as the .exe it is.

export type AttachmentKind = "image" | "pdf" | "active" | "other";

const RASTER = new Set(["image/png", "image/jpeg", "image/jpg", "image/pjpeg", "image/gif", "image/webp", "image/avif", "image/bmp"]);
const RASTER_EXT = new Set(["png", "jpg", "jpeg", "jfif", "gif", "webp", "avif", "bmp"]);

const ACTIVE_TYPES = [/^text\/html/, /^application\/xhtml/, /^image\/svg/, /xml$/, /^text\/xml/, /^application\/(x-)?javascript/, /^text\/javascript/, /^multipart\/related/, /^message\/rfc822/];
const ACTIVE_EXT = new Set(["html", "htm", "shtml", "xhtml", "xht", "svg", "svgz", "xml", "xsl", "xslt", "js", "mjs", "mht", "mhtml", "hta", "eml"]);
/** Extensions that run as programs when opened on the desktop: a double extension ending in one is the classic trick. */
const EXECUTABLE_EXT = new Set(["exe", "scr", "bat", "cmd", "com", "pif", "vbs", "vbe", "js", "jse", "wsf", "wsh", "ps1", "msi", "jar", "lnk", "hta", "html", "htm", "svg", "iso", "img"]);

/**
 * Characters that reorder the text around them: embeddings, overrides and
 * isolates (U+202A-202E, U+2066-2069) and the marks (U+200E, U+200F, U+061C).
 * "Invoice_\u202Efdp.exe" shows as "Invoice_exe.pdf". A file name has no
 * honest use for them.
 */
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function hasBidiControls(text: string | null | undefined): boolean {
  return /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(text ?? "");
}

/** The name in its real (logical) order, the reordering characters taken out. Every check below reads this. */
export function stripBidiControls(text: string): string {
  return text.replace(BIDI_CONTROLS, "");
}

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,10})$/i.exec(stripBidiControls(name).trim());
  return m ? (m[1] as string).toLowerCase() : "";
}

export function baseType(type: string | null | undefined): string {
  return (type ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export function attachmentKind(type: string | null | undefined, name: string | null | undefined): AttachmentKind {
  const t = baseType(type);
  const ext = extensionOf(name ?? "");
  if (ACTIVE_TYPES.some((re) => re.test(t)) || ACTIVE_EXT.has(ext)) return "active";
  if (t === "application/pdf" && (ext === "pdf" || ext === "")) return "pdf";
  if (ext === "pdf" && (t === "" || t === "application/octet-stream")) return "pdf";
  if (RASTER.has(t) && (ext === "" || RASTER_EXT.has(ext))) return "image";
  return "other";
}

/**
 * `invoice.pdf.html`: a name with a second, harmless-looking extension in
 * front of a different real one. Returns the two, or null.
 */
export function doubleExtension(name: string | null | undefined): { shown: string; real: string } | null {
  const m = /\.([a-z0-9]{2,5})\.([a-z0-9]{2,5})$/i.exec(stripBidiControls(name ?? "").trim());
  if (!m) return null;
  const shown = (m[1] as string).toLowerCase();
  const real = (m[2] as string).toLowerCase();
  if (shown === real) return null;
  // tar.gz and friends are honest.
  if (["tar", "cpio"].includes(shown)) return null;
  return EXECUTABLE_EXT.has(real) || ACTIVE_EXT.has(real) ? { shown, real } : null;
}

/** "Report.pdf" → "PDF", "photo.jpeg" → "JPEG", else from the type. */
export function typeLabel(type: string | null | undefined, name: string | null | undefined): string {
  const ext = extensionOf(name ?? "");
  if (ext) return ext.toUpperCase();
  const t = baseType(type);
  const sub = t.split("/")[1];
  return sub ? sub.replace(/^x-/, "").toUpperCase() : "File";
}

/** 1536 → "1.5 KB". */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit++;
  }
  return `${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10} ${units[unit]}`;
}

/** The real raster type of some bytes, by signature, or null. Declared types are not trusted for previews. */
export function sniffRaster(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i] ?? -1;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (at(0) === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(8, 12))) return "image/avif";
  if (ascii(0, 2) === "BM") return "image/bmp";
  return null;
}

/** A PDF starts with %PDF- (within its first KB, per the spec's leniency). */
export function isPdf(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}
