import { describe, expect, it } from "vitest";
import type { EmailBodyPart } from "../types/mail.js";
import {
  baseSubject,
  buildBody,
  buildDraftEmail,
  dedupeAddresses,
  draftParts,
  formatAddress,
  forwardAttachments,
  forwardQuote,
  forwardSubject,
  isValidEmail,
  mentionsAttachment,
  newMessageId,
  parseAddressList,
  quoteAttribution,
  quotePlainText,
  referencedCids,
  replyIdentityEmail,
  replyQuote,
  replyRecipients,
  replySubject,
  textToHtml,
  threadingHeaders,
  MAX_REFERENCES,
} from "./index.js";

const bob = { name: "Bob Baker", email: "bob@postern.test" };
const alice = { name: "Alice Archer", email: "alice@postern.test" };
const carol = { name: "Carol", email: "carol@example.org" };
const dave = { name: null, email: "dave@example.org" };

describe("subjects", () => {
  it("adds Re: once", () => {
    expect(replySubject("Lisbon in May?")).toBe("Re: Lisbon in May?");
    expect(replySubject("Re: Lisbon in May?")).toBe("Re: Lisbon in May?");
    expect(replySubject("RE: Lisbon")).toBe("RE: Lisbon");
    expect(replySubject("re:Lisbon")).toBe("re:Lisbon");
    expect(replySubject("Re[2]: Lisbon")).toBe("Re[2]: Lisbon");
    expect(replySubject("  Lisbon  ")).toBe("Re: Lisbon");
  });

  it("replies to a forward as Gmail does", () => {
    expect(replySubject("Fwd: Lisbon")).toBe("Re: Fwd: Lisbon");
  });

  it("handles an empty subject", () => {
    expect(replySubject(null)).toBe("Re:");
    expect(replySubject("")).toBe("Re:");
    expect(forwardSubject(undefined)).toBe("Fwd:");
  });

  it("adds Fwd: once, and keeps Fw:", () => {
    expect(forwardSubject("Lisbon")).toBe("Fwd: Lisbon");
    expect(forwardSubject("Fwd: Lisbon")).toBe("Fwd: Lisbon");
    expect(forwardSubject("FW: Lisbon")).toBe("FW: Lisbon");
    expect(forwardSubject("Re: Lisbon")).toBe("Fwd: Re: Lisbon");
  });

  it("strips every prefix for threading", () => {
    expect(baseSubject("Re: Fwd: RE: [team] Aw: Lisbon   trip")).toBe("Lisbon trip");
    expect(baseSubject("Lisbon")).toBe("Lisbon");
    expect(baseSubject(replySubject(forwardSubject("Lisbon")))).toBe("Lisbon");
    // "Rebate:" is a word, not a prefix.
    expect(baseSubject("Rebate: 20%")).toBe("Rebate: 20%");
  });
});

describe("threading headers", () => {
  it("replies to a first message", () => {
    expect(threadingHeaders({ messageId: ["a@x"], inReplyTo: null, references: null })).toEqual({ inReplyTo: ["a@x"], references: ["a@x"] });
  });

  it("extends References with the original's Message-ID", () => {
    expect(threadingHeaders({ messageId: ["c@x"], inReplyTo: ["b@x"], references: ["a@x", "b@x"] })).toEqual({
      inReplyTo: ["c@x"],
      references: ["a@x", "b@x", "c@x"],
    });
  });

  it("falls back to In-Reply-To when References is missing", () => {
    expect(threadingHeaders({ messageId: ["b@x"], inReplyTo: ["a@x"], references: null }).references).toEqual(["a@x", "b@x"]);
  });

  it("does not repeat an id", () => {
    expect(threadingHeaders({ messageId: ["b@x"], inReplyTo: null, references: ["a@x", "b@x"] }).references).toEqual(["a@x", "b@x"]);
  });

  it("trims a long References list, keeping the first and the newest", () => {
    const refs = Array.from({ length: 30 }, (_, i) => `m${i}@x`);
    const out = threadingHeaders({ messageId: ["new@x"], inReplyTo: null, references: refs }).references!;
    expect(out).toHaveLength(MAX_REFERENCES);
    expect(out[0]).toBe("m0@x");
    expect(out[out.length - 1]).toBe("new@x");
    expect(out[out.length - 2]).toBe("m29@x");
  });

  it("has nothing to point at without a Message-ID", () => {
    expect(threadingHeaders({ messageId: null, inReplyTo: null, references: null })).toEqual({ inReplyTo: null, references: null });
  });

  it("makes a Message-ID at the sender's domain", () => {
    expect(newMessageId("alice@Postern.test", "3f2a-91")).toBe("3f2a-91@postern.test");
    expect(newMessageId("alice@postern.test", "<bad id>")).toBe("badid@postern.test");
  });
});

