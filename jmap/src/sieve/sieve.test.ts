import { describe, expect, it } from "vitest";
import { decodeSieveText, quoteSieve } from "./escape.js";
import { generateSieve } from "./generate.js";
import {
  emptyActions,
  emptyCriteria,
  emptyFilterSet,
  filterProblems,
  GENERATED_MARKER,
  joinWords,
  normalizeFilterSet,
  splitList,
  splitWords,
  withBlocked,
  withoutBlocked,
  type FilterActions,
  type FilterCriteria,
  type FilterSet,
  type MailFilter,
} from "./model.js";
import { FilterScriptParseError, parseFilterScript } from "./parse.js";
import { parseSyntax, tokenize } from "./syntax.js";

const filter = (c: Partial<FilterCriteria>, a: Partial<FilterActions>): MailFilter => ({
  criteria: { ...emptyCriteria(), ...c },
  actions: { ...emptyActions(), ...a },
});
const one = (f: MailFilter): FilterSet => ({ filters: [f], blocked: [], includes: [] });
const roundTrip = (set: FilterSet) => parseFilterScript(generateSieve(set));

describe("round trip: model → Sieve → model", () => {
  const criteria: [string, Partial<FilterCriteria>][] = [
    ["from (one)", { from: ["bob@postern.test"] }],
    ["from (several)", { from: ["bob@postern.test", "Carol", "erin@x.test"] }],
    ["to (To or Cc)", { to: ["alice@postern.test", "team"] }],
    ["subject", { subject: "Quarterly report" }],
    ["has the words", { words: ["roadmap"] }],
    ["has the words (word and phrase)", { words: ["roadmap", "big plan"] }],
    ["doesn't have", { notWords: ["unsubscribe", "out of office"] }],
    ["has attachment", { hasAttachment: true }],
    ["size larger, MB", { size: { comparison: "larger", amount: 10, unit: "M" } }],
    ["size smaller, KB", { size: { comparison: "smaller", amount: 512, unit: "K" } }],
    ["size in bytes", { size: { comparison: "larger", amount: 1000, unit: "B" } }],
    [
      "every criterion at once",
      {
        from: ["bob@postern.test"],
        to: ["alice"],
        subject: "hi",
        words: ["a", "b c"],
        notWords: ["d"],
        hasAttachment: true,
        size: { comparison: "smaller", amount: 2, unit: "M" },
      },
    ],
  ];
  for (const [name, c] of criteria) {
    it(`criterion: ${name}`, () => {
      const set = one(filter(c, { star: true }));
      expect(roundTrip(set)).toEqual(set);
    });
  }

  const actions: [string, Partial<FilterActions>][] = [
    ["skip the Inbox", { archive: true }],
    ["mark as read", { markRead: true }],
    ["star", { star: true }],
    ["apply label", { label: { id: "i", name: "Work" } }],
    ["apply nested label", { label: { id: "j", name: "Work/Clients" } }],
    ["forward to", { forwardTo: "carol@postern.test" }],
    ["delete", { delete: true }],
    ["never send to Spam", { neverSpam: true }],
    [
      "every action at once",
      { archive: true, markRead: true, star: true, label: { id: "i", name: "Work" }, forwardTo: "carol@postern.test", delete: true, neverSpam: true },
    ],
  ];
  for (const [name, a] of actions) {
    it(`action: ${name}`, () => {
      const set = one(filter({ from: ["bob@postern.test"] }, a));
      expect(roundTrip(set)).toEqual(set);
    });
  }

  it("keeps several filters in order, each with its own label and forward", () => {
    const set: FilterSet = {
      filters: [
        filter({ from: ["a@x.test"] }, { label: { id: "i", name: "Work" }, archive: true }),
        filter({ subject: "invoice" }, { label: { id: "k", name: "Receipts" }, forwardTo: "books@x.test" }),
        filter({ to: ["list"] }, { markRead: true }),
        filter({ hasAttachment: true }, { forwardTo: "files@x.test", neverSpam: true }),
      ],
      blocked: [],
      includes: [],
    };
    expect(roundTrip(set)).toEqual(set);
  });

  it("blocked senders and includes", () => {
    const set: FilterSet = { filters: [], blocked: ["spam@x.test", "junk@y.test"], includes: ["my rules", "other"] };
    expect(roundTrip(set)).toEqual(set);
  });

  it("everything together", () => {
    const set: FilterSet = {
      filters: [filter({ from: ["bob@postern.test"] }, { label: { id: "i", name: "Work" }, archive: true })],
      blocked: ["spam@x.test"],
      includes: ["mine"],
    };
    expect(roundTrip(set)).toEqual(set);
  });

  it("the empty set", () => {
    expect(roundTrip(emptyFilterSet())).toEqual(emptyFilterSet());
  });

  it("is deterministic and marked as generated", () => {
    const set = one(filter({ from: ["bob@postern.test"] }, { star: true }));
    const a = generateSieve(set);
    expect(generateSieve(set)).toBe(a);
    expect(a.startsWith(GENERATED_MARKER + "\r\n# Postern filters, format 1\r\n")).toBe(true);
  });
});

