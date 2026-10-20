// @vitest-environment jsdom
// Paste is untrusted: whatever arrives on the clipboard (or in a draft from
// the server) must come out of sanitizeForEditor with nothing that can run,
// load, submit or position itself, before it reaches the editor (the app's DOM).

import { describe, expect, it } from "vitest";
import { HOSTILE_FIXTURES } from "../../render/hostileFixtures";
import { CID_ATTR, dataUrlToFile, sanitizeForEditor, textToFragment } from "./sanitize";
import { serializeEditor } from "./serialize";

const DOT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function holder(fragment: DocumentFragment): HTMLDivElement {
  const div = document.createElement("div");
  div.append(fragment);
  return div;
}

/** Every element and attribute left, as "tag[attr,attr]". */
function shape(root: Element): string[] {
  return Array.from(root.querySelectorAll("*"), (el) => `${el.nodeName.toLowerCase()}[${Array.from(el.attributes, (a) => a.name).join(",")}]`);
}

const FORBIDDEN = /^(script|style|iframe|frame|object|embed|form|input|button|textarea|select|svg|math|link|meta|base|template|video|audio|noscript)\[/;

describe("pasted HTML", () => {
  it("drops scripts, handlers, frames, forms, SVG and remote images", () => {
    const { fragment, pending } = sanitizeForEditor(
      `<p onclick="x()">Hi<script>alert(1)</script></p><img src="x" onerror="alert(2)"><iframe src="https://evil.test"></iframe>
       <form action="https://evil.test"><input name="q"><button>Go</button></form><svg onload="alert(3)"><circle r="5"/></svg>
       <img src="https://track.evil.test/p.gif" alt="t"><img src="//evil.test/a.png"><img src="blob:https://evil.test/x"><a href="javascript:alert(4)">j</a>
       <a href="data:text/html,x">d</a><a href="https://ok.test/" target="_top" onmouseover="x()">ok</a><style>body{display:none}</style>`,
      { mode: "paste" },
    );
    const root = holder(fragment);
    expect(pending).toHaveLength(0);
    expect(shape(root).filter((s) => FORBIDDEN.test(s))).toEqual([]);
    expect(root.querySelectorAll("img")).toHaveLength(0);
    expect(Array.from(root.querySelectorAll("a"), (a) => a.getAttribute("href"))).toEqual([null, null, "https://ok.test/"]);
    for (const el of Array.from(root.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) expect(attr.name).not.toMatch(/^on|^style$|^target$|^id$/);
    }
    expect(root.textContent).toContain("Hi");
  });

  it("keeps bold, italic and underline written as styles, and drops positioning", () => {
    const { fragment } = sanitizeForEditor(
      `<span style="font-weight:700">b</span> <span style="font-style:italic">i</span> <span style="text-decoration:underline">u</span> <div style="position:fixed;top:0;left:0;width:100%">over</div>`,
      { mode: "paste" },
    );
    const root = holder(fragment);
    expect(root.querySelector("b")?.textContent).toBe("b");
    expect(root.querySelector("i")?.textContent).toBe("i");
    expect(root.querySelector("u")?.textContent).toBe("u");
    expect(root.querySelector("[style]")).toBeNull();
    expect(root.querySelector("div")?.textContent).toBe("over");
  });

  it("keeps pasted data: images only to upload them as inline parts", () => {
    const { fragment, pending } = sanitizeForEditor(`<p>x<img src="${DOT}" alt="dot"><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="></p>`, { mode: "paste" });
    const root = holder(fragment);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.img.getAttribute("alt")).toBe("dot");
    expect(root.querySelectorAll("img")).toHaveLength(1);
    const file = dataUrlToFile(pending[0]!.dataUrl, "pasted");
    expect(file?.type).toBe("image/png");
    expect(file?.name).toBe("pasted.png");
    expect(dataUrlToFile("data:image/svg+xml;base64,PHN2Zz4=", "x")).toBeNull();
  });

  it("keeps only Postern's and Gmail's quote and signature classes", () => {
    const { fragment } = sanitizeForEditor(`<div class="gmail_quote evil" data-postern-cid="forged" id="x">q</div>`, { mode: "paste" });
    const div = holder(fragment).querySelector("div")!;
    expect(div.getAttribute("class")).toBe("gmail_quote");
    expect(div.hasAttribute(CID_ATTR)).toBe(false);
    expect(div.hasAttribute("id")).toBe(false);
  });

  it("collapses source whitespace the way a browser renders it", () => {
    const { fragment } = sanitizeForEditor(`<div>\n  <p>one\n   two</p>\n  <p>three</p>\n</div><pre>a\n  b</pre>`, { mode: "paste" });
    const root = holder(fragment);
    expect(root.querySelector("p")?.textContent).toBe("one two");
    expect(root.querySelector("div")?.childNodes).toHaveLength(2);
    expect(root.querySelector("pre")?.textContent).toBe("a\n  b");
  });

  it("leaves nothing dangerous in any of the hostile seed messages", () => {
    expect(HOSTILE_FIXTURES.length).toBeGreaterThan(0);
    for (const fixture of HOSTILE_FIXTURES) {
      if (!fixture.html) continue;
      const root = holder(sanitizeForEditor(fixture.html, { mode: "paste" }).fragment);
      expect(shape(root).filter((s) => FORBIDDEN.test(s)), fixture.slug).toEqual([]);
      for (const el of Array.from(root.querySelectorAll("*"))) {
        for (const attr of Array.from(el.attributes)) {
          expect(attr.name, `${fixture.slug}: ${el.nodeName} ${attr.name}`).not.toMatch(/^on|^style$|^srcdoc$|^formaction$/);
          if (attr.name === "href") expect(attr.value, fixture.slug).toMatch(/^(https?:|mailto:)/);
          if (attr.name === "src") expect(attr.value, fixture.slug).toMatch(/^data:image\/(png|jpeg|gif|webp);base64,/);
        }
      }
    }
  });
});

