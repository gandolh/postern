// Formatting in the composer's editor, with Ranges and DOM moves only (no
// document.execCommand, which is deprecated and writes whatever markup each
// browser likes). Text nodes are moved, never cloned, so the selection can be
// put back on the same text afterwards.
//
//   toggleMark(root, range, "b")      bold, italic ("i"), underline ("u"), strikethrough ("s")
//   toggleList(root, range, "ul")     bulleted / numbered ("ol") list
//   toggleQuote(root, range)          blockquote
//   clearFormatting(root, range)      remove inline formatting (links stay)
//   insertLink / updateLink / removeLink, insertNodes
//   activeFormats(root, range)        for the toolbar's pressed states
//
// Each returns the range to select afterwards (or null to leave it).

export type Mark = "b" | "i" | "u" | "s";
export type ListKind = "ul" | "ol";

const MARK_TAGS: Record<Mark, readonly string[]> = {
  b: ["b", "strong"],
  i: ["i", "em"],
  u: ["u"],
  s: ["s", "strike", "del"],
};
/** Inline formatting that Remove formatting takes off (links are content, not formatting). */
const INLINE_FORMAT = new Set(["b", "strong", "i", "em", "u", "s", "strike", "del", "span", "font", "code", "sub", "sup", "mark", "small", "big", "tt"]);
/** Elements that hold one line of text. */
const LINE_TAGS = new Set(["div", "p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "pre"]);
const LINE_SELECTOR = [...LINE_TAGS].join(",");
const BLOCK_TAGS = new Set([...LINE_TAGS, "ul", "ol", "blockquote", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "hr", "caption"]);
const ZWSP = "\u200b";

const doc = (node: Node): Document => node.ownerDocument as Document;
const tagOf = (n: Node | null | undefined): string => (n && n.nodeType === Node.ELEMENT_NODE ? n.nodeName.toLowerCase() : "");

// ---- Selection ------------------------------------------------------------------

/** The selection's range when it is inside `root`, else null. */
export function editorRange(root: Element): Range | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
}

/** Select `range`. */
export function selectRange(range: Range): void {
  const selection = range.startContainer.ownerDocument?.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** A range at the end of `root` (where typing goes when nothing was selected). */
export function rangeAtEnd(root: Element): Range {
  const range = root.ownerDocument.createRange();
  const last = lastLeaf(root);
  if (last && last.nodeType === Node.TEXT_NODE) range.setStart(last, (last as Text).length);
  else if (last && last.parentNode) range.setStartBefore(last);
  else range.setStart(root, root.childNodes.length);
  range.collapse(true);
  return range;
}

function lastLeaf(node: Node): Node | null {
  let n: Node | null = node.lastChild;
  while (n && n.lastChild) n = n.lastChild;
  return n;
}

// ---- Tree helpers ---------------------------------------------------------------

function closestWithin(node: Node, root: Element, test: (el: Element) => boolean): Element | null {
  let el: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el && el !== root && root.contains(el)) {
    if (test(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function outermostWithin(node: Node, root: Element, test: (el: Element) => boolean, stop?: Element | null): Element | null {
  let found: Element | null = null;
  let el: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el && el !== root && el !== stop && root.contains(el)) {
    if (test(el)) found = el;
    el = el.parentElement;
  }
  return found;
}

function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

function hasContent(node: Node): boolean {
  if ((node.textContent ?? "").replace(/\u200b/g, "") !== "") return true;
  return node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? !!(node as Element).querySelector?.("img, br, hr") : false;
}

/**
 * Move everything in `ancestor` before and after `node` into shallow copies of
 * `ancestor` on either side, so `ancestor` holds only the path to `node`.
 */
export function splitOut(ancestor: Element, node: Node): void {
  const doc = ancestor.ownerDocument;
  const before = doc.createRange();
  before.setStart(ancestor, 0);
  before.setEndBefore(node);
  if (!before.collapsed) {
    const frag = before.extractContents();
    if (hasContent(frag)) {
      const copy = ancestor.cloneNode(false) as Element;
      copy.append(frag);
      ancestor.before(copy);
    }
  }
  const after = doc.createRange();
  after.setStartAfter(node);
  after.setEnd(ancestor, ancestor.childNodes.length);
  if (!after.collapsed) {
    const frag = after.extractContents();
    if (hasContent(frag)) {
      const copy = ancestor.cloneNode(false) as Element;
      copy.append(frag);
      ancestor.after(copy);
    }
  }
}

/** Split text nodes at the range's ends, so the range covers whole text nodes. */
function splitBoundaries(range: Range): void {
  let sc = range.startContainer;
  let so = range.startOffset;
  let ec = range.endContainer;
  let eo = range.endOffset;
  if (ec.nodeType === Node.TEXT_NODE && eo > 0 && eo < (ec as Text).length) (ec as Text).splitText(eo);
  if (sc.nodeType === Node.TEXT_NODE && so > 0 && so < (sc as Text).length) {
    const tail = (sc as Text).splitText(so);
    if (ec === sc) {
      ec = tail;
      eo -= so;
    }
    sc = tail;
    so = 0;
  }
  range.setStart(sc, so);
  range.setEnd(ec, eo);
}

/** The text nodes a range covers (after splitBoundaries: whole nodes), in order. */
function textNodesIn(range: Range): Text[] {
  const container = range.commonAncestorContainer;
  if (container.nodeType === Node.TEXT_NODE) {
    const t = container as Text;
    return !range.collapsed && t.length > 0 ? [t] : [];
  }
  const doc = container.ownerDocument as Document;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n.length === 0 || !range.intersectsNode(n)) continue;
    if (n === range.endContainer && range.endOffset === 0) continue;
    if (n === range.startContainer && range.startOffset >= n.length) continue;
    out.push(n);
  }
  return out;
}

function rangeOver(first: Node, last: Node): Range {
  const range = (first.ownerDocument as Document).createRange();
  range.setStart(first, 0);
  if (last.nodeType === Node.TEXT_NODE) range.setEnd(last, (last as Text).length);
  else range.setEndAfter(last);
  return range;
}

function caretAfter(node: Node): Range {
  const range = (node.ownerDocument as Document).createRange();
  if (node.nodeType === Node.TEXT_NODE) range.setStart(node, (node as Text).length);
  else range.setStartAfter(node);
  range.collapse(true);
  return range;
}

/** Merge each element with an identical next sibling (same tag, same href), and drop empty inline elements. */
function tidy(root: Element): void {
  for (const el of Array.from(root.querySelectorAll([...INLINE_FORMAT, "a"].join(",")))) {
    if (!el.isConnected) continue;
    // Truly empty only: an element holding the caret's invisible character stays.
    if ((el.textContent ?? "") === "" && !el.querySelector("img, br")) {
      el.remove();
      continue;
    }
    let next = el.nextSibling;
    while (next && next.nodeType === Node.ELEMENT_NODE && tagOf(next) === tagOf(el) && (next as Element).getAttribute("href") === el.getAttribute("href") && (next as Element).attributes.length === el.attributes.length) {
      el.append(...Array.from(next.childNodes));
      const gone = next;
      next = next.nextSibling;
      gone.remove();
    }
  }
}

// ---- Marks (bold, italic, underline, strikethrough) ----------------------------------

function isMark(mark: Mark) {
  return (el: Element) => MARK_TAGS[mark].includes(tagOf(el));
}

/** Whether every character in the range (or the caret) has the mark. */
export function isMarkActive(root: Element, range: Range, mark: Mark): boolean {
  if (range.collapsed) return closestWithin(range.startContainer, root, isMark(mark)) !== null;
  const probe = range.cloneRange();
  const nodes = touchedText(probe);
  return nodes.length > 0 && nodes.every((n) => closestWithin(n, root, isMark(mark)) !== null);
}

/** Text nodes a range touches, without splitting anything. */
function touchedText(range: Range): Text[] {
  const container = range.commonAncestorContainer;
  if (container.nodeType === Node.TEXT_NODE) return [container as Text];
  const walker = (container.ownerDocument as Document).createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n.length === 0 || n.data.replace(/\u200b/g, "").trim() === "" || !range.intersectsNode(n)) continue;
    if (n === range.endContainer && range.endOffset === 0) continue;
    if (n === range.startContainer && range.startOffset >= n.length) continue;
    out.push(n);
  }
  return out;
}