describe("escaping a person's text", () => {
  const nasty = [
    'say "hello"',
    "back\\slash",
    "trailing\\",
    "${postern_skip}",
    "${1}",
    "$${x}",
    "a $ b { c }",
    "cost $5",
    "${hex:41}",
    "line\nbreak\r\nand\ttab",
    "\u0000nul and \u007f",
    'all "of" \\ ${them}\n',
    "ünïcödé — 日本語 🙂",
    "]); stop; [",
    '" ; discard; "',
  ];
  for (const text of nasty) {
    it(`survives ${JSON.stringify(text)}`, () => {
      const set: FilterSet = {
        filters: [
          filter(
            { from: [text], to: [text], subject: text, words: [text], notWords: [text] },
            { label: { id: "i", name: text }, forwardTo: text },
          ),
        ],
        blocked: [text],
        includes: [text],
      };
      expect(roundTrip(set)).toEqual(set);
    });
  }

  it('writes a literal "${" through the postern_dollar variable, set at the top', () => {
    const src = generateSieve(one(filter({ subject: "${x}" }, { star: true })));
    expect(src).toContain('header :contains "subject" "${postern_dollar}{x}"');
    expect(src).toContain('set "postern_dollar" "$";');
    expect(src.indexOf('set "postern_dollar"')).toBeLessThan(src.indexOf("# Filter 1"));
  });

  it("encodes control characters and requires encoded-character only then", () => {
    expect(quoteSieve("a\nb")).toEqual({ text: '"a${hex:0A}b"', encoded: true, dollar: false });
    expect(generateSieve(one(filter({ subject: "a\nb" }, { star: true })))).toContain('"encoded-character"');
    expect(generateSieve(one(filter({ subject: "ab" }, { star: true })))).not.toContain("encoded-character");
  });

  it("escapes quotes, and writes backslashes as ${hex:5C} (Stalwart's lexer mangles \\\\)", () => {
    expect(quoteSieve('a"b\\c$d')).toEqual({ text: '"a\\"b${hex:5C}c$d"', encoded: true, dollar: false });
    expect(quoteSieve("C:\\new").text).toBe('"C:${hex:5C}new"');
  });

  it("decodes what it writes, and refuses a variable reference in text", () => {
    expect(decodeSieveText("${postern_dollar}{x}${hex:0A}${unicode:1F642}")).toBe("${x}\n🙂");
    expect(() => decodeSieveText("${other}")).toThrow(/variable reference/);
    expect(() => decodeSieveText("${hex:")).toThrow(/unfinished/);
  });

  it("never writes a header name from the person's text", () => {
    const src = generateSieve(one(filter({ from: ['"from" ["x'] }, { star: true })));
    expect(src).toContain('header :contains "from" ["\\"from\\" [\\"x"]');
  });
});

