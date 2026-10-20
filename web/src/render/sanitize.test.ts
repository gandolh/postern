// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { HOSTILE_FIXTURES } from "./hostileFixtures";
import { QUOTE_ATTR } from "./quotes";
import { sanitizeMessageHtml, type SanitizedHtml } from "./sanitize";
import { buildSrcdoc, MESSAGE_FRAME_SANDBOX } from "./srcdoc";

/** Everything the frame would receive. */
function srcdocOf(clean: SanitizedHtml, allowRemote = false): string {
  return buildSrcdoc(clean, { foldQuote: false, theme: "light", allowRemote });
}

/** Parse the frame document the way the frame will (a detached document), to inspect it. */
function frameDoc(srcdoc: string): Document {
  return new DOMParser().parseFromString(srcdoc, "text/html");
}

/** Every URL the frame document could fetch or navigate to, by attribute. */
function urlsIn(doc: Document): string[] {
  const out: string[] = [];
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (["src", "srcset", "href", "background", "poster", "action", "formaction", "data", "xlink:href", "cite"].includes(attr.name)) {
        out.push(attr.value);
      }
    }
  }
  return out;
}

const DANGEROUS_TAGS = ["script", "iframe", "frame", "object", "embed", "form", "input", "button", "select", "textarea", "base", "link", "svg", "math", "template", "video", "audio"];