/** Remove the formatting elements matching `test` from around one text node. */
function liftOut(text: Text, root: Element, test: (el: Element) => boolean): void {
  const line = closestWithin(text, root, (el) => LINE_TAGS.has(tagOf(el)) || tagOf(el) === "td" || tagOf(el) === "th");
  const top = outermostWithin(text, root, test, line);
  if (!top) return;
  splitOut(top, text);
  let el: Element | null = text.parentElement;
  while (el && el !== root) {
    const parent: Element | null = el.parentElement;
    const isTop = el === top;
    if (test(el)) unwrap(el);
    if (isTop) break;
    el = parent;
  }
}

/** Bold, italic, underline or strike the range, or take it off if all of it has it already. */
export function toggleMark(root: Element, range: Range, mark: Mark): Range | null {
  const doc = root.ownerDocument;
  let caret: Text | null = null;
  if (range.collapsed) {
    // Toggling at the caret: type into an invisible character carrying the new formatting.
    caret = doc.createTextNode(ZWSP);
    range.insertNode(caret);
    range.setStart(caret, 0);
    range.setEnd(caret, 1);
  }
  splitBoundaries(range);
  const nodes = textNodesIn(range);
  if (nodes.length === 0) return null;
  const test = isMark(mark);
  const active = nodes.every((n) => closestWithin(n, root, test) !== null);
  for (const n of nodes) {
    if (active) liftOut(n, root, test);
    else if (!closestWithin(n, root, test)) {
      const wrapper = doc.createElement(mark);
      n.before(wrapper);
      wrapper.append(n);
    }
  }
  tidy(root);
  if (caret) return caretAfter(caret);
  return rangeOver(nodes[0] as Text, nodes[nodes.length - 1] as Text);
}

