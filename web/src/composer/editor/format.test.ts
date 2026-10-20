// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { activeFormats, clearFormatting, insertLink, isMarkActive, normalizeLinkInput, removeLink, toggleList, toggleMark, toggleQuote } from "./format";

function editor(html: string): HTMLDivElement {
  const root = document.createElement("div");
  root.contentEditable = "true";
  // Test fixtures are literal markup written here, not message HTML.
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  root.append(...Array.from(parsed.body.childNodes, (n) => document.importNode(n, true)));
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
});

/** A range over `text` inside the first text node that contains it. */
function rangeOf(root: Element, text: string): Range {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = (n.textContent ?? "").indexOf(text);
    if (i >= 0) {
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + text.length);
      return r;
    }
  }
  throw new Error(`no ${text}`);
}

function caretAt(root: Element, text: string, offset: number): Range {
  const r = rangeOf(root, text);
  r.setStart(r.startContainer, r.startOffset + offset);
  r.collapse(true);
  return r;
}

const html = (root: Element) => root.innerHTML.replace(/\u200b/g, "|");

describe("marks", () => {
  it("bolds part of a line", () => {
    const root = editor("<div>Hello world</div>");
    const next = toggleMark(root, rangeOf(root, "world"), "b");
    expect(html(root)).toBe("<div>Hello <b>world</b></div>");
    expect(next?.toString()).toBe("world");
  });

  it("unbolds part of a bold run, keeping the rest bold", () => {
    const root = editor("<div><b>Hello big world</b></div>");
    toggleMark(root, rangeOf(root, "big"), "b");
    expect(html(root)).toBe("<div><b>Hello </b>big<b> world</b></div>");
  });

  it("unbolds through nested formatting and keeps the italic", () => {
    const root = editor("<div><strong>a <i>bc</i> d</strong></div>");
    toggleMark(root, rangeOf(root, "bc"), "b");
    expect(html(root)).toBe("<div><strong>a </strong><i>bc</i><strong> d</strong></div>");
  });

  it("bolds across lines, one wrapper per line", () => {
    const root = editor("<div>one</div><div>two</div>");
    const r = document.createRange();
    r.setStart(root.firstChild!.firstChild!, 1);
    r.setEnd(root.lastChild!.firstChild!, 2);
    toggleMark(root, r, "b");
    expect(html(root)).toBe("<div>o<b>ne</b></div><div><b>tw</b>o</div>");
  });

  it("toggles at the caret with an invisible character to type into", () => {
    const root = editor("<div>Hello</div>");
    const next = toggleMark(root, caretAt(root, "Hello", 5), "b")!;
    expect(html(root)).toBe("<div>Hello<b>|</b></div>");
    expect(next.collapsed).toBe(true);
    expect(next.startContainer.parentElement?.tagName).toBe("B");
  });

  it("toggles off at the caret inside bold", () => {
    const root = editor("<div><b>Hello</b></div>");
    toggleMark(root, caretAt(root, "Hello", 5), "b");
    expect(html(root)).toBe("<div><b>Hello</b>|</div>");
  });

  it("knows when a mark is on", () => {
    const root = editor("<div><b>Hello</b> world</div>");
    expect(isMarkActive(root, rangeOf(root, "Hello"), "b")).toBe(true);
    expect(isMarkActive(root, rangeOf(root, "world"), "b")).toBe(false);
    expect(activeFormats(root, caretAt(root, "Hello", 2)).b).toBe(true);
  });

  it("merges neighbouring bold runs", () => {
    const root = editor("<div><b>ab</b>cd</div>");
    toggleMark(root, rangeOf(root, "cd"), "b");
    expect(html(root)).toBe("<div><b>abcd</b></div>");
  });
});

describe("remove formatting", () => {
  it("takes off bold, italic, spans and headings but keeps links", () => {
    const root = editor('<h1><b>Big</b> <span>title</span> <a href="https://x.test/">link</a></h1>');
    const r = document.createRange();
    r.selectNodeContents(root);
    clearFormatting(root, r);
    expect(html(root)).toBe('<div>Big title <a href="https://x.test/">link</a></div>');
  });
});

describe("lists", () => {
  it("turns lines into a bulleted list and back", () => {
    const root = editor("<div>one</div><div>two</div><div>three</div>");
    const r = document.createRange();
    r.setStart(root.children[0]!.firstChild!, 0);
    r.setEnd(root.children[1]!.firstChild!, 3);
    toggleList(root, r, "ul");
    expect(html(root)).toBe("<ul><li>one</li><li>two</li></ul><div>three</div>");
    toggleList(root, rangeOf(root, "two"), "ul");
    expect(html(root)).toBe("<ul><li>one</li></ul><div>two</div><div>three</div>");
  });

  it("switches a bulleted list to numbered", () => {
    const root = editor("<ul><li>one</li><li>two</li></ul>");
    const r = document.createRange();
    r.selectNodeContents(root);
    toggleList(root, r, "ol");
    expect(html(root)).toBe("<ol><li>one</li><li>two</li></ol>");
  });

  it("wraps loose text first (the editor's first line is bare text in some browsers)", () => {
    const root = editor("first<div>second</div>");
    toggleList(root, caretAt(root, "first", 2), "ul");
    expect(html(root)).toBe("<ul><li>first</li></ul><div>second</div>");
  });

  it("joins a new item to the list above", () => {
    const root = editor("<ul><li>one</li></ul><div>two</div>");
    toggleList(root, caretAt(root, "two", 0), "ul");
    expect(html(root)).toBe("<ul><li>one</li><li>two</li></ul>");
  });

  it("keeps the caret on the same text", () => {
    const root = editor("<div>alpha</div>");
    const next = toggleList(root, caretAt(root, "alpha", 3), "ol");
    expect(next.startContainer.textContent).toBe("alpha");
    expect(next.startOffset).toBe(3);
  });
});

describe("quote", () => {
  it("quotes lines and unquotes them", () => {
    const root = editor("<div>one</div><div>two</div>");
    toggleQuote(root, caretAt(root, "one", 1));
    expect(html(root)).toBe("<blockquote><div>one</div></blockquote><div>two</div>");
    toggleQuote(root, caretAt(root, "one", 1));
    expect(html(root)).toBe("<div>one</div><div>two</div>");
  });
});

describe("links", () => {
  it("links the selection", () => {
    const root = editor("<div>see the docs here</div>");
    insertLink(root, rangeOf(root, "the docs"), "https://docs.test/");
    expect(html(root)).toBe('<div>see <a href="https://docs.test/">the docs</a> here</div>');
  });

  it("inserts a link at the caret", () => {
    const root = editor("<div>see </div>");
    insertLink(root, caretAt(root, "see ", 4), "https://docs.test/", "docs");
    expect(html(root)).toBe('<div>see <a href="https://docs.test/">docs</a></div>');
  });

  it("removes a link, keeping its text", () => {
    const root = editor('<div><a href="https://x.test/">x</a></div>');
    removeLink(root.querySelector("a")!);
    expect(html(root)).toBe("<div>x</div>");
  });

  it("accepts web and email addresses only", () => {
    expect(normalizeLinkInput("example.com/a")).toBe("https://example.com/a");
    expect(normalizeLinkInput("http://x.test")).toBe("http://x.test/");
    expect(normalizeLinkInput("bob@x.test")).toBe("mailto:bob@x.test");
    expect(normalizeLinkInput("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkInput("data:text/html,x")).toBeNull();
    expect(normalizeLinkInput("nothing")).toBeNull();
  });
});