describe("the hostile seed set", () => {
  it("has all 17 fixtures", () => {
    expect(HOSTILE_FIXTURES.map((f) => f.slug)).toHaveLength(17);
  });

  for (const fixture of HOSTILE_FIXTURES) {
    const html = fixture.html;
    if (html === null) continue;

    describe(fixture.slug, () => {
      const clean = sanitizeMessageHtml(html);
      const srcdoc = srcdocOf(clean);
      const doc = frameDoc(srcdoc);
      const body = doc.body;

      it("keeps no script, frame, form control or dangerous element in the body", () => {
        for (const tag of DANGEROUS_TAGS) expect(body.querySelector(tag), tag).toBeNull();
        // The only <meta> elements are Postern's own three, in the head.
        expect(Array.from(doc.querySelectorAll("meta")).map((m) => m.getAttribute("http-equiv") ?? m.getAttribute("name") ?? "charset")).toEqual([
          "charset",
          "Content-Security-Policy",
          "referrer",
          "color-scheme",
        ]);
      });

      it("keeps no event handler attribute", () => {
        for (const el of Array.from(doc.querySelectorAll("*"))) {
          for (const attr of Array.from(el.attributes)) expect(attr.name.startsWith("on"), `${el.nodeName} ${attr.name}`).toBe(false);
        }
      });

      it("keeps no URL but https, mailto, #fragments and raster data: images", () => {
        for (const url of urlsIn(doc)) {
          expect(/^(https:|mailto:|#|data:image\/(png|jpeg|gif|webp|avif|bmp);base64,)/i.test(url), url).toBe(true);
        }
      });

      it("loads nothing remote before Display images", () => {
        for (const el of Array.from(body.querySelectorAll("[src], [srcset], [background], [poster]"))) {
          for (const name of ["src", "srcset", "background", "poster"]) {
            const value = el.getAttribute(name);
            if (value !== null) expect(value.startsWith("data:"), `${el.nodeName} ${name}=${value}`).toBe(true);
          }
        }
        const styles = [...Array.from(doc.querySelectorAll("style"), (s) => s.textContent ?? ""), ...Array.from(body.querySelectorAll("[style]"), (e) => e.getAttribute("style") ?? "")];
        for (const css of styles) {
          expect(css, "remote url() in CSS").not.toMatch(/url\(\s*["']?\s*(https?:)?\/\//i);
          expect(css, "@import").not.toMatch(/@import/i);
          expect(css, "@font-face").not.toMatch(/@font-face/i);
        }
      });

      it("opens every link in a new tab without opener or referrer", () => {
        for (const a of Array.from(body.querySelectorAll("a[href], area[href]"))) {
          if (a.getAttribute("href")?.startsWith("#")) continue;
          expect(a.getAttribute("target")).toBe("_blank");
          expect(a.getAttribute("rel")).toBe("noopener noreferrer");
        }
      });

      it("never mentions the canary in anything that could run", () => {
        // The canary may survive as visible text (it is in the fixtures' prose), never in an attribute or a style.
        for (const el of Array.from(doc.querySelectorAll("*"))) {
          for (const attr of Array.from(el.attributes)) expect(attr.value).not.toContain("__POSTERN_PWNED");
        }
        for (const s of Array.from(doc.querySelectorAll("style"))) expect(s.textContent).not.toContain("__POSTERN_PWNED");
      });
    });
  }
});

describe("fixture specifics", () => {
  const get = (slug: string) => {
    const f = HOSTILE_FIXTURES.find((x) => x.slug === slug);
    if (!f?.html) throw new Error(`no html for ${slug}`);
    return f.html;
  };

  it("script-tag: every script is gone, the text stays", () => {
    const clean = sanitizeMessageHtml(get("script-tag"));
    expect(clean.bodyHtml).not.toMatch(/<script/i);
    expect(clean.bodyHtml).toContain("Nothing on this page may run");
    expect(clean.bodyHtml).toContain("cell");
  });

  it("base-href: no <base>, relative links and images lose their URL, the form is gone", () => {
    const clean = sanitizeMessageHtml(get("base-href"));
    const all = clean.headHtml + clean.bodyHtml;
    expect(all).not.toMatch(/<base/i);
    expect(all).not.toContain("account/settings");
    expect(all).not.toContain("pixel.gif");
    expect(all).not.toMatch(/<form/i);
  });

  it("javascript-link: every variant loses its href, including the image map's area", () => {
    const clean = sanitizeMessageHtml(get("javascript-link"));
    for (const el of Array.from(clean.body.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) expect(attr.value.toLowerCase()).not.toContain("javascript");
    }
    expect(clean.body.querySelectorAll("a[href], area[href]")).toHaveLength(0);
    // The map image is remote: blocked.
    expect(clean.blockedRemote).toBe(1);
  });

  it("data-html-link: data: documents and the data: SVG image are gone", () => {
    const clean = sanitizeMessageHtml(get("data-html-link"));
    for (const el of Array.from(clean.body.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) if (attr.name !== "alt") expect(attr.value.toLowerCase()).not.toContain("data:");
    }
    expect(clean.body.querySelectorAll("a[href], img[src]")).toHaveLength(0);
  });

  it("meta-refresh: no meta survives from the message", () => {
    const clean = sanitizeMessageHtml(get("meta-refresh"));
    expect(clean.headHtml + clean.bodyHtml).not.toMatch(/<meta|http-equiv|evil\.test/i);
  });

  it("css-overlay: fixed and absolute positions become static, the form is gone", () => {
    const clean = sanitizeMessageHtml(get("css-overlay"));
    expect(clean.headHtml).not.toMatch(/position\s*:\s*(fixed|absolute)/i);
    expect(clean.headHtml).toMatch(/position:static/);
    expect(clean.bodyHtml).not.toMatch(/<form|<input/i);
    // The frame's own override keeps the body scrollable whatever the message says.
    expect(srcdocOf(clean)).toContain("html body{overflow:auto!important");
  });

  it("event-handlers: handlers, autofocus and the input are gone", () => {
    const clean = sanitizeMessageHtml(get("event-handlers"));
    expect(clean.bodyHtml).not.toMatch(/\son\w+=/i);
    expect(clean.bodyHtml).not.toMatch(/autofocus|<input/i);
    expect(clean.blockedRemote).toBe(1);
  });

  it("form-post: forms, buttons and inputs are gone", () => {
    const clean = sanitizeMessageHtml(get("form-post"));
    expect(clean.bodyHtml).not.toMatch(/<form|<input|<button|formaction|evil\.test/i);
  });

  it("iframe-object-embed: no sub-documents", () => {
    const clean = sanitizeMessageHtml(get("iframe-object-embed"));
    expect(clean.bodyHtml).not.toMatch(/<iframe|<object|<embed|srcdoc|evil\.test/i);
  });

  it("svg-inline-script: the SVG is gone with its script, handlers, xlink and foreignObject", () => {
    const clean = sanitizeMessageHtml(get("svg-inline-script"));
    expect(clean.bodyHtml).not.toMatch(/<svg|<script|foreignobject|xlink|onbegin|onload|evil\.test/i);
  });

  it("svg-attachment: the inline SVG part is not inlined (cid: of a non-raster part stays unresolved)", () => {
    const clean = sanitizeMessageHtml(get("svg-attachment"), { cidUrls: new Map() });
    expect(clean.bodyHtml).not.toMatch(/cid:|<object|<svg/i);
    expect(clean.body.querySelector("img")?.getAttribute("alt")).toBe("chart");
  });

  it("remote-content: every remote URL is blocked, counted, and restored on request", () => {
    const clean = sanitizeMessageHtml(get("remote-content"));
    const all = clean.headHtml + clean.bodyHtml;
    expect(all).not.toContain("track.evil.test");
    // pixel, small.png + its 2 srcset candidates, picture source, fallback, css bg, inline bg (poster/video dropped with <video>).
    expect(clean.blockedRemote).toBe(8);

    const shown = sanitizeMessageHtml(get("remote-content"), { allowRemote: true });
    expect(shown.blockedRemote).toBe(0);
    expect(shown.bodyHtml).toContain('src="https://track.evil.test/pixel.gif?u=alice&amp;c=open"');
    expect(shown.bodyHtml).toContain("https://track.evil.test/1x.png 1x, https://track.evil.test/2x.png 2x");
    expect(shown.bodyHtml).toContain('srcset="https://track.evil.test/wide.png"');
    expect(shown.headHtml).toContain('url("https://track.evil.test/css-bg.png?u=alice")');
    // Fonts and imports stay out even then.
    expect(shown.headHtml).not.toMatch(/@import|@font-face|leak\.woff2|imported\.css/);
    expect(srcdocOf(shown, true)).toContain("img-src data: https:");
  });

  it("link-text-mismatch: every link is flagged with its real host", () => {
    const clean = sanitizeMessageHtml(get("link-text-mismatch"));
    expect(clean.suspiciousLinks.map((l) => [l.host, l.reason])).toEqual([
      ["evil.test", "mismatch"],
      ["evil.test", "mismatch"],
      ["evil.test", "mismatch"],
      ["sub.evil.test", "mismatch"],
    ]);
    expect(clean.body.querySelectorAll(".postern-link-flag")).toHaveLength(4);
  });

  it("punycode-domain: every look-alike host is flagged", () => {
    const clean = sanitizeMessageHtml(get("punycode-domain"));
    expect(clean.suspiciousLinks).toHaveLength(4);
    for (const link of clean.suspiciousLinks) expect(link.host).toMatch(/xn--/);
  });

  it("forged-sender: plain prose survives", () => {
    const clean = sanitizeMessageHtml(get("forged-sender"));
    expect(clean.body.textContent).toContain("the real address is attacker@evil.test");
  });
});

describe("sanitiser rules", () => {
  it("drops relative, protocol-less and odd-scheme links; keeps https, mailto and fragments", () => {
    const clean = sanitizeMessageHtml(
      '<a href="relative/x">a</a><a href="vbscript:x">b</a><a href="file:///etc/passwd">c</a><a href="tel:123">d</a>' +
        '<a href="https://ok.test/p?q=1">e</a><a href="mailto:x@y.test">f</a><a href="#top">g</a><a href=" HTTPS://Up.TEST ">h</a>',
    );
    const hrefs = Array.from(clean.body.querySelectorAll("a"), (a) => a.getAttribute("href"));
    expect(hrefs).toEqual([null, null, null, null, "https://ok.test/p?q=1", "mailto:x@y.test", "#top", "https://up.test/"]);
    expect(clean.body.querySelector('a[href="#top"]')?.hasAttribute("target")).toBe(false);
  });

  it("upgrades remote images to https when restored, and protocol-relative ones too", () => {
    const shown = sanitizeMessageHtml('<img src="http://a.test/x.png"><img src="//b.test/y.png">', { allowRemote: true });
    expect(Array.from(shown.body.querySelectorAll("img"), (i) => i.getAttribute("src"))).toEqual(["https://a.test/x.png", "https://b.test/y.png"]);
  });

  it("resolves cid: images to the data: URLs it is given, and drops unknown ones", () => {
    const data = "data:image/png;base64,iVBORw0KGgo=";
    const clean = sanitizeMessageHtml('<img src="cid:one@x"><img src="cid:two@x"><div style="background:url(cid:one@x)">x</div>', {
      cidUrls: new Map([["one@x", data]]),
    });
    const imgs = Array.from(clean.body.querySelectorAll("img"));
    expect(imgs[0]?.getAttribute("src")).toBe(data);
    expect(imgs[1]?.hasAttribute("src")).toBe(false);
    expect(clean.body.querySelector("div")?.getAttribute("style")).toContain(`url("${data}")`);
    expect(clean.blockedRemote).toBe(0);
  });

  it("drops non-raster data: images (SVG documents)", () => {
    const clean = sanitizeMessageHtml('<img src="data:image/svg+xml;base64,PHN2Zz4="><img src="data:text/html,x">');
    expect(clean.body.querySelectorAll("img[src]")).toHaveLength(0);
  });

  it("decodes CSS escapes before looking for url(), and drops escaped remote URLs", () => {
    const clean = sanitizeMessageHtml('<div style="background:\\75 rl(https://e.test/x.png)">x</div><style>p{background:U\\52L(//e.test/y.png)}</style>');
    expect(clean.bodyHtml + clean.headHtml).not.toContain("e.test");
    expect(clean.blockedRemote).toBe(2);
  });

  it("neutralises position through var() and comments", () => {
    const clean = sanitizeMessageHtml('<style>.a{--p:fixed;position:var(--p)} .b{position/**/:/**/absolute !important}</style><p>x</p>');
    expect(clean.headHtml).not.toMatch(/position\s*:\s*(var|absolute)/);
  });

  it("removes any < from CSS, so a style block cannot end early", () => {
    const clean = sanitizeMessageHtml("<style>p{color:red}\\3c /style\\3e \\3c img src=x onerror=alert(1)\\3e</style><p>x</p>");
    expect(clean.headHtml + clean.bodyHtml).not.toMatch(/<img/);
    expect(clean.headHtml.replace(/^<style>|<\/style>$/g, "")).not.toContain("<");
    // Parsed as the frame will parse it, the style block is still one element with only CSS in it.
    const doc = new DOMParser().parseFromString(srcdocOf(clean), "text/html");
    expect(doc.body.querySelector("img")).toBeNull();
  });

  it("strips Postern's own marker attributes from the message", () => {
    const clean = sanitizeMessageHtml(`<p ${QUOTE_ATTR}>hide me</p><p data-postern-x="1">y</p>`);
    expect(clean.bodyHtml).not.toContain("data-postern");
  });

  it("notices a message's own colours", () => {
    expect(sanitizeMessageHtml("<p>plain</p>").ownColours).toBe(false);
    expect(sanitizeMessageHtml('<p style="color:#123">x</p>').ownColours).toBe(true);
    expect(sanitizeMessageHtml('<table bgcolor="#eee"><tr><td>x</td></tr></table>').ownColours).toBe(true);
  });
});

describe("the srcdoc", () => {
  it("uses exactly the sandbox security.md names", () => {
    expect(MESSAGE_FRAME_SANDBOX).toBe("allow-popups allow-popups-to-escape-sandbox");
    const tokens = MESSAGE_FRAME_SANDBOX.split(/\s+/).sort();
    expect(tokens).toEqual(["allow-popups", "allow-popups-to-escape-sandbox"]);
    for (const forbidden of ["allow-scripts", "allow-same-origin", "allow-forms", "allow-top-navigation", "allow-top-navigation-by-user-activation", "allow-modals"]) {
      expect(tokens).not.toContain(forbidden);
    }
  });

  it("carries its own CSP, no-referrer, and the quote fold", () => {
    const clean = sanitizeMessageHtml('<div>reply</div><div class="gmail_quote">On Mon, Bob wrote:<blockquote>old</blockquote></div>');
    const folded = buildSrcdoc(clean, { foldQuote: true, theme: "dark", allowRemote: false });
    expect(folded).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';`);
    expect(folded).toContain('<meta name="referrer" content="no-referrer">');
    expect(folded).toContain(`[${QUOTE_ATTR}]{display:none!important}`);
    expect(folded).toContain("color-scheme:dark");
    const open = buildSrcdoc(clean, { foldQuote: false, theme: "dark", allowRemote: false });
    expect(open).not.toContain(`[${QUOTE_ATTR}]{display:none`);
  });
});
