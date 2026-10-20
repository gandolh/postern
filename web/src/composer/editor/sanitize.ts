// The only way HTML enters the composer's editor. The editor is a
// contentEditable inside the app's own DOM, so whatever lands in it runs with
// Postern's origin: pasted HTML, a draft reopened from the server, a
// signature, a quote. Everything goes through `sanitizeForEditor`, a strict
// allow-list on its own DOMPurify instance (not brief 07's, whose hooks serve
// the message frames), parsed in an inert document and imported into the
// page only once clean.
//
// Kept: simple text structure (div, p, br, headings, lists, blockquote, pre,
// code, tables), inline formatting (b, i, u, s, sub, sup), links (http,
// https and mailto only) and images whose source Postern controls.
// Dropped: scripts and every element that can run, load or submit anything;
// event handlers; ids; style (bold, italic and underline written as CSS are
// turned into tags first, so pasting from a word processor keeps them); any
// class but the quote and signature markers; remote images (an editor image
// is either the user's own pasted bytes or a part of the draft).
//
//   mode "paste": pasted or dropped HTML. data: raster images survive, marked for upload
//                 (they become cid: parts); no class survives (no fake quote or signature)
//   mode "load":  the composer's own HTML (a draft, a signature, a quote): cid: images map to
//                 object URLs through `cidUrls`, the quote and signature classes stay

import createDOMPurify, { type Config, type DOMPurify, type UponSanitizeAttributeHookEvent } from "dompurify";
import { safeLinkUrl } from "../../render/urls";

export type SanitizeMode = "paste" | "load";

export interface EditorSanitizeOptions {
  mode: SanitizeMode;
  /** load: bare Content-ID (lower-case) → object URL of the draft's inline image. */
  cidUrls?: ReadonlyMap<string, string>;
}

/** A pasted image that still has to be uploaded (mode "paste"). Its <img> is in the fragment. */
export interface PendingImage {
  img: HTMLImageElement;
  dataUrl: string;
}

export interface EditorFragment {
  /** Clean nodes, owned by the page's document, ready to insert. */
  fragment: DocumentFragment;
  /** Pasted data: images, to upload and turn into cid: parts. */
  pending: PendingImage[];
}

/** Attribute naming the Content-ID of an image in the editor. Set only by this module and the composer. */
export const CID_ATTR = "data-postern-cid";

/** Class tokens that survive: Gmail's and Postern's quote and signature markers. */
export const KEPT_CLASSES = new Set(["gmail_quote", "gmail_attr", "gmail_signature", "postern_quote", "postern_signature"]);

export const EDITOR_TAGS = [
  "div", "p", "br", "span", "b", "strong", "i", "em", "u", "s", "strike", "del", "sub", "sup", "code", "pre",
  "a", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "img",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
] as const;

const CONFIG: Config & { RETURN_DOM_FRAGMENT: true } = {
  ALLOWED_TAGS: [...EDITOR_TAGS],
  ALLOWED_ATTR: ["href", "src", "alt", "width", "height", "class", "style", "start", "colspan", "rowspan", "title"],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  KEEP_CONTENT: true,
  RETURN_DOM_FRAGMENT: true,
};

const RASTER_DATA_URL = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

let purifier: DOMPurify | null = null;
let current: EditorSanitizeOptions | null = null;

function linkUrl(raw: string): string | null {
  const url = safeLinkUrl(raw);
  return url && !url.startsWith("#") ? url : null;
}

function onAttribute(node: Element, data: UponSanitizeAttributeHookEvent): void {
  const options = current;
  if (!options) return;
  const name = data.attrName;
  const value = data.attrValue;
  if (name === "href") {
    const url = node.nodeName.toLowerCase() === "a" ? linkUrl(value) : null;
    if (url) data.attrValue = url;
    else data.keepAttr = false;
    return;
  }
  if (name === "src") {
    const src = value.trim();
    if (node.nodeName.toLowerCase() !== "img") {
      data.keepAttr = false;
    } else if (options.mode === "paste" && RASTER_DATA_URL.test(src)) {
      data.attrValue = src.replace(/\s+/g, "");
    } else if (options.mode === "load" && /^cid:/i.test(src)) {
      let cid = src.slice(4);
      try {
        cid = decodeURIComponent(cid);
      } catch {
        // keep as written
      }
      cid = cid.replace(/^<|>$/g, "").toLowerCase();
      // Kept as cid: here (DOMPurify's own URL check refuses blob:); swapped for the object URL below.
      if (options.cidUrls?.has(cid)) data.attrValue = `cid:${cid}`;
      else data.keepAttr = false;
    } else {
      // Remote, relative, blob:, anything else: never loaded from the editor.
      data.keepAttr = false;
    }
    return;
  }
  if (name === "class") {
    // Quote and signature markers are Postern's own, kept only on what the
    // composer wrote (a draft, a signature, a quote): pasted or dropped HTML
    // cannot pass its text off as a quote or a signature.
    if (options.mode === "paste") {
      data.keepAttr = false;
      return;
    }
    const kept = value.split(/\s+/).filter((c) => KEPT_CLASSES.has(c));
    if (kept.length) data.attrValue = kept.join(" ");
    else data.keepAttr = false;
    return;
  }
  if ((name === "width" || name === "height") && !/^\d{1,4}$/.test(value.trim())) {
    data.keepAttr = false;
    return;
  }
  if (name === "start" && !/^\d{1,6}$/.test(value.trim())) data.keepAttr = false;
  // style is read once below (bold, italic, underline) and then removed.
}