/** Take inline formatting (bold, italic, fonts, spans...) off the range. Links stay. */
export function clearFormatting(root: Element, range: Range): Range | null {
  if (range.collapsed) return null;
  splitBoundaries(range);
  const nodes = textNodesIn(range);
  if (nodes.length === 0) return null;
  const test = (el: Element) => INLINE_FORMAT.has(tagOf(el));
  for (const n of nodes) liftOut(n, root, test);
  // Headings become plain lines.
  for (const n of nodes) {
    const heading = closestWithin(n, root, (el) => /^h[1-6]$/.test(tagOf(el)));
    if (heading) {
      const div = doc(root).createElement("div");
      div.append(...Array.from(heading.childNodes));
      heading.replaceWith(div);
    }
  }
  tidy(root);
  return rangeOver(nodes[0] as Text, nodes[nodes.length - 1] as Text);
}

// ---- Lines, lists, quotes ----------------------------------------------------------------

/** Wrap runs of text and inline elements directly in the editor into <div> lines (a <br> ends a line). */
export function normalizeLines(root: Element): void {
  let run: Node[] = [];
  const flush = (before: Node | null) => {
    if (run.length === 0) return;
    const div = doc(root).createElement("div");
    root.insertBefore(div, before);
    div.append(...run);
    run = [];
  };
  for (const child of Array.from(root.childNodes)) {
    const tag = tagOf(child);
    if (child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(tag)) {
      flush(child);
      continue;
    }
    if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim() === "" && run.length === 0) {
      // Whitespace between blocks (from loaded HTML) is not a line.
      if (!(child.textContent ?? "").includes("\u00a0")) continue;
    }
    run.push(child);
    if (tag === "br") flush(child.nextSibling);
  }
  flush(null);
}

/** Where a boundary point is, held on a text node when possible (text nodes survive the moves below). */
interface Point {
  node: Node;
  offset: number;
}

function textPoint(container: Node, offset: number, atStart: boolean): Point {
  if (container.nodeType === Node.TEXT_NODE) return { node: container, offset };
  const child = container.childNodes[offset];
  if (atStart && child) {
    const walker = (container.ownerDocument as Document).createTreeWalker(child, NodeFilter.SHOW_TEXT);
    const first = child.nodeType === Node.TEXT_NODE ? child : walker.nextNode();
    if (first) return { node: first, offset: 0 };
  }
  const before = container.childNodes[offset - 1];
  if (before) {
    const last = before.nodeType === Node.TEXT_NODE ? before : lastText(before);
    if (last) return { node: last, offset: (last as Text).length };
  }
  return { node: container, offset };
}

function lastText(node: Node): Text | null {
  const walker = (node.ownerDocument as Document).createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) last = n as Text;
  return last;
}

function savePoints(range: Range): { start: Point; end: Point } {
  return { start: textPoint(range.startContainer, range.startOffset, true), end: textPoint(range.endContainer, range.endOffset, false) };
}

function restorePoints(root: Element, points: { start: Point; end: Point }): Range {
  const range = doc(root).createRange();
  const ok = (p: Point) => root.contains(p.node) && p.offset <= (p.node.nodeType === Node.TEXT_NODE ? (p.node as Text).length : p.node.childNodes.length);
  if (ok(points.start) && ok(points.end)) {
    range.setStart(points.start.node, points.start.offset);
    range.setEnd(points.end.node, points.end.offset);
    return range;
  }
  return rangeAtEnd(root);
}

