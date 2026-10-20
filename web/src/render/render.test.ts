// @vitest-environment jsdom
// The render helpers other than the sanitiser itself: quotes, linkify, CSS,
// URLs, the frame-height estimate, the per-device image allowance.

import { afterEach, describe, expect, it } from "vitest";
import { allowImagesFrom, allowsImagesFrom, forgetImagesFrom, imageAllowanceList } from "./allowance";
import { decodeCssEscapes, sanitizeCss } from "./css";
import { linkify } from "./linkify";
import { estimateFrameHeight } from "./measure";
import { markQuote, QUOTE_ATTR, splitPlainQuote } from "./quotes";
import { sanitizeMessageHtml } from "./sanitize";
import { imageUrl, parseSrcset, safeLinkUrl } from "./urls";

function body(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html").body;
}

const marked = (el: Element) => Array.from(el.querySelectorAll(`[${QUOTE_ATTR}]`), (e) => e.textContent?.trim() ?? "");

describe("quote detection (HTML)", () => {
  it("folds Gmail's trailing quote, attribution included", () => {
    const b = body('<div dir="ltr">Sounds good.</div><br><div class="gmail_quote"><div class="gmail_attr">On Mon, Bob wrote:<br></div><blockquote class="gmail_quote">Lunch?<div class="gmail_quote">older</div></blockquote></div>');
    expect(markQuote(b)).toBe(true);
    expect(b.querySelectorAll(`[${QUOTE_ATTR}]`)).toHaveLength(1);
    expect(marked(b)[0]).toContain("On Mon, Bob wrote:");
  });

  it("folds Thunderbird's prefix and cite blockquote", () => {
    const b = body('<p>Yes.</p><div class="moz-cite-prefix">On 6/10/26 Bob wrote:<br></div><blockquote type="cite">Old text</blockquote>');
    expect(markQuote(b)).toBe(true);
    expect(marked(b)).toEqual(["On 6/10/26 Bob wrote:", "Old text"]);
  });

  it("folds a bare 'On … wrote:' line before a blockquote, wrapping the text node", () => {
    const b = body("<p>Fine by me.</p>On Tue, 6 Oct 2026, Carol &lt;c@x.test&gt; wrote:<br><blockquote>The plan</blockquote>");
    expect(markQuote(b)).toBe(true);
    expect(marked(b)[0]).toBe("On Tue, 6 Oct 2026, Carol <c@x.test> wrote:");
  });

  it("does not fold a message that is only a quote, nor a quote with a reply under it", () => {
    expect(markQuote(body('<div class="gmail_quote">On Mon, Bob wrote:<blockquote>all of it</blockquote></div>'))).toBe(false);
    expect(markQuote(body('<p>See inline.</p><blockquote type="cite">Q1?</blockquote><p>Answer one.</p>'))).toBe(false);
  });

  it("marks through the sanitiser, and a message cannot pre-mark itself", () => {
    const clean = sanitizeMessageHtml('<p data-postern-quote>forged</p><div>Reply</div><div class="gmail_quote">On X wrote:<blockquote>q</blockquote></div>');
    expect(clean.hasQuote).toBe(true);
    expect(marked(clean.body)).toEqual(["On X wrote:q"]);
  });
});

describe("quote detection (plain text)", () => {
  it("splits the trailing > lines and their attribution", () => {
    const text = "Thanks, see you then.\n\nOn Mon, 21 Sep 2026 10:15 UTC, Bob Baker <bob@postern.test> wrote:\n> Lunch at noon?\n>\n> Bob\n";
    const split = splitPlainQuote(text);
    expect(split.main).toBe("Thanks, see you then.");
    expect(split.quote?.startsWith("On Mon, 21 Sep 2026")).toBe(true);
  });

  it("handles an attribution wrapped over two lines, and Outlook's Original Message", () => {
    expect(splitPlainQuote("Ok.\n\nOn Mon, 21 Sep 2026 at 10:15, Robert Baker-Smith <bob@postern.test>\nwrote:\n> hi").main).toBe("Ok.");
    expect(splitPlainQuote("Ok.\n-----Original Message-----\nFrom: x").quote).toBe("-----Original Message-----\nFrom: x");
  });

  it("leaves text without a trailing quote, or only a quote, whole", () => {
    expect(splitPlainQuote("> a\nmy answer").quote).toBeNull();
    expect(splitPlainQuote("> all quoted\n> here").quote).toBeNull();
  });
});

describe("linkify", () => {
  it("links http, https, mailto, www. and bare addresses; trims sentence punctuation", () => {
    const runs = linkify("See https://a.test/x?y=1. Or (www.b.test/p), mail bob@c.test, mailto:d@e.test!");
    expect(runs.filter((r) => r.kind === "link").map((r) => (r.kind === "link" ? [r.text, r.href] : null))).toEqual([
      ["https://a.test/x?y=1", "https://a.test/x?y=1"],
      ["www.b.test/p", "https://www.b.test/p"],
      ["bob@c.test", "mailto:bob@c.test"],
      ["mailto:d@e.test", "mailto:d@e.test"],
    ]);
    expect(runs.map((r) => r.text).join("")).toBe("See https://a.test/x?y=1. Or (www.b.test/p), mail bob@c.test, mailto:d@e.test!");
  });

  it("keeps a closing bracket the URL opened", () => {
    const [, link] = linkify("x https://w.test/Foo_(bar) y");
    expect(link).toEqual({ kind: "link", text: "https://w.test/Foo_(bar)", href: "https://w.test/Foo_(bar)" });
  });

  it("never links javascript:, data: or other schemes", () => {
    const runs = linkify("javascript:alert(1) data:text/html,x vbscript:x file:///etc/passwd");
    expect(runs.every((r) => r.kind === "text")).toBe(true);
  });
});