function getPurifier(): DOMPurify {
  if (purifier) return purifier;
  const p = createDOMPurify(window);
  p.addHook("uponSanitizeAttribute", onAttribute);
  purifier = p;
  return p;
}

const BOLD = /font-weight\s*:\s*(?:bold|bolder|[6-9]00)\b/i;
const ITALIC = /font-style\s*:\s*(?:italic|oblique)\b/i;
const UNDERLINE = /text-decoration(?:-line)?\s*:[^;]*\bunderline\b/i;
const STRIKE = /text-decoration(?:-line)?\s*:[^;]*\bline-through\b/i;

/** Turn CSS bold/italic/underline/strike into tags, then drop every style attribute. */
function styleToTags(root: DocumentFragment): void {
  const doc = root.ownerDocument;
  for (const el of Array.from(root.querySelectorAll("[style]"))) {
    const style = el.getAttribute("style") ?? "";
    el.removeAttribute("style");
    const wraps: string[] = [];
    if (BOLD.test(style) && !el.closest("b, strong, h1, h2, h3, h4, h5, h6, th")) wraps.push("b");
    if (ITALIC.test(style) && !el.closest("i, em")) wraps.push("i");
    if (UNDERLINE.test(style) && !el.closest("u, a")) wraps.push("u");
    if (STRIKE.test(style) && !el.closest("s, strike, del")) wraps.push("s");
    for (const tag of wraps) {
      const wrapper = doc.createElement(tag);
      while (el.firstChild) wrapper.append(el.firstChild);
      el.append(wrapper);
    }
  }
}

const BLOCKISH = new Set(["DIV", "P", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "CAPTION"]);

/**
 * HTML collapses its source whitespace; the editor keeps whitespace as typed
 * (pre-wrap). So collapse it here, as a browser would render it: runs of
 * spaces and line breaks become one space, and whitespace-only text between
 * blocks goes. <pre> keeps its own.
 */
function collapseWhitespace(root: DocumentFragment): void {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const t of texts) {
    if (t.parentElement?.closest("pre")) continue;
    const collapsed = t.data.replace(/[ \t\n\r\f]+/g, " ");
    if (collapsed.trim() === "" && collapsed !== "") {
      const prev = t.previousSibling;
      const next = t.nextSibling;
      const parentBlock = !t.parentElement || BLOCKISH.has(t.parentElement.nodeName);
      if (!prev || !next || BLOCKISH.has(prev.nodeName) || BLOCKISH.has(next.nodeName) || (parentBlock && (prev.nodeName === "BR" || next.nodeName === "BR"))) {
        t.remove();
        continue;
      }
    }
    if (collapsed !== t.data) t.data = collapsed;
  }
}

/** Unwrap spans that carry nothing (after styles are gone). */
function unwrapBareSpans(root: DocumentFragment): void {
  for (const span of Array.from(root.querySelectorAll("span"))) {
    if (span.attributes.length > 0) continue;
    span.replaceWith(...Array.from(span.childNodes));
  }
}

/**
 * Clean HTML for the editor. The result is imported into the page's document;
 * insert it with DOM methods (never as a string).
 */
export function sanitizeForEditor(html: string, options: EditorSanitizeOptions): EditorFragment {
  const p = getPurifier();
  current = options;
  let dirty: DocumentFragment;
  try {
    dirty = p.sanitize(html, CONFIG);
  } finally {
    current = null;
  }
  // Still in DOMPurify's inert document: nothing loads while we finish.
  styleToTags(dirty);
  unwrapBareSpans(dirty);
  collapseWhitespace(dirty);
  for (const img of Array.from(dirty.querySelectorAll("img"))) {
    if (!img.getAttribute("src")) img.remove();
  }
  if (options.mode === "load") {
    for (const img of Array.from(dirty.querySelectorAll("img"))) {
      const cid = /^cid:(.+)$/.exec(img.getAttribute("src") ?? "")?.[1];
      const url = cid ? options.cidUrls?.get(cid) : undefined;
      if (cid && url) {
        img.setAttribute("src", url);
        img.setAttribute(CID_ATTR, cid);
      } else img.remove();
    }
  }
  const fragment = document.importNode(dirty, true);
  const pending: PendingImage[] = [];
  if (options.mode === "paste") {
    for (const img of Array.from(fragment.querySelectorAll("img"))) {
      const src = img.getAttribute("src") ?? "";
      if (RASTER_DATA_URL.test(src)) pending.push({ img, dataUrl: src });
      else img.remove();
    }
  }
  return { fragment, pending };
}

/** Plain text as editor nodes: one <div> per line (an empty line holds a <br>), all as text nodes. */
export function textToFragment(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const line of lines) {
    const div = document.createElement("div");
    if (line === "") div.append(document.createElement("br"));
    else div.append(document.createTextNode(line));
    fragment.append(div);
  }
  return fragment;
}

/** Decode a data: URL into a File, for upload. Null if it is not a base64 raster image. */
export function dataUrlToFile(dataUrl: string, name: string): File | null {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) return null;
  const type = (match[1] as string).toLowerCase();
  let binary: string;
  try {
    binary = atob(match[2] as string);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = type.split("/")[1] === "jpeg" ? "jpg" : type.split("/")[1];
  return new File([bytes], `${name}.${ext}`, { type });
}
