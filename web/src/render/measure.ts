// How tall a message frame should be. The frame cannot script and Postern
// cannot look inside it (no allow-same-origin), so its content height is
// never readable. Instead the sanitised, detached DOM is laid out roughly
// here: text wrapped at the frame's width with the frame's own font
// (measured on a canvas, never in the DOM), images at their width and height
// attributes, tables row by row. The estimate leans a little tall; the frame
// scrolls inside if it is still short, and the reader can drag it taller or
// ask for the full height.

import { QUOTE_ATTR } from "./quotes";
import { FRAME_FONT_FAMILY, FRAME_FONT_SIZE, FRAME_LINE_HEIGHT } from "./srcdoc";

/** Width in px of `text` set in `font` (a CSS font shorthand). */
export type TextMeasurer = (text: string, font: string) => number;

let canvasMeasurer: TextMeasurer | null | undefined;

/** A measurer backed by a canvas 2D context, or one that guesses half an em per character (jsdom). */
export function defaultMeasurer(): TextMeasurer {
  if (canvasMeasurer === undefined) {
    canvasMeasurer = null;
    try {
      const ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
      if (ctx) {
        canvasMeasurer = (text, font) => {
          ctx.font = font;
          return ctx.measureText(text).width;
        };
      }
    } catch {
      canvasMeasurer = null;
    }
  }
  return canvasMeasurer ?? ((text, font) => text.length * fontSizeOf(font) * 0.5);
}

function fontSizeOf(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? parseFloat(m[1] as string) : FRAME_FONT_SIZE;
}

export interface MeasureOptions {
  /** The frame's inner width in px. */
  width: number;
  /** The trailing quote is hidden. */
  foldQuote: boolean;
  measure?: TextMeasurer;
}

const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "center", "dd", "details", "div", "dl", "dt", "fieldset", "figcaption",
  "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "main", "nav", "ol", "p",
  "pre", "section", "summary", "table", "ul", "body", "caption", "tr", "tbody", "thead", "tfoot", "td", "th",
]);

/** A <br> in a run of text (a private-use character, so whitespace collapsing leaves it alone). */
const BR = "\ue000";

const SKIP = new Set(["style", "script", "head", "title", "template", "map", "area", "colgroup", "col"]);

const HEADING_SCALE: Record<string, number> = { h1: 2, h2: 1.5, h3: 1.17, h4: 1, h5: 0.83, h6: 0.67 };

interface Ctx {
  measure: TextMeasurer;
  foldQuote: boolean;
}

function styleOf(el: Element): string {
  return (el.getAttribute("style") ?? "").toLowerCase();
}

function hidden(el: Element, ctx: Ctx): boolean {
  if (el.hasAttribute("hidden")) return true;
  if (ctx.foldQuote && el.hasAttribute(QUOTE_ATTR)) return true;
  const style = styleOf(el);
  if (/(^|;)\s*display\s*:\s*none/.test(style)) return true;
  // A preheader: squeezed to nothing and clipped.
  return /(^|;)\s*(max-height|height)\s*:\s*0(px)?\s*(;|!|$)/.test(style) && /overflow\s*:\s*hidden/.test(style);
}