describe("the Sieve written", () => {
  it("requires only what it uses", () => {
    const src = generateSieve(one(filter({ from: ["bob"] }, { star: true })));
    expect(src).toMatch(/^require \["fileinto", "special-use", "imap4flags", "variables", "relational", "comparator-i;ascii-numeric", "spamtest", "spamtestplus"\];$/m);
    expect(generateSieve({ filters: [], blocked: ["a@x.test"], includes: [] })).toMatch(/^require \["fileinto", "special-use", "imap4flags"\];$/m);
    // :mailboxid needs "mailbox" too in Stalwart 0.16.25 (sieve-rs 0.7.3 checks that capability).
    expect(generateSieve(one(filter({ from: ["bob"] }, { label: { id: "i", name: "Work" } })))).toContain('"fileinto", "mailbox", "mailboxid"');
  });

  it("declares the shared variables at the top level", () => {
    const src = generateSieve(one(filter({ from: ["bob"] }, { label: { id: "i", name: "Work" }, forwardTo: "c@x.test" })));
    for (const v of ["postern_skip", "postern_nospam", "postern_delete", "postern_filed", "postern_label_1", "postern_forward_1"]) {
      expect(src).toContain(`set "${v}" "";`);
    }
  });

  it("files labels by mailbox id with the name as the fallback, and blocked mail into Spam with $junk", () => {
    const src = generateSieve({ filters: [filter({ from: ["bob"] }, { label: { id: "i", name: "Work" } })], blocked: ["x@y.test"], includes: [] });
    expect(src).toContain('fileinto :mailboxid "i" "Work";');
    expect(src).toContain('fileinto :flags "$junk" :specialuse "\\\\Junk" "Junk Mail";');
  });

  it("lets Spam win unless a filter says never send it to Spam", () => {
    const src = generateSieve(one(filter({ from: ["bob"] }, { neverSpam: true })));
    expect(src).toContain('if allof (not string :is "${postern_nospam}" "1", spamtest :percent :value "ge" :comparator "i;ascii-numeric" "50") {');
    expect(src).toContain('} elsif string :is "${postern_nospam}" "1" {\r\n  fileinto :specialuse "\\\\Inbox" "INBOX";');
  });

  it("parses as Sieve with the generic reader", () => {
    const src = generateSieve({
      filters: [filter({ from: ["bob"], words: ["x"] }, { label: { id: "i", name: "Work" }, archive: true })],
      blocked: ["a@x.test"],
      includes: ["mine"],
    });
    const names = parseSyntax(src).map((c) => c.name);
    expect(names[0]).toBe("require");
    expect(names.at(-1)).toBe("include");
  });
});