describe("addresses", () => {
  it("validates plain addresses", () => {
    for (const ok of ["bob@postern.test", "a.b+c@sub.example.org", "x_y@ex-ample.co.uk", "o'neil@example.ie", "jürgen@münchen.de"]) {
      expect(isValidEmail(ok), ok).toBe(true);
    }
    for (const bad of ["", "bob", "bob@", "@x.test", "bob@localhost", "bob@x", "bob@@x.test", "a..b@x.test", ".a@x.test", "bob@x.t", "bob@-x.test", "bob @x.test", "bob@x.test>"]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });

  it("parses a pasted list", () => {
    const list = parseAddressList(`Bob Baker <bob@postern.test>, "Smith, Jo" <jo@example.org>; carol@example.org\ndave@example.org (Dave D), not an address, <eve@example.org>, mailto:fay@example.org`);
    expect(list.map((a) => [a.name, a.email, a.valid])).toEqual([
      ["Bob Baker", "bob@postern.test", true],
      ["Smith, Jo", "jo@example.org", true],
      [null, "carol@example.org", true],
      ["Dave D", "dave@example.org", true],
      [null, "not an address", false],
      [null, "eve@example.org", true],
      [null, "fay@example.org", true],
    ]);
    expect(list[4]?.raw).toBe("not an address");
  });

  it("formats an address, quoting names that need it", () => {
    expect(formatAddress(bob)).toBe("Bob Baker <bob@postern.test>");
    expect(formatAddress({ name: "Smith, Jo", email: "jo@x.test" })).toBe('"Smith, Jo" <jo@x.test>');
    expect(formatAddress({ name: null, email: "jo@x.test" })).toBe("jo@x.test");
    expect(parseAddressList(formatAddress({ name: 'Jo "JJ" Smith', email: "jo@x.test" }))[0]).toMatchObject({ name: 'Jo "JJ" Smith', email: "jo@x.test" });
  });

  it("dedupes case-insensitively and excludes", () => {
    expect(dedupeAddresses([bob, { name: null, email: "BOB@postern.test" }, carol], ["carol@EXAMPLE.org"])).toEqual([bob]);
  });
});

describe("reply recipients", () => {
  const me = ["alice@postern.test", "alice@other.test"];

  it("replies to the sender", () => {
    expect(replyRecipients({ from: [bob], to: [alice, carol], cc: [dave], replyTo: null }, "reply", me)).toEqual({ to: [bob], cc: [], bcc: [] });
  });

  it("uses Reply-To over From", () => {
    expect(replyRecipients({ from: [bob], to: [alice], cc: null, replyTo: [carol] }, "reply", me).to).toEqual([carol]);
  });

  it("replies to all: sender and To in To, Cc kept, me left out", () => {
    const r = replyRecipients({ from: [bob], to: [alice, carol], cc: [dave, { name: "Alice", email: "ALICE@postern.test" }], replyTo: null }, "replyAll", me);
    expect(r).toEqual({ to: [bob, carol], cc: [dave], bcc: [] });
  });

  it("leaves out every identity, not just the account", () => {
    const r = replyRecipients({ from: [bob], to: [{ name: null, email: "alice@other.test" }, carol], cc: null, replyTo: null }, "replyAll", me);
    expect(r.to).toEqual([bob, carol]);
  });

  it("does not repeat an address in To and Cc", () => {
    const r = replyRecipients({ from: [bob], to: [carol], cc: [{ name: null, email: "Carol@example.org" }, dave, bob], replyTo: null }, "replyAll", me);
    expect(r).toEqual({ to: [bob, carol], cc: [dave], bcc: [] });
  });

  it("follows up on my own message to the same people", () => {
    const own = { from: [alice], to: [bob, carol], cc: [dave], bcc: [{ name: null, email: "eve@example.org" }], replyTo: null };
    expect(replyRecipients(own, "reply", me)).toEqual({ to: [bob, carol], cc: [], bcc: [] });
    expect(replyRecipients(own, "replyAll", me)).toEqual({ to: [bob, carol], cc: [dave], bcc: [{ name: null, email: "eve@example.org" }] });
  });

  it("keeps me when I am the only one (a note to myself)", () => {
    expect(replyRecipients({ from: [alice], to: [alice], cc: null, replyTo: null }, "reply", me).to).toEqual([alice]);
  });

  it("moves Cc to To when To would be empty", () => {
    expect(replyRecipients({ from: [alice], to: [], cc: [carol], replyTo: null }, "replyAll", me)).toEqual({ to: [carol], cc: [], bcc: [] });
  });

  it("picks the identity the original was sent to", () => {
    expect(replyIdentityEmail({ to: [bob], cc: [{ name: null, email: "ALICE@other.test" }] }, me)).toBe("alice@other.test");
    expect(replyIdentityEmail({ to: [bob] }, me)).toBeNull();
  });
});

describe("quoting", () => {
  const original = { from: [bob], to: [alice], cc: [carol], subject: "Lisbon", sentAt: "2026-10-20T10:05:00Z", receivedAt: "2026-10-20T10:06:00Z" };
  const fmt = { locale: "en-US", timeZone: "UTC" };

  it("writes Gmail's attribution line", () => {
    expect(quoteAttribution(original, fmt)).toBe("On Tue, Oct 20, 2026 at 10:05 AM, Bob Baker <bob@postern.test> wrote:");
    expect(quoteAttribution({ ...original, from: [dave], sentAt: null }, fmt)).toBe("On Tue, Oct 20, 2026 at 10:06 AM, dave@example.org wrote:");
  });

  it("prefixes quoted lines", () => {
    expect(quotePlainText("one\n\n> earlier\r\ntwo")).toBe("> one\n>\n>> earlier\n> two");
  });

  it("builds the reply quote from text, escaped", () => {
    const q = replyQuote({ ...original, from: [{ name: "Bob <script>", email: "bob@postern.test" }] }, "Hi <b>Alice</b> & co\n\nBob\n", fmt);
    expect(q.text).toBe("On Tue, Oct 20, 2026 at 10:05 AM, Bob <script> <bob@postern.test> wrote:\n> Hi <b>Alice</b> & co\n>\n> Bob");
    expect(q.html).toContain('<div class="gmail_quote postern_quote">');
    expect(q.html).toContain("Bob &lt;script&gt; &lt;bob@postern.test&gt; wrote:");
    expect(q.html).toContain("<div>Hi &lt;b&gt;Alice&lt;/b&gt; &amp; co</div><div><br></div><div>Bob</div>");
    expect(q.html).not.toMatch(/<script|<b>/);
  });

  it("builds the forward block with Gmail's header lines", () => {
    const q = forwardQuote(original, "Plans attached.", fmt);
    expect(q.text).toBe(
      [
        "---------- Forwarded message ---------",
        "From: Bob Baker <bob@postern.test>",
        "Date: Tue, Oct 20, 2026 at 10:05 AM",
        "Subject: Lisbon",
        "To: Alice Archer <alice@postern.test>",
        "Cc: Carol <carol@example.org>",
        "",
        "Plans attached.",
      ].join("\n"),
    );
    expect(q.html).toContain("From: Bob Baker &lt;bob@postern.test&gt;<br>");
    expect(q.html).toContain("<div>Plans attached.</div>");
  });

  it("turns text into the editor's lines", () => {
    expect(textToHtml("a\n\nb & c")).toBe("<div>a</div><div><br></div><div>b &amp; c</div>");
  });
});

describe("the attached warning", () => {
  it("notices the words Gmail notices", () => {
    for (const text of ["I've attached the plan.", "See the attachment", "Attachments below", "Enclosed is the invoice", "attaching the file now"]) {
      expect(mentionsAttachment(text), text).toBe(true);
    }
  });

  it("ignores other words and quoted lines", () => {
    for (const text of ["Thanks, see you Tuesday", "The detachment arrived", "> I attached it last time", "unattached"]) {
      expect(mentionsAttachment(text), text).toBe(false);
    }
  });
});

describe("the MIME body", () => {
  const pdf = { blobId: "B-pdf", type: "application/pdf", name: "plan.pdf", size: 10 };
  const png = { blobId: "B-png", type: "image/png", name: "dot.png", cid: "img1@postern" };

  it("is text/plain alone in plain-text mode", () => {
    expect(buildBody({ html: null, text: "Hi", attachments: [] })).toEqual({ bodyStructure: { partId: "text", type: "text/plain" }, bodyValues: { text: { value: "Hi" } } });
  });

  it("is multipart/alternative with HTML", () => {
    const { bodyStructure, bodyValues } = buildBody({ html: "<div>Hi</div>", text: "Hi", attachments: [] });
    expect(bodyStructure).toEqual({
      type: "multipart/alternative",
      subParts: [
        { partId: "text", type: "text/plain" },
        { partId: "html", type: "text/html" },
      ],
    });
    expect(bodyValues).toEqual({ text: { value: "Hi" }, html: { value: "<div>Hi</div>" } });
  });

  it("puts inline images with the HTML in multipart/related, and attachments in multipart/mixed", () => {
    const { bodyStructure } = buildBody({ html: '<div>Hi<img src="cid:img1@postern"></div>', text: "Hi", attachments: [pdf], inline: [png] });
    expect(bodyStructure).toEqual({
      type: "multipart/mixed",
      subParts: [
        {
          type: "multipart/alternative",
          subParts: [
            { partId: "text", type: "text/plain" },
            {
              type: "multipart/related",
              subParts: [
                { partId: "html", type: "text/html" },
                { blobId: "B-png", type: "image/png", disposition: "inline", name: "dot.png", cid: "img1@postern" },
              ],
            },
          ],
        },
        { blobId: "B-pdf", type: "application/pdf", disposition: "attachment", name: "plan.pdf" },
      ],
    });
  });

  it("drops inline images the HTML no longer uses", () => {
    const { bodyStructure } = buildBody({ html: "<div>Hi</div>", text: "Hi", attachments: [], inline: [png] });
    expect(bodyStructure.type).toBe("multipart/alternative");
    expect(JSON.stringify(bodyStructure)).not.toContain("B-png");
  });

  it("finds cid references however they are quoted", () => {
    expect([...referencedCids(`<img src="cid:A@x"><img src='cid:b%40y'><img src=cid:c@z>`)]).toEqual(["a@x", "b@y", "c@z"]);
  });

  it("builds a reply draft", () => {
    const email = buildDraftEmail(
      {
        from: alice,
        to: [bob],
        cc: [],
        bcc: [{ name: " ", email: " eve@example.org " }],
        subject: "Re: Lisbon",
        html: null,
        text: "Yes!",
        attachments: [],
        messageId: "m1@postern.test",
        inReplyTo: ["a@x"],
        references: ["a@x"],
      },
      { draftsMailboxId: "d" },
    );
    expect(email).toMatchObject({
      mailboxIds: { d: true },
      keywords: { $draft: true, $seen: true },
      from: [alice],
      to: [bob],
      bcc: [{ name: null, email: "eve@example.org" }],
      subject: "Re: Lisbon",
      messageId: ["m1@postern.test"],
      inReplyTo: ["a@x"],
      references: ["a@x"],
    });
    expect(email.sentAt).toBeUndefined();
    // Stalwart refuses null address headers on create: empty ones are left out.
    expect("cc" in email).toBe(false);
    expect("replyTo" in email).toBe(false);
  });

  it("forwards attachments by blobId", () => {
    expect(forwardAttachments([{ blobId: "x", type: "", name: "a.bin", size: 3 }, { blobId: null, type: "text/plain", name: null, size: 0 }])).toEqual([
      { blobId: "x", type: "application/octet-stream", name: "a.bin", size: 3 },
    ]);
  });

  it("reads a saved draft's files back", () => {
    const part = (p: Partial<EmailBodyPart>): EmailBodyPart => ({ partId: null, blobId: null, size: 0, name: null, type: "", charset: null, disposition: null, cid: null, location: null, ...p });
    const structure = part({
      type: "multipart/mixed",
      subParts: [
        part({
          type: "multipart/alternative",
          subParts: [
            part({ partId: "1", blobId: "t", type: "text/plain" }),
            part({ type: "multipart/related", subParts: [part({ partId: "2", blobId: "h", type: "text/html" }), part({ partId: "3", blobId: "i", type: "image/png", cid: "img1@postern", disposition: "inline", name: "dot.png" })] }),
          ],
        }),
        part({ partId: "4", blobId: "p", type: "application/pdf", name: "plan.pdf", disposition: "attachment", size: 9 }),
        part({ partId: "5", blobId: "n", type: "text/plain", name: "notes.txt", disposition: "attachment" }),
      ],
    });
    const { attachments, inline } = draftParts(structure);
    expect(inline.map((a) => [a.blobId, a.cid])).toEqual([["i", "img1@postern"]]);
    expect(attachments.map((a) => a.name)).toEqual(["plan.pdf", "notes.txt"]);
  });
});