/** The line elements a range touches, in document order: list items, else the innermost line blocks. */
function linesIn(root: Element, range: Range): Element[] {
  const lineOf = (node: Node): Element | null =>
    closestWithin(node, root, (el) => tagOf(el) === "li") ?? closestWithin(node, root, (el) => LINE_TAGS.has(tagOf(el)));
  const out: Element[] = [];
  const add = (el: Element | null) => {
    if (el && !out.includes(el)) out.push(el);
  };
  if (range.collapsed) {
    add(lineOf(range.startContainer));
    return out;
  }
  for (const el of Array.from(root.querySelectorAll(LINE_SELECTOR))) {
    if (!range.intersectsNode(el) || el.querySelector(LINE_SELECTOR)) continue;
    if (range.endContainer === el && range.endOffset === 0 && !range.collapsed && out.length > 0) continue;
    add(lineOf(el));
  }
  if (out.length === 0) add(lineOf(range.startContainer));
  out.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return out;
}

function renameElement(el: Element, tag: string): Element {
  const next = doc(el).createElement(tag);
  next.append(...Array.from(el.childNodes));
  el.replaceWith(next);
  return next;
}

function fillEmpty(el: Element): void {
  if (!el.hasChildNodes()) el.append(doc(el).createElement("br"));
}

function mergeLists(root: Element): void {
  for (const list of Array.from(root.querySelectorAll("ul, ol"))) {
    if (!list.isConnected) continue;
    let next = list.nextElementSibling;
    while (next && tagOf(next) === tagOf(list) && list.nextSibling === next) {
      list.append(...Array.from(next.childNodes));
      next.remove();
      next = list.nextElementSibling;
    }
  }
}

/** Whether the range's lines are all items of a `kind` list. */
export function isListActive(root: Element, range: Range, kind: ListKind): boolean {
  const lines = linesIn(root, range);
  return lines.length > 0 && lines.every((l) => tagOf(l) === "li" && tagOf(l.parentElement) === kind);
}

/** Make the range's lines a bulleted or numbered list, or plain lines again if they already are one. */
export function toggleList(root: Element, range: Range, kind: ListKind): Range {
  const points = savePoints(range);
  normalizeLines(root);
  const lines = linesIn(root, restorePoints(root, points)).filter((l) => !closestWithin(l, root, (el) => tagOf(el) === "td" || tagOf(el) === "th"));
  if (lines.length === 0) return restorePoints(root, points);
  const off = lines.every((l) => tagOf(l) === "li" && tagOf(l.parentElement) === kind);
  if (off) {
    for (const li of lines) {
      const list = li.parentElement;
      if (!list) continue;
      splitOut(list, li);
      const div = doc(root).createElement("div");
      div.append(...Array.from(li.childNodes));
      fillEmpty(div);
      list.replaceWith(div);
    }
  } else {
    for (const li of lines) {
      const list = li.parentElement;
      if (tagOf(li) === "li" && list && (tagOf(list) === "ul" || tagOf(list) === "ol") && tagOf(list) !== kind) renameElement(list, kind);
    }
    const items: Element[] = [];
    for (const line of lines) {
      if (tagOf(line) === "li") continue;
      const li = doc(root).createElement("li");
      li.append(...Array.from(line.childNodes));
      fillEmpty(li);
      line.replaceWith(li);
      items.push(li);
    }
    for (const li of items) {
      if (tagOf(li.parentElement) === "ul" || tagOf(li.parentElement) === "ol") continue;
      const list = doc(root).createElement(kind);
      li.before(list);
      list.append(li);
      let next = list.nextSibling;
      while (next && items.includes(next as Element)) {
        const item = next;
        next = next.nextSibling;
        list.append(item);
      }
    }
    mergeLists(root);
  }
  return restorePoints(root, points);
}

/** Whether the range is inside a quote. */
export function isQuoteActive(root: Element, range: Range): boolean {
  const lines = linesIn(root, range);
  return lines.length > 0 && lines.every((l) => closestWithin(l, root, (el) => tagOf(el) === "blockquote") !== null);
}