describe("reading back refuses anything else", () => {
  const good = generateSieve({
    filters: [filter({ from: ["bob@postern.test"] }, { label: { id: "i", name: "Work" }, archive: true, forwardTo: "c@x.test" })],
    blocked: ["spam@x.test"],
    includes: ["mine"],
  });
  const bad = (src: string) => () => parseFilterScript(src);

  it("needs the marker and the format line", () => {
    expect(bad(good.replace(GENERATED_MARKER, "# My script"))).toThrow(FilterScriptParseError);
    expect(bad(good.replace("format 1", "format 2"))).toThrow(/format 1/);
    expect(bad("require [\"fileinto\"];\r\nkeep;\r\n")).toThrow(/doesn't start with/);
  });

  it("refuses hand edits", () => {
    expect(bad(good.replace('fileinto :mailboxid "i" "Work";', 'fileinto "Work";'))).toThrow(/label rule/);
    expect(bad(good.replace("  stop;\r\n}\r\n\r\n# Filter", "}\r\n\r\n# Filter"))).toThrow(/blocked senders/);
    expect(bad(good.replace('header :contains "from"', 'header :is "from"'))).toThrow(/doesn't write/);
    expect(bad(good + "discard;\r\n")).toThrow(/doesn't write here/);
    expect(bad(good.replace('redirect :copy "c@x.test";', 'redirect "c@x.test";'))).toThrow(/forwarding rule/);
    expect(bad(good.replace('  set "postern_label_1" "1";\r\n', '  set "postern_label_7" "1";\r\n'))).toThrow(/variable/);
    expect(bad(good.replace('include :personal :optional "mine";', 'include :global "mine";'))).toThrow(/include/);
    expect(bad(good.replace('"bob@postern.test"', '"${evil}"'))).toThrow(/variable reference/);
  });

  it("refuses a label rule with no filter and a filter without its rule", () => {
    expect(bad(good.replace('  set "postern_label_1" "1";\r\n', ""))).toThrow(/belongs to no filter/);
    const noRule = good.replace(/if string :is "\$\{postern_label_1\}" "1" \{\r\n.*\r\n.*\r\n\}\r\n/, "");
    expect(bad(noRule)).toThrow(/no label rule/);
  });

  it("refuses malformed Sieve", () => {
    expect(bad(good.replace('"bob@postern.test"', '"bob@postern.test'))).toThrow(FilterScriptParseError);
    expect(bad(good.replace("if allof (header", "if allof (header ("))).toThrow(FilterScriptParseError);
    expect(bad(good.slice(0, good.indexOf("keep;\r\n}")))).toThrow(FilterScriptParseError);
    const sized = generateSieve(one(filter({ size: { comparison: "larger", amount: 10, unit: "K" } }, { star: true })));
    expect(parseFilterScript(sized).filters[0]!.criteria.size).toEqual({ comparison: "larger", amount: 10, unit: "K" });
    expect(bad(sized.replace("size :over 10K", "size :over 10G"))).toThrow(/in G/);
    expect(bad(`${GENERATED_MARKER}\r\n# Postern filters, format 1\r\nrequire "x";\r\nif true { keep; }\r\n`)).toThrow(FilterScriptParseError);
    expect(bad(`${GENERATED_MARKER}\r\n# Postern filters, format 1\r\nrequire text:\r\nx\r\n.\r\n;`)).toThrow(/multi-line/);
  });

  it("ignores comments and whitespace", () => {
    const loose = good.replace(/\r\n/g, "\n").replace(/ {2}/g, "\t").replace("# Delivery", "# Delivery\n/* a note */");
    expect(parseFilterScript(loose)).toEqual(parseFilterScript(good));
  });

  it("tokenizes numbers with units, tags and strings with escapes", () => {
    expect(tokenize('size :over 10K "a\\"b"').map((t) => t.kind)).toEqual(["identifier", "tag", "number", "string"]);
    expect(() => tokenize("size :over 10X")).toThrow(/number/);
    expect(() => tokenize("/* open")).toThrow(/comment/);
  });
});

describe("the model", () => {
  it("splits lists and words as the editor needs", () => {
    expect(splitList("bob@x.test, carol@y.test OR erin; BOB@x.test")).toEqual(["bob@x.test", "carol@y.test", "erin"]);
    expect(splitWords('roadmap "big plan" roadmap')).toEqual(["roadmap", "big plan"]);
    expect(splitWords(joinWords(["a", "b c"]))).toEqual(["a", "b c"]);
  });

  it("says what is missing", () => {
    expect(filterProblems(filter({}, {}))).toEqual(["Fill in at least one search criterion.", "Choose at least one thing to do with matching messages."]);
    expect(filterProblems(filter({ subject: "x" }, { forwardTo: "not an address" }))).toEqual(["The forwarding address doesn't look like an email address."]);
    expect(filterProblems(filter({ size: { comparison: "larger", amount: 0, unit: "K" } }, { star: true }))).toHaveLength(1);
    expect(filterProblems(filter({ subject: "x" }, { star: true }))).toEqual([]);
  });

  it("normalises blocked addresses and refuses to include Postern's or the vacation script", () => {
    const set = normalizeFilterSet({ filters: [], blocked: [" Bob@X.test ", "bob@x.test", "<c@y.test>"], includes: ["postern", "vacation", "mine", "mine"] });
    expect(set).toEqual({ filters: [], blocked: ["bob@x.test", "c@y.test"], includes: ["mine"] });
    expect(withBlocked(set, "BOB@x.test")).toBe(set);
    expect(withoutBlocked(set, "Bob@X.test").blocked).toEqual(["c@y.test"]);
  });
});