describe("loading a draft", () => {
  it("shows the draft's own inline images through object URLs, and nothing remote", () => {
    const cidUrls = new Map([["img1@postern", "blob:http://localhost/1"]]);
    const { fragment } = sanitizeForEditor(`<div>a<img src="cid:IMG1@postern" alt="dot"><img src="cid:other@x"><img src="https://evil.test/x.png"></div>`, { mode: "load", cidUrls });
    const imgs = holder(fragment).querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]?.getAttribute("src")).toBe("blob:http://localhost/1");
    expect(imgs[0]?.getAttribute(CID_ATTR)).toBe("img1@postern");
  });

  it("drops pasted data: images (only paste may bring them, to upload)", () => {
    const { fragment } = sanitizeForEditor(`<img src="${DOT}">`, { mode: "load" });
    expect(holder(fragment).querySelector("img")).toBeNull();
  });

  it("round-trips the composer's own output", () => {
    const html = `<div>Hello <b>Bob</b></div><ul><li>one</li></ul><blockquote style="margin:0px">q</blockquote><div><img src="cid:a@postern" alt="pic"></div>`;
    const root = holder(sanitizeForEditor(html, { mode: "load", cidUrls: new Map([["a@postern", "blob:x"]]) }).fragment);
    expect(serializeEditor(root).html).toBe(
      `<div>Hello <b>Bob</b></div><ul><li>one</li></ul><blockquote style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">q</blockquote><div><img src="cid:a@postern" alt="pic"></div>`,
    );
  });
});

describe("plain text", () => {
  it("becomes one line per div, as text", () => {
    const root = holder(textToFragment("a <b>\n\nc"));
    expect(root.querySelectorAll("b")).toHaveLength(0);
    expect(Array.from(root.children, (d) => d.textContent)).toEqual(["a <b>", "", "c"]);
  });
});