function pxAttr(el: Element, name: string): number | null {
  const raw = el.getAttribute(name);
  if (!raw) {
    const style = new RegExp(`(^|;)\\s*${name}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`).exec(styleOf(el));
    return style ? parseFloat(style[2] as string) : null;
  }
  if (/%$/.test(raw.trim())) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function fontSize(el: Element, inherited: number): number {
  const tag = el.nodeName.toLowerCase();
  const style = /(^|;)\s*font-size\s*:\s*(\d+(?:\.\d+)?)(px|pt|em|rem|%)/.exec(styleOf(el));
  if (style) {
    const n = parseFloat(style[2] as string);
    switch (style[3]) {
      case "px":
        return n;
      case "pt":
        return n * (4 / 3);
      case "em":
        return n * inherited;
      case "rem":
        return n * FRAME_FONT_SIZE;
      case "%":
        return (n / 100) * inherited;
    }
  }
  const scale = HEADING_SCALE[tag];
  if (scale) return FRAME_FONT_SIZE * scale;
  if (tag === "small") return inherited * 0.83;
  if (tag === "font") {
    const size = el.getAttribute("size");
    const sizes = [10, 13, 16, 18, 24, 32, 48];
    const n = size ? parseInt(size, 10) : NaN;
    if (Number.isFinite(n)) return sizes[Math.min(Math.max(n, 1), 7) - 1] as number;
  }
  return inherited;
}

/** One line box being filled: its text (wrapped later) and the tallest inline image in it. */
interface Run {
  text: string;
  size: number;
  bold: boolean;
  imageHeight: number;
}

function wrapLines(text: string, width: number, size: number, bold: boolean, ctx: Ctx): number {
  if (width <= 0) return 1;
  const font = `${bold ? 700 : 400} ${size}px ${FRAME_FONT_FAMILY}`;
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines++;
      continue;
    }
    const space = ctx.measure(" ", font);
    let line = 0;
    lines++;
    for (const word of words) {
      const w = ctx.measure(word, font);
      if (w > width) {
        // A long unbroken word (a URL) wraps anywhere (overflow-wrap).
        const extra = Math.ceil((line + w) / width) - 1;
        lines += extra;
        line = (line + w) % width;
        continue;
      }
      if (line > 0 && line + space + w > width) {
        lines++;
        line = w;
      } else {
        line += (line > 0 ? space : 0) + w;
      }
    }
  }
  return lines;
}

/** Height of a block's content: inline runs wrapped, block children stacked. */
function flowHeight(el: Element, width: number, size: number, bold: boolean, ctx: Ctx, pre: boolean): number {
  let height = 0;
  let run: Run = { text: "", size, bold, imageHeight: 0 };
  const lineHeight = (s: number) => s * FRAME_LINE_HEIGHT;

  const flush = () => {
    const hasText = run.text.replaceAll(BR, "").trim() !== "" || (pre && run.text !== "") || run.text.includes(BR);
    if (hasText) {
      const joined = (pre ? run.text : run.text.replace(/\s+/g, " ")).replaceAll(BR, "\n");
      // A trailing <br> ends the line it is on; it does not open another.
      const text = joined.endsWith("\n") ? joined.slice(0, -1) : joined;
      const lines = wrapLines(text, width, run.size, run.bold, ctx);
      // An image on a line makes that line as tall as the image.
      height += lines * lineHeight(run.size) + Math.max(0, run.imageHeight - lineHeight(run.size));
    } else if (run.imageHeight > 0) {
      height += run.imageHeight + 4;
    }
    run = { text: "", size, bold, imageHeight: 0 };
  };

  const inline = (node: Node, s: number, b: boolean) => {
    if (node.nodeType === 3) {
      run.text += node.textContent ?? "";
      run.size = Math.max(run.size, s);
      run.bold ||= b;
      return;
    }
    if (node.nodeType !== 1) return;
    const child = node as Element;
    const tag = child.nodeName.toLowerCase();
    if (SKIP.has(tag) || hidden(child, ctx)) return;
    if (tag === "br") {
      run.text += BR;
      return;
    }
    if (tag === "img") {
      // An image with no source (blocked, or a cid: that did not resolve) shows its alt text inline.
      if (!child.hasAttribute("src")) run.text += ` ${child.getAttribute("alt") ?? ""} `;
      else run.imageHeight = Math.max(run.imageHeight, imageHeight(child, width));
      return;
    }
    if (BLOCK.has(tag)) {
      flush();
      height += blockHeight(child, width, s, b, ctx);
      return;
    }
    const childSize = fontSize(child, s);
    const childBold = b || tag === "b" || tag === "strong" || /font-weight\s*:\s*(bold|[6-9]00)/.test(styleOf(child));
    for (const c of Array.from(child.childNodes)) inline(c, childSize, childBold);
  };

  for (const c of Array.from(el.childNodes)) inline(c, size, bold);
  flush();
  return height;
}

