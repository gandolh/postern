// Quoted text: what folds behind "…", as in Gmail. Only a TRAILING quote
// folds (the reply's own text comes first and nothing substantive follows the
// quote); a quote in the middle of a message, an inline reply, stays shown.
//
// HTML (on the sanitised, detached DOM): the quote element is marked with
// QUOTE_ATTR and the frame hides it with CSS while folded. Recognised:
//   div.gmail_quote / blockquote.gmail_quote          Gmail
//   div.moz-cite-prefix + blockquote[type=cite]       Thunderbird
//   blockquote[type=cite]                             Apple Mail
//   div#divRplyFwdMsg / div#appendonsend and after    Outlook
//   div.yahoo_quoted                                  Yahoo
//   "On … wrote:" + blockquote                        everything else
// Plain text: the trailing run of ">" lines, with the "On … wrote:" line(s)
// before it, or everything from "-----Original Message-----".

export const QUOTE_ATTR = "data-postern-quote";

/** "On Tue, 6 Oct 2026, Bob <bob@x> wrote:" and its usual translations. */
export const ATTRIBUTION = /(?:^|\n|\s)(?:On|Le|Am|El|Il|În|In data|Op)\b[\s\S]{0,400}?(?:wrote|a écrit|schrieb|escribió|ha scritto|a scris|scrisse|schreef)\s*:\s*$/i;

function textOf(node: Node | null): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Nothing but whitespace (and <br>, empty elements) follows `node` up to `root`. */
function nothingAfter(node: Node, root: Node): boolean {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
    for (let s = n.nextSibling; s; s = s.nextSibling) {
      if (textOf(s) !== "") return false;
      if (s.nodeType === 1 && (s as Element).querySelector?.("img")) return false;
      if (s.nodeType === 1 && (s as Element).nodeName.toLowerCase() === "img") return false;
    }
  }
  return true;
}

/** Some real content (text or an image) comes before `node` within `root`. */
function somethingBefore(node: Node, root: Node): boolean {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
    for (let s = n.previousSibling; s; s = s.previousSibling) {
      if (textOf(s) !== "") return true;
      if (s.nodeType === 1 && ((s as Element).nodeName.toLowerCase() === "img" || (s as Element).querySelector?.("img"))) return true;
    }
  }
  return false;
}

function mark(node: Node): void {
  const doc = node.ownerDocument;
  if (!doc) return;
  if (node.nodeType === 1) {
    (node as Element).setAttribute(QUOTE_ATTR, "");
    return;
  }
  // A bare text node (an attribution line): wrap it so CSS can hide it.
  const span = doc.createElement("span");
  span.setAttribute(QUOTE_ATTR, "");
  node.parentNode?.replaceChild(span, node);
  span.append(node);
}

/** The attribution just before a blockquote: a sibling element or text (skipping <br> and blanks) reading "On … wrote:". */
function attributionBefore(quote: Element): Node[] {
  const out: Node[] = [];
  for (let s = quote.previousSibling; s; s = s.previousSibling) {
    if (s.nodeType === 1 && s.nodeName.toLowerCase() === "br") {
      out.push(s);
      continue;
    }
    const text = textOf(s);
    if (text === "") {
      out.push(s);
      continue;
    }
    if (ATTRIBUTION.test(text) && text.length < 500) {
      out.push(s);
      return out;
    }
    return [];
  }
  return [];
}

function candidates(body: Element): Node[][] {
  const out: Node[][] = [];
  const outermost = (selector: string) =>
    Array.from(body.querySelectorAll(selector)).filter((el) => !el.parentElement?.closest(selector));

  for (const el of outermost(".gmail_quote, .yahoo_quoted")) out.push([el]);
  for (const el of outermost("blockquote[type=cite]")) {
    const prefix = el.previousElementSibling;
    if (prefix?.classList.contains("moz-cite-prefix")) out.push([prefix, el]);
    else out.push([...attributionBefore(el), el]);
  }
  for (const start of Array.from(body.querySelectorAll("#divRplyFwdMsg, #appendonsend"))) {
    const run: Node[] = [];
    for (let n: Node | null = start; n; n = n.nextSibling) run.push(n);
    // Outlook puts an <hr> before the header block.
    const hr = start.previousElementSibling;
    if (hr?.nodeName.toLowerCase() === "hr") run.unshift(hr);
    out.push(run);
  }
  for (const el of outermost("blockquote")) {
    const before = attributionBefore(el);
    if (before.length > 0) out.push([...before, el]);
  }
  return out;
}

/**
 * Mark the message's trailing quote with QUOTE_ATTR. Returns whether one was
 * marked. Leaves a message that is nothing but a quote unmarked.
 */
export function markQuote(body: Element): boolean {
  for (const run of candidates(body)) {
    const first = run[0];
    const last = run[run.length - 1];
    if (!first || !last) continue;
    if (!nothingAfter(last, body) || !somethingBefore(first, body)) continue;
    for (const node of run) mark(node);
    return true;
  }
  return false;
}

// ---- Plain text ------------------------------------------------------------------

export interface SplitText {
  /** The message's own text. */
  main: string;
  /** The trailing quote, attribution included, or null. */
  quote: string | null;
}

/** Split a plain-text body into its own text and the trailing quote. */
export function splitPlainQuote(text: string): SplitText {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const original = lines.findIndex((l) => /^\s*-{2,}\s*(Original Message|Forwarded message|Mesaj original|Ursprüngliche Nachricht)\s*-{2,}\s*$/i.test(l));
  let start: number;
  if (original > 0) {
    start = original;
  } else {
    let end = lines.length - 1;
    while (end >= 0 && (lines[end] as string).trim() === "") end--;
    let i = end;
    let quoted = 0;
    while (i >= 0 && (/^\s*>/.test(lines[i] as string) || (lines[i] as string).trim() === "")) {
      if (/^\s*>/.test(lines[i] as string)) quoted++;
      i--;
    }
    if (quoted === 0) return { main: text, quote: null };
    start = i + 1;
    // The attribution: one line, or two when a long "On … <address>" wrapped before "wrote:".
    const one = (lines[i] ?? "").trim();
    const two = `${(lines[i - 1] ?? "").trim()} ${one}`;
    if (ATTRIBUTION.test(one)) start = i;
    else if (i > 0 && ATTRIBUTION.test(two)) start = i - 1;
  }
  const main = lines.slice(0, start).join("\n").replace(/\s+$/, "");
  if (main.trim() === "") return { main: text, quote: null };
  return { main, quote: lines.slice(start).join("\n") };
}