describe("CSS", () => {
  it("decodes escapes", () => {
    expect(decodeCssEscapes("\\75 rl(\\\"x\\\")")).toBe('url("x")');
    expect(decodeCssEscapes("\\0")).toBe("\ufffd");
  });

  it("blocks remote url() and counts it, keeps cid: as data:, drops relative", () => {
    let blocked = 0;
    const out = sanitizeCss("a{background:url(https://t.test/a.png)} b{background:url('cid:x@y')} c{background:url(rel.png)}", {
      allowRemote: false,
      cidUrls: new Map([["x@y", "data:image/png;base64,AAAA"]]),
      onBlocked: () => blocked++,
    });
    expect(out).toBe('a{background:none} b{background:url("data:image/png;base64,AAAA")} c{background:none}');
    expect(blocked).toBe(1);
  });

  it("drops @import, @font-face, @namespace and image-set", () => {
    const out = sanitizeCss('@import "x.css"; @font-face{font-family:F;src:url(https://f.test/f.woff)} @namespace url(x); p{background:image-set("a.png" 1x)}', { allowRemote: true });
    expect(out).not.toMatch(/@import|@font-face|@namespace|image-set|f\.test|a\.png/);
  });
});

describe("URLs", () => {
  it("normalises link schemes with the browser's parser", () => {
    expect(safeLinkUrl("java\tscript:alert(1)")).toBeNull();
    expect(safeLinkUrl("  JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeLinkUrl("DATA:text/html,x")).toBeNull();
    expect(safeLinkUrl("relative/path")).toBeNull();
    expect(safeLinkUrl("https://ok.test")).toBe("https://ok.test/");
  });

  it("decides images: blocked, kept, dropped", () => {
    expect(imageUrl("https://t.test/a.png", { allowRemote: false })).toEqual({ kind: "blocked" });
    expect(imageUrl("http://t.test/a.png", { allowRemote: true })).toEqual({ kind: "keep", url: "https://t.test/a.png" });
    expect(imageUrl("data:image/svg+xml;base64,PHN2Zz4=", { allowRemote: true })).toEqual({ kind: "drop" });
    expect(imageUrl("ftp://t.test/a.png", { allowRemote: true })).toEqual({ kind: "drop" });
  });

  it("parses srcset with data: commas", () => {
    expect(parseSrcset("a.png 1x,b.png 2x, data:image/png;base64,AA,BB 3x")).toEqual([
      { url: "a.png", descriptor: "1x" },
      { url: "b.png", descriptor: "2x" },
      { url: "data:image/png;base64,AA,BB", descriptor: "3x" },
    ]);
  });
});

describe("the frame-height estimate", () => {
  const measure = (text: string) => text.length * 8;
  const estimate = (html: string, width = 600, foldQuote = false) => estimateFrameHeight(sanitizeMessageHtml(html).body, { width, foldQuote, measure });

  it("grows with text and with narrower frames", () => {
    const short = estimate("<p>Hello.</p>");
    const long = estimate(`<p>${"word ".repeat(400)}</p>`);
    expect(long).toBeGreaterThan(short);
    expect(estimate(`<p>${"word ".repeat(400)}</p>`, 300)).toBeGreaterThan(long);
  });

  it("counts images by their size attributes, scaled to the width", () => {
    const tall = estimate('<img src="data:image/png;base64,AAAA" width="300" height="900">');
    expect(tall).toBeGreaterThan(900);
    expect(estimate('<img src="data:image/png;base64,AAAA" width="1200" height="900">', 600)).toBeLessThan(600);
  });

  it("leaves the folded quote out", () => {
    const html = `<div>Reply</div><div class="gmail_quote">On X wrote:<blockquote>${"<p>old</p>".repeat(30)}</blockquote></div>`;
    expect(estimate(html, 600, true)).toBeLessThan(estimate(html, 600, false) / 3);
  });

  it("has a floor", () => {
    expect(estimate("")).toBeGreaterThanOrEqual(48);
  });
});

describe("the per-device image allowance", () => {
  afterEach(() => window.localStorage.clear());

  it("is per account, lower-cased, and survives in localStorage", () => {
    allowImagesFrom("alice@postern.test", "News@Shop.test");
    expect(allowsImagesFrom("alice@postern.test", "news@shop.test")).toBe(true);
    expect(allowsImagesFrom("bob@postern.test", "news@shop.test")).toBe(false);
    expect(JSON.parse(window.localStorage.getItem("postern.images.alice@postern.test") ?? "[]")).toEqual(["news@shop.test"]);
    forgetImagesFrom("alice@postern.test", "news@shop.test");
    expect(imageAllowanceList("alice@postern.test")).toEqual([]);
  });
});
