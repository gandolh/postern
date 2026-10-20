// The editor's content as the HTML and text Postern sends. Written by walking
// the editor's DOM against the same allow-list as the sanitiser, so whatever
// the browser added while editing (stray spans, styles, ids) never goes out.
// Images go out as `cid:` references to their parts; links keep http, https
// and mailto only. The text alternative follows Gmail's: one line per block,
// "> " for quotes, "- " and "1. " for list items, "[image: name]" for images,
// "text <url>" for links whose text is not the address.

import { escapeHtml, QUOTE_BLOCK_STYLE } from "@postern/jmap";
import { safeLinkUrl } from "../../render/urls";
import { CID_ATTR, KEPT_CLASSES } from "./sanitize";

export interface SerializedBody {
  /** The HTML body (no <html>/<body> wrapper). */
  html: string;
  /** The text/plain alternative. */
  text: string;
  /** Only what the user wrote: no quoted original, no signature (for the "attached" check and the empty check). */
  ownText: string;
  /** Content-IDs of the images the HTML uses. */
  cids: string[];
}

const ZWSP = /\u200b/g;
const OUTPUT_TAG: Record<string, string> = {
  div: "div", p: "p", span: "span", b: "b", strong: "b", i: "i", em: "i", u: "u", s: "s", strike: "s", del: "s", sub: "sub", sup: "sup",
  code: "code", pre: "pre", a: "a", ul: "ul", ol: "ol", li: "li", blockquote: "blockquote",
  h1: "h1", h2: "h2", h3: "h3", h4: "h4", h5: "h5", h6: "h6", table: "table", thead: "thead", tbody: "tbody", tfoot: "tfoot", tr: "tr", td: "td", th: "th", caption: "caption",
};
const VOID = new Set(["br", "hr", "img"]);
const BLOCK = new Set(["div", "p", "li", "blockquote", "pre", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "table", "tr", "hr", "caption"]);
const QUOTE_MARKERS = ["postern_quote", "gmail_quote"];
const SIGNATURE_MARKERS = ["postern_signature", "gmail_signature"];

function hasClass(el: Element, names: readonly string[]): boolean {
  return names.some((n) => el.classList.contains(n));
}

function linkHref(el: Element): string | null {
  const url = safeLinkUrl(el.getAttribute("href") ?? "");
  return url && !url.startsWith("#") ? url : null;
}

/** Text accumulator that knows where lines end. */
class TextOut {
  out = "";
  ensureLine(): void {
    if (this.out !== "" && !this.out.endsWith("\n")) this.out += "\n";
  }
  push(text: string): void {
    this.out += text;
  }
}

function serializeHtml(node: Node, cids: Set<string>): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml((node.textContent ?? "").replace(ZWSP, "")).replace(/\n/g, "<br>");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  const tag = el.nodeName.toLowerCase();
  if (tag === "br") return "<br>";
  if (tag === "hr") return "<hr>";
  if (tag === "img") {
    const cid = el.getAttribute(CID_ATTR);
    if (!cid) return "";
    cids.add(cid);
    const alt = el.getAttribute("alt");
    const width = el.getAttribute("width");
    const height = el.getAttribute("height");
    return `<img src="cid:${escapeHtml(cid)}"${alt !== null ? ` alt="${escapeHtml(alt)}"` : ""}${width && /^\d+$/.test(width) ? ` width="${width}"` : ""}${height && /^\d+$/.test(height) ? ` height="${height}"` : ""}>`;
  }
  const inner = Array.from(el.childNodes, (c) => serializeHtml(c, cids)).join("");
  const out = OUTPUT_TAG[tag];
  if (!out) return inner;
  let attrs = "";
  if (out === "a") {
    const href = linkHref(el);
    if (!href) return inner;
    attrs += ` href="${escapeHtml(href)}"`;
  }
  const classes = Array.from(el.classList).filter((c) => KEPT_CLASSES.has(c));
  if (classes.length) attrs += ` class="${classes.join(" ")}"`;
  if (out === "blockquote") attrs += ` style="${QUOTE_BLOCK_STYLE}"`;
  if (out === "ol") {
    const start = el.getAttribute("start");
    if (start && /^\d+$/.test(start)) attrs += ` start="${start}"`;
  }
  if ((out === "td" || out === "th") && /^\d+$/.test(el.getAttribute("colspan") ?? "")) attrs += ` colspan="${el.getAttribute("colspan")}"`;
  if (out === "span" && !attrs) return inner;
  return VOID.has(out) ? `<${out}${attrs}>` : `<${out}${attrs}>${inner}</${out}>`;
}

function serializeText(node: Node, t: TextOut, skip: (el: Element) => boolean, listIndex: { n: number } | null): void {
  if (node.nodeType === Node.TEXT_NODE) {
    t.push((node.textContent ?? "").replace(ZWSP, "").replace(/\u00a0/g, " "));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (skip(el)) return;
  const tag = el.nodeName.toLowerCase();
  if (tag === "br") {
    t.push("\n");
    return;
  }
  if (tag === "hr") {
    t.ensureLine();
    t.push("---\n");
    return;
  }
  if (tag === "img") {
    if (el.getAttribute(CID_ATTR)) t.push(`[image: ${el.getAttribute("alt") || "image"}]`);
    return;
  }
  if (tag === "blockquote") {
    const inner = new TextOut();
    for (const c of Array.from(el.childNodes)) serializeText(c, inner, skip, null);
    const body = inner.out.replace(/\n+$/, "");
    t.ensureLine();
    if (body) t.push(`${body.split("\n").map((l) => (l === "" ? ">" : l.startsWith(">") ? `>${l}` : `> ${l}`)).join("\n")}\n`);
    return;
  }
  const block = BLOCK.has(tag);
  if (block) t.ensureLine();
  if (tag === "li") {
    t.push(listIndex ? `${listIndex.n++}. ` : "- ");
  }
  if (tag === "td" || tag === "th") {
    if (!t.out.endsWith("\n") && t.out !== "") t.push("\t");
  }
  const childList = tag === "ol" ? { n: Number(el.getAttribute("start")) || 1 } : tag === "ul" ? null : listIndex;
  for (const c of Array.from(el.childNodes)) serializeText(c, t, skip, tag === "ol" || tag === "ul" ? childList : listIndex);
  if (tag === "a") {
    const href = linkHref(el);
    const text = (el.textContent ?? "").replace(ZWSP, "").trim();
    const shown = href?.replace(/^mailto:/i, "");
    if (href && text && shown !== text && href !== text) t.push(` <${href}>`);
  }
  if (block) t.ensureLine();
}

function finishText(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\s+$/, "");
}

/** The editor's content, ready to send. */
export function serializeEditor(root: Element): SerializedBody {
  const cids = new Set<string>();
  const html = Array.from(root.childNodes, (c) => serializeHtml(c, cids)).join("");
  const all = new TextOut();
  for (const c of Array.from(root.childNodes)) serializeText(c, all, () => false, null);
  const own = new TextOut();
  for (const c of Array.from(root.childNodes)) serializeText(c, own, (el) => hasClass(el, QUOTE_MARKERS) || hasClass(el, SIGNATURE_MARKERS), null);
  return { html, text: finishText(all.out), ownText: finishText(own.out), cids: [...cids] };
}
