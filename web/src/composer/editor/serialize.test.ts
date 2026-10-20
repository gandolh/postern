// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CID_ATTR } from "./sanitize";
import { serializeEditor } from "./serialize";

/** Build editor DOM from literal test markup (not message HTML). */
function editor(html: string): HTMLDivElement {
  const root = document.createElement("div");
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  root.append(...Array.from(parsed.body.childNodes, (n) => document.importNode(n, true)));
  return root;
}

describe("the HTML Postern sends", () => {
  it("keeps the allowed structure and drops whatever the browser added", () => {
    const root = editor(`<div id="x" style="color:red" data-foo="1">Hi <strong class="c">Bob</strong> <span style="font-size:20px">and</span> <font color="red">Carol</font></div>`);
    expect(serializeEditor(root).html).toBe("<div>Hi <b>Bob</b> and Carol</div>");
  });

  it("sends images as cid: references and drops images it did not upload", () => {
    const root = editor(`<div><img src="blob:http://localhost/1" ${CID_ATTR}="a@postern" alt="pic" width="40"><img src="https://evil.test/x.png"></div>`);
    const out = serializeEditor(root);
    expect(out.html).toBe('<div><img src="cid:a@postern" alt="pic" width="40"></div>');
    expect(out.cids).toEqual(["a@postern"]);
    expect(out.text).toBe("[image: pic]");
  });

  it("keeps safe links only", () => {
    const root = editor(`<a href="https://ok.test/">ok</a> <a href="javascript:alert(1)">bad</a> <a href="mailto:bob@x.test">Bob</a>`);
    expect(serializeEditor(root).html).toBe('<a href="https://ok.test/">ok</a> bad <a href="mailto:bob@x.test">Bob</a>');
  });

  it("escapes text and removes the caret's invisible characters", () => {
    const root = editor("<div>a &lt;script&gt; &amp; b\u200b</div>");
    expect(serializeEditor(root).html).toBe("<div>a &lt;script&gt; &amp; b</div>");
  });

  it("gives quotes Gmail's border", () => {
    expect(serializeEditor(editor("<blockquote>q</blockquote>")).html).toContain('style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"');
  });
});

describe("the text/plain alternative", () => {
  it("has a line per block, bullets, numbers and quote marks", () => {
    const root = editor(
      `<div>Hello Bob,</div><div><br></div><ul><li>one</li><li>two</li></ul><ol start="3"><li>three</li><li>four</li></ol><blockquote><div>quoted</div><div>more</div></blockquote><div>See <a href="https://docs.test/">the docs</a> or https://x.test/</div>`,
    );
    expect(serializeEditor(root).text).toBe(["Hello Bob,", "", "- one", "- two", "3. three", "4. four", "> quoted", "> more", "See the docs <https://docs.test/> or https://x.test/"].join("\n"));
  });

  it('keeps the "-- " signature separator', () => {
    const root = editor(`<div>Hi</div><div><br></div><div class="gmail_signature postern_signature">-- <br>Alice</div>`);
    const out = serializeEditor(root);
    expect(out.text).toBe("Hi\n\n-- \nAlice");
    expect(out.html).toContain('<div class="gmail_signature postern_signature">-- <br>Alice</div>');
  });

  it("leaves the quote and the signature out of what the user wrote", () => {
    const root = editor(`<div>The file is below.</div><div class="postern_signature">-- <br>Alice, see attached CV</div><div class="gmail_quote postern_quote"><div class="gmail_attr">On Tue, Bob wrote:<br></div><blockquote>I attached it</blockquote></div>`);
    const out = serializeEditor(root);
    expect(out.ownText).toBe("The file is below.");
    expect(out.text).toContain("> I attached it");
  });
});