/** Quote the range's lines, or unquote them if they are all quoted. */
export function toggleQuote(root: Element, range: Range): Range {
  const points = savePoints(range);
  normalizeLines(root);
  const lines = linesIn(root, restorePoints(root, points));
  if (lines.length === 0) return restorePoints(root, points);
  const quotes = lines.map((l) => closestWithin(l, root, (el) => tagOf(el) === "blockquote"));
  if (quotes.every((q) => q !== null)) {
    for (const q of new Set(quotes)) if (q && q.isConnected) unwrap(q);
  } else {
    const tops: Element[] = [];
    for (const l of lines) {
      let top: Element = l;
      while (top.parentElement && top.parentElement !== root) top = top.parentElement;
      if (!tops.includes(top)) tops.push(top);
    }
    const first = tops[0] as Element;
    const last = tops[tops.length - 1] as Element;
    const quote = doc(root).createElement("blockquote");
    first.before(quote);
    let node: Node | null = first;
    while (node) {
      const next: Node | null = node.nextSibling;
      quote.append(node);
      if (node === last) break;
      node = next;
    }
  }
  return restorePoints(root, points);
}

// ---- Links ---------------------------------------------------------------------------------

/** The link the caret or selection starts in, if any. */
export function linkAt(root: Element, range: Range): HTMLAnchorElement | null {
  return closestWithin(range.startContainer, root, (el) => tagOf(el) === "a") as HTMLAnchorElement | null;
}

/** The selected text, flattened. */
export function selectedText(range: Range): string {
  return range.toString().replace(/\u200b/g, "");
}

/**
 * Link the selection to `href`. With nothing selected, or new `text` that
 * differs from the selection, insert `text` (or the address) as the link.
 */
export function insertLink(root: Element, range: Range, href: string, text?: string): Range {
  const label = (text ?? "").trim();
  if (range.collapsed || (label && label !== selectedText(range).trim())) {
    range.deleteContents();
    const a = doc(root).createElement("a");
    a.setAttribute("href", href);
    a.append(doc(root).createTextNode(label || href.replace(/^mailto:/i, "")));
    range.insertNode(a);
    return caretAfter(a);
  }
  splitBoundaries(range);
  const nodes = textNodesIn(range);
  if (nodes.length === 0) return range;
  const isLink = (el: Element) => tagOf(el) === "a";
  for (const n of nodes) {
    liftOut(n, root, isLink);
    const a = doc(root).createElement("a");
    a.setAttribute("href", href);
    n.before(a);
    a.append(n);
  }
  tidy(root);
  return rangeOver(nodes[0] as Text, nodes[nodes.length - 1] as Text);
}

/** Change a link's address, and its text if given. */
export function updateLink(a: HTMLAnchorElement, href: string, text?: string): Range {
  a.setAttribute("href", href);
  const label = (text ?? "").trim();
  if (label && label !== (a.textContent ?? "")) a.replaceChildren(doc(a).createTextNode(label));
  return caretAfter(a);
}

/** Unlink, keeping the text. */
export function removeLink(a: HTMLAnchorElement): Range | null {
  const first = a.firstChild;
  const last = a.lastChild;
  unwrap(a);
  return first && last ? rangeOver(first, last) : null;
}

/** What a typed web address or email address links to, or null if it is not one Postern links. */
export function normalizeLinkInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^mailto:/i.test(value)) return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value) ? value : null;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value)) return `mailto:${value}`;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.href;
  } catch {
    return null;
  }
}

// ---- Inserting -------------------------------------------------------------------------------

/** Put nodes (a sanitised fragment, an image, text) where the range is; returns the caret after them. */
export function insertNodes(root: Element, range: Range, fragment: DocumentFragment | Node): Range {
  const last = fragment.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? fragment.lastChild : fragment;
  if (!last) return range;
  range.deleteContents();
  // Never insert into the editor element's own text boundary in a way that leaves the range outside the root.
  if (!root.contains(range.startContainer)) range.selectNodeContents(root);
  range.insertNode(fragment);
  const after = caretAfter(last);
  return after;
}

// ---- Toolbar state ------------------------------------------------------------------------

export interface ActiveFormats {
  b: boolean;
  i: boolean;
  u: boolean;
  s: boolean;
  ul: boolean;
  ol: boolean;
  quote: boolean;
  link: boolean;
}

export const NO_FORMATS: ActiveFormats = { b: false, i: false, u: false, s: false, ul: false, ol: false, quote: false, link: false };

export function activeFormats(root: Element, range: Range | null): ActiveFormats {
  if (!range) return NO_FORMATS;
  return {
    b: isMarkActive(root, range, "b"),
    i: isMarkActive(root, range, "i"),
    u: isMarkActive(root, range, "u"),
    s: isMarkActive(root, range, "s"),
    ul: isListActive(root, range, "ul"),
    ol: isListActive(root, range, "ol"),
    quote: isQuoteActive(root, range),
    link: linkAt(root, range) !== null,
  };
}