function imageHeight(img: Element, width: number): number {
  const w = pxAttr(img, "width");
  const h = pxAttr(img, "height");
  if (h !== null) return w !== null && w > width && w > 0 ? (h * width) / w : h;
  // Unknown size: guess a moderate picture.
  return Math.min(width * 0.6, 240);
}

function tableHeight(table: Element, width: number, size: number, bold: boolean, ctx: Ctx): number {
  const attrWidth = pxAttr(table, "width");
  const inner = attrWidth !== null ? Math.min(attrWidth, width) : width;
  const padding = parseFloat(table.getAttribute("cellpadding") ?? "1") || 0;
  const spacing = parseFloat(table.getAttribute("cellspacing") ?? "2") || 0;
  let height = 0;
  const rows = Array.from(table.querySelectorAll("tr")).filter((tr) => tr.closest("table") === table);
  for (const row of rows) {
    if (hidden(row, ctx)) continue;
    const cells = Array.from(row.children).filter((c) => /^t[dh]$/i.test(c.nodeName) && !hidden(c, ctx));
    if (cells.length === 0) continue;
    const fixed = cells.map((c) => pxAttr(c, "width"));
    const fixedTotal = fixed.reduce<number>((sum, w) => sum + (w ?? 0), 0);
    const free = fixed.filter((w) => w === null).length;
    const share = free > 0 ? Math.max(inner - fixedTotal, inner * 0.2) / free : 0;
    let rowHeight = 0;
    for (const [i, cell] of cells.entries()) {
      const cellWidth = Math.max(16, Math.min(fixed[i] ?? share, inner) - 2 * padding);
      const content = flowHeight(cell, cellWidth, fontSize(cell, size), bold || cell.nodeName.toLowerCase() === "th", ctx, false);
      rowHeight = Math.max(rowHeight, content + 2 * padding, pxAttr(cell, "height") ?? 0);
    }
    height += rowHeight + spacing;
  }
  return height + spacing;
}

/** A block's vertical margin, counted once: adjacent margins collapse, so n blocks show about n + 1 of them. */
function margins(tag: string, size: number): number {
  if (tag === "p" || tag === "blockquote" || tag === "ul" || tag === "ol" || tag === "dl" || tag === "pre" || tag === "figure") return size;
  const scale = HEADING_SCALE[tag];
  if (scale) return size * (tag === "h1" ? 0.67 : tag === "h2" ? 0.83 : 1);
  if (tag === "hr") return 8;
  return 0;
}

function blockHeight(el: Element, width: number, inheritedSize: number, bold: boolean, ctx: Ctx): number {
  const tag = el.nodeName.toLowerCase();
  if (SKIP.has(tag) || hidden(el, ctx)) return 0;
  const size = fontSize(el, inheritedSize);
  const isBold = bold || /^(h[1-6]|th|b|strong)$/.test(tag) || /font-weight\s*:\s*(bold|[6-9]00)/.test(styleOf(el));
  if (tag === "table") return tableHeight(el, width, size, isBold, ctx) + 4;
  if (tag === "hr") return 2 + margins(tag, size);
  let inner = width;
  if (tag === "ul" || tag === "ol") inner -= 40;
  if (tag === "blockquote") inner -= 40;
  const fixed = pxAttr(el, "width");
  if (fixed !== null) inner = Math.min(inner, fixed);
  const content = flowHeight(el, Math.max(inner, 40), size, isBold, ctx, tag === "pre");
  const explicit = pxAttr(el, "height");
  return Math.max(content, explicit ?? 0) + margins(tag, size);
}

/** The frame height in px for a sanitised body at a given width. */
export function estimateFrameHeight(body: Element, options: MeasureOptions): number {
  const ctx: Ctx = { measure: options.measure ?? defaultMeasurer(), foldQuote: options.foldQuote };
  const width = Math.max(options.width, 120);
  // The last block's bottom margin, which nothing collapses away.
  const content = flowHeight(body, width, FRAME_FONT_SIZE, false, ctx, false) + FRAME_FONT_SIZE;
  // Lean tall: a few blank pixels are better than a scrollbar.
  return Math.max(48, Math.ceil(content * 1.06 + 24));
}
