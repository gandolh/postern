import { describe, expect, it } from "vitest";
import {
  createLabelResolver,
  formatSearch,
  parseSearch,
  parseSearchDate,
  parseSize,
  subtractAge,
  type ParsedSearch,
  type SearchWarningKind,
} from "../../src/index.js";

const NOW = new Date("2026-10-20T12:00:00Z");
const ROLES = { inbox: "a", trash: "b", junk: "c", drafts: "d", sent: "e", archive: "h" };
const LABELS = [
  { id: "i", path: "Work" },
  { id: "j", path: "Work/Clients" },
  { id: "k", path: "Receipts" },
  { id: "l", path: "My Label" },
];
const SCOPE = { inMailboxOtherThan: ["c", "b"] };

function parse(input: string, over: { roles?: typeof ROLES | Record<string, never> } = {}): ParsedSearch {
  return parseSearch(input, { now: NOW, labels: createLabelResolver(LABELS), roles: over.roles ?? ROLES });
}

/** The filter without the default scope, for tests that are not about scope. */
function core(input: string): unknown {
  const { filter } = parse(`${input} in:anywhere`);
  return filter;
}

const kinds = (p: ParsedSearch): SearchWarningKind[] => p.warnings.map((w) => w.kind);

describe("search: operators", () => {
  it("maps the address and subject operators", () => {
    expect(core("from:bob")).toEqual({ from: "bob" });
    expect(core("to:bob")).toEqual({ to: "bob" });
    expect(core("cc:bob@x.test")).toEqual({ cc: "bob@x.test" });
    expect(core("bcc:bob")).toEqual({ bcc: "bob" });
    expect(core("subject:roadmap")).toEqual({ subject: "roadmap" });
    expect(core('subject:"q4 roadmap"')).toEqual({ subject: '"q4 roadmap"' });
    expect(core('from:"Bob Baker"')).toEqual({ from: "Bob Baker" });
  });

  it("is case-insensitive about operator names", () => {
    expect(core("FROM:bob")).toEqual({ from: "bob" });
    expect(core("Has:Attachment")).toEqual({ hasAttachment: true });
  });

  it("maps has:attachment", () => {
    expect(core("has:attachment")).toEqual({ hasAttachment: true });
  });

  it("maps is:", () => {
    expect(core("is:unread")).toEqual({ notKeyword: "$seen" });
    expect(core("is:read")).toEqual({ hasKeyword: "$seen" });
    expect(core("is:starred")).toEqual({ hasKeyword: "$flagged" });
    expect(core("is:important")).toEqual({ hasKeyword: "$important" });
  });

  it("maps in: places to mailboxes by role", () => {
    expect(core("in:inbox")).toEqual({ inMailbox: "a" });
    expect(core("in:sent")).toEqual({ inMailbox: "e" });
    expect(core("in:drafts")).toEqual({ inMailbox: "d" });
    expect(core("in:spam")).toEqual({ inMailbox: "c" });
    expect(core("in:trash")).toEqual({ inMailbox: "b" });
    expect(core("in:starred")).toEqual({ hasKeyword: "$flagged" });
  });

  it("resolves label: and in: with a label name to its mailbox id", () => {
    expect(core("label:work")).toEqual({ inMailbox: "i" });
    expect(core("in:receipts")).toEqual({ inMailbox: "k" });
    expect(core("label:Work/Clients")).toEqual({ inMailbox: "j" });
    expect(core("label:work/clients")).toEqual({ inMailbox: "j" });
    expect(core("label:my-label")).toEqual({ inMailbox: "l" });
    expect(core("label:my_label")).toEqual({ inMailbox: "l" });
    expect(core('label:"my label"')).toEqual({ inMailbox: "l" });
    expect(core("label:clients")).toEqual({ inMailbox: "j" }); // the one label that ends with it
  });

  it("maps larger: and smaller: (strict, K = 1024)", () => {
    expect(core("larger:500")).toEqual({ minSize: 501 });
    expect(core("larger:10K")).toEqual({ minSize: 10241 });
    expect(core("larger:5M")).toEqual({ minSize: 5 * 1024 * 1024 + 1 });
    expect(core("smaller:1m")).toEqual({ maxSize: 1024 * 1024 });
    expect(core("smaller:2K")).toEqual({ maxSize: 2048 });
  });

  it("maps before: and after: in Gmail's date forms", () => {
    expect(core("after:2026/01/05")).toEqual({ after: "2026-01-05T00:00:00Z" });
    expect(core("after:2026-01-05")).toEqual({ after: "2026-01-05T00:00:00Z" });
    expect(core("before:01/31/2026")).toEqual({ before: "2026-01-31T00:00:00Z" });
    expect(core("before:2026/1/3")).toEqual({ before: "2026-01-03T00:00:00Z" });
    expect(core("after:1767225600")).toEqual({ after: "2026-01-01T00:00:00Z" });
  });

  it("shifts dates by the user's UTC offset", () => {
    const p = parseSearch("after:2026/01/05 in:anywhere", { now: NOW, labels: () => undefined, roles: ROLES, utcOffsetMinutes: 120 });
    expect(p.filter).toEqual({ after: "2026-01-04T22:00:00Z" });
  });

  it("maps older_than: and newer_than: from now", () => {
    expect(core("newer_than:2d")).toEqual({ after: "2026-10-18T12:00:00Z" });
    expect(core("older_than:1d")).toEqual({ before: "2026-10-19T12:00:00Z" });
    expect(core("older_than:2m")).toEqual({ before: "2026-08-20T12:00:00Z" });
    expect(core("newer_than:1y")).toEqual({ after: "2025-10-20T12:00:00Z" });
  });

  it("clamps month arithmetic to the month's length", () => {
    expect(subtractAge(new Date("2026-03-31T00:00:00Z"), "1m")?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(subtractAge(new Date("2024-02-29T00:00:00Z"), "1y")?.toISOString()).toBe("2023-02-28T00:00:00.000Z");
  });

  it("substitutes me for the user's address", () => {
    const p = parseSearch("from:me in:anywhere", { now: NOW, labels: () => undefined, roles: ROLES, me: "alice@x.test" });
    expect(p.filter).toEqual({ from: "alice@x.test" });
  });
});

describe("search: text, quoting, negation, OR, groups", () => {
  it("sends bare words to text, one condition each", () => {
    expect(core("roadmap")).toEqual({ text: "roadmap" });
    expect(core("q4 roadmap")).toEqual({ operator: "AND", conditions: [{ text: "q4" }, { text: "roadmap" }] });
  });

  it("keeps an exact phrase together", () => {
    expect(core('"q4 roadmap" review')).toEqual({ operator: "AND", conditions: [{ text: '"q4 roadmap"' }, { text: "review" }] });
  });

  it("negates words, phrases and operators", () => {
    expect(core("-spam")).toEqual({ operator: "NOT", conditions: [{ text: "spam" }] });
    expect(core('-"a b"')).toEqual({ operator: "NOT", conditions: [{ text: '"a b"' }] });
    expect(core("-from:bob")).toEqual({ operator: "NOT", conditions: [{ from: "bob" }] });
    expect(core("-is:unread")).toEqual({ operator: "NOT", conditions: [{ notKeyword: "$seen" }] });
    expect(core("--x")).toEqual({ operator: "NOT", conditions: [{ text: "x" }] });
  });

  it("does not treat a dash inside a word as negation", () => {
    expect(core("well-known")).toEqual({ text: "well-known" });
  });

  it("reads OR, binding tighter than the space", () => {
    expect(core("from:a OR from:b")).toEqual({ operator: "OR", conditions: [{ from: "a" }, { from: "b" }] });
    expect(core("x from:a OR from:b")).toEqual({
      operator: "AND",
      conditions: [{ text: "x" }, { operator: "OR", conditions: [{ from: "a" }, { from: "b" }] }],
    });
    expect(core("a OR b OR c")).toEqual({ operator: "OR", conditions: [{ text: "a" }, { text: "b" }, { text: "c" }] });
  });

  it("does not take lower-case or as OR", () => {
    expect(core("a or b")).toEqual({ operator: "AND", conditions: [{ text: "a" }, { text: "or" }, { text: "b" }] });
  });

  it("reads braces as OR", () => {
    expect(core("{from:a from:b}")).toEqual({ operator: "OR", conditions: [{ from: "a" }, { from: "b" }] });
    expect(core("-{a b}")).toEqual({ operator: "NOT", conditions: [{ operator: "OR", conditions: [{ text: "a" }, { text: "b" }] }] });
  });

  it("reads parentheses as a group", () => {
    expect(core("(a OR b) c")).toEqual({
      operator: "AND",
      conditions: [{ operator: "OR", conditions: [{ text: "a" }, { text: "b" }] }, { text: "c" }],
    });
    expect(core("-(a b)")).toEqual({ operator: "NOT", conditions: [{ operator: "AND", conditions: [{ text: "a" }, { text: "b" }] }] });
    expect(core("((a))")).toEqual({ text: "a" });
  });

  it("applies an operator to a parenthesised group", () => {
    expect(core("subject:(dinner movie)")).toEqual({ operator: "AND", conditions: [{ subject: "dinner" }, { subject: "movie" }] });
    expect(core("from:(a OR b)")).toEqual({ operator: "OR", conditions: [{ from: "a" }, { from: "b" }] });
  });

  it("lists the positive terms for highlighting", () => {
    const p = parse('roadmap "q4 plan" -spam from:bob subject:launch');
    expect(p.terms).toEqual(["roadmap", "q4 plan", "bob", "launch"]);
  });
});

describe("search: default scope", () => {
  it("excludes Spam and Trash by default", () => {
    expect(parse("from:bob").filter).toEqual({ operator: "AND", conditions: [{ from: "bob" }, SCOPE] });
    expect(parse("").filter).toEqual(SCOPE);
    expect(parse("   ").filter).toEqual(SCOPE);
  });

  it("lifts the exclusion for a place that is named", () => {
    expect(parse("in:trash").filter).toEqual({ operator: "AND", conditions: [{ inMailbox: "b" }, { inMailboxOtherThan: ["c"] }] });
    expect(parse("in:spam from:x").filter).toEqual({
      operator: "AND",
      conditions: [{ inMailbox: "c" }, { from: "x" }, { inMailboxOtherThan: ["b"] }],
    });
    expect(parse("in:trash OR in:spam").filter).toEqual({ operator: "OR", conditions: [{ inMailbox: "b" }, { inMailbox: "c" }] });
  });

  it("keeps the exclusion when the place is negated or is an ordinary label", () => {
    expect(parse("-in:trash").filter).toEqual({
      operator: "AND",
      conditions: [{ operator: "NOT", conditions: [{ inMailbox: "b" }] }, SCOPE],
    });
    expect(parse("label:work").filter).toEqual({ operator: "AND", conditions: [{ inMailbox: "i" }, SCOPE] });
  });

  it("has no scope with in:anywhere", () => {
    expect(parse("in:anywhere").filter).toBeNull();
    expect(parse("in:all from:bob").filter).toEqual({ from: "bob" });
  });

  it("applies no scope when the account has no Spam or Trash", () => {
    expect(parse("from:bob", { roles: {} }).filter).toEqual({ from: "bob" });
    expect(parse("", { roles: {} }).filter).toBeNull();
  });

  it("says which list the results belong in", () => {
    expect(parse("in:trash").scope).toBe("trash");
    expect(parse("in:spam").scope).toBe("spam");
    expect(parse("in:trash in:spam").scope).toBe("normal");
    expect(parse("from:bob").scope).toBe("normal");
    expect(parse("in:trash in:anywhere").scope).toBe("normal");
  });
});

describe("search: unknown input", () => {
  it("falls back to text for an unknown operator, with a warning", () => {
    const p = parse("foo:bar baz in:anywhere");
    expect(p.filter).toEqual({ operator: "AND", conditions: [{ text: "foo:bar" }, { text: "baz" }] });
    expect(kinds(p)).toEqual(["unknown-operator"]);
    expect(p.warnings[0]!.token).toBe("foo:bar");
  });

  it("warns that Stalwart cannot search headers, and searches the words", () => {
    const p = parse("rfc822msgid:abc in:anywhere");
    expect(p.filter).toEqual({ text: "rfc822msgid:abc" });
    expect(kinds(p)).toEqual(["unsupported"]);
    expect(p.warnings[0]!.message).toMatch(/headers/);
  });

  it("warns about has: and is: values it cannot honour", () => {
    expect(kinds(parse("has:drive"))).toEqual(["unsupported"]);
    expect(kinds(parse("is:snoozed"))).toEqual(["unsupported"]);
  });

  it("does not warn about a URL or a time", () => {
    const p = parse("https://x.test 10:30 in:anywhere");
    expect(p.warnings).toEqual([]);
    expect(p.filter).toEqual({ operator: "AND", conditions: [{ text: "https://x.test" }, { text: "10:30" }] });
  });

  it("matches nothing for an unknown label, and says so", () => {
    const p = parse("label:nope in:anywhere");
    expect(p.filter).toEqual({ operator: "OR", conditions: [] });
    expect(kinds(p)).toEqual(["unknown-label"]);
    expect(parse("-label:nope in:anywhere").filter).toEqual({ operator: "NOT", conditions: [{ operator: "OR", conditions: [] }] });
  });

  it("matches nothing for a role the account lacks, and says so", () => {
    const p = parse("in:sent in:anywhere", { roles: {} });
    expect(p.filter).toEqual({ operator: "OR", conditions: [] });
    expect(kinds(p)).toEqual(["missing-mailbox"]);
  });

  it("leaves out a bad date, size or age, with a warning", () => {
    for (const q of ["after:yesterday", "before:2026/13/01", "after:2026/02/30", "older_than:abc", "newer_than:5w", "larger:big", "smaller:-1"]) {
      const p = parse(`${q} in:anywhere`);
      expect(p.filter, q).toBeNull();
      expect(kinds(p), q).toEqual(["bad-value"]);
    }
  });
});

describe("search: malformed input never throws", () => {
  it("copes with an unterminated quote", () => {
    const p = parse('"never closed');
    expect(p.filter).toEqual({ operator: "AND", conditions: [{ text: '"never closed"' }, SCOPE] });
    expect(kinds(p)).toEqual(["unterminated-quote"]);
    const q = parse('subject:"open end in:anywhere');
    expect(q.filter).toEqual({ operator: "AND", conditions: [{ subject: '"open end in:anywhere"' }, SCOPE] });
    expect(kinds(q)).toEqual(["unterminated-quote"]);
  });

  it("copes with stray and unclosed brackets", () => {
    expect(core("a ) b")).toEqual({ operator: "AND", conditions: [{ text: "a" }, { text: "b" }] });
    expect(kinds(parse("a ) b"))).toEqual(["unbalanced-parenthesis"]);
    expect(core("(a b")).toEqual({ operator: "AND", conditions: [{ text: "a" }, { text: "b" }] });
    expect(kinds(parse("(a b"))).toEqual(["unbalanced-parenthesis"]);
    expect(core("a } b {c")).toEqual({ operator: "AND", conditions: [{ text: "a" }, { text: "b" }, { text: "c" }] });
    expect(core("()")).toBeNull();
    expect(core("(a ( b )")).toEqual({ operator: "AND", conditions: [{ text: "a" }, { text: "b" }] });
  });

  it("leaves out an operator with no value", () => {
    for (const q of ["from:", 'from:""', "has:", "label:", "before:"]) {
      const p = parse(`${q} in:anywhere`);
      expect(p.filter, q).toBeNull();
      expect(kinds(p), q).toEqual(["empty-operator"]);
    }
    expect(core("from: bob")).toEqual({ text: "bob" });
  });

  it("copes with stray OR and dashes", () => {
    expect(core("OR")).toBeNull();
    expect(core("OR a")).toEqual({ text: "a" });
    expect(core("a OR")).toEqual({ text: "a" });
    expect(core("a OR OR b")).toEqual({ operator: "OR", conditions: [{ text: "a" }, { text: "b" }] });
    expect(core("-")).toBeNull();
    expect(core("- a")).toEqual({ text: "a" });
    expect(core("-()")).toBeNull();
  });

  it("never throws on odd input", () => {
    const nasty = ['"', '""', "(", ")", "{", "}", "-", ":", "::", ":x", "a::b", '-"', '-(', "\u0000", "from:(", "from:(a", 'subject:("x', "OR OR OR", "{(})", "\n\t ", "x".repeat(10_000), "(".repeat(500) + ")".repeat(500)];
    for (const input of nasty) {
      expect(() => parse(input), JSON.stringify(input.slice(0, 20))).not.toThrow();
    }
    expect(() => parseSearch(undefined as unknown as string, { now: NOW, labels: () => undefined, roles: {} })).not.toThrow();
  });

  it("never emits an empty AND, which Stalwart reads as no match", () => {
    const empties = ["", "()", "{}", "-()", "in:anywhere", "from:", "( )"];
    for (const q of empties) {
      const p = parse(q);
      const bad = JSON.stringify(p.filter).includes('"conditions":[]');
      expect(bad, q).toBe(false);
    }
  });
});

describe("search: labels and helpers", () => {
  it("resolves names the way the form is typed", () => {
    const resolve = createLabelResolver([
      { id: "1", path: "Work" },
      { id: "2", path: "Work/Clients" },
      { id: "3", path: "Home/Clients" },
      { id: "4", path: "A  B" },
    ]);
    expect(resolve("WORK")).toBe("1");
    expect(resolve("work/clients")).toBe("2");
    expect(resolve("clients")).toBeUndefined(); // ambiguous
    expect(resolve("a-b")).toBe("4");
    expect(resolve("")).toBeUndefined();
    expect(resolve("nope")).toBeUndefined();
  });

  it("parses dates and sizes", () => {
    expect(parseSearchDate("2026/02/29")).toBeNull();
    expect(parseSearchDate("2028/02/29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(parseSearchDate("12/31/2026")?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(parseSize("1.5M")).toBe(1572864);
    expect(parseSize("10kb")).toBe(10240);
    expect(parseSize("")).toBeNull();
  });
});

describe("formatSearch", () => {
  it("writes the advanced fields as operators", () => {
    expect(
      formatSearch({
        from: "bob",
        to: "alice@x.test",
        subject: "q4 plan",
        words: 'roadmap "launch day"',
        notWords: "draft old",
        label: "Work/Clients",
        hasAttachment: true,
        size: { comparison: "larger", amount: 5, unit: "M" },
        dateWithin: { days: 3, date: "2026-01-10" },
      }),
    ).toBe('from:bob to:alice@x.test subject:"q4 plan" roadmap "launch day" -draft -old label:Work/Clients has:attachment larger:5M after:2026/01/07 before:2026/01/14');
  });

  it("writes nothing for empty fields", () => {
    expect(formatSearch({})).toBe("");
    expect(formatSearch({ from: " ", words: "", size: { comparison: "smaller", amount: 0, unit: "K" } })).toBe("");
  });

  it("quotes a label with spaces and keeps in:anywhere", () => {
    expect(formatSearch({ label: "My Label" })).toBe('label:"My Label"');
    expect(formatSearch({ label: "anywhere" })).toBe("in:anywhere");
  });

  it("reads back through the parser", () => {
    const text = formatSearch({ from: "bob", subject: "q4 plan", notWords: "old", label: "My Label", size: { comparison: "smaller", amount: 2, unit: "K" } });
    const p = parse(text);
    expect(p.warnings).toEqual([]);
    expect(p.filter).toEqual({
      operator: "AND",
      conditions: [
        { from: "bob" },
        { subject: '"q4 plan"' },
        { operator: "NOT", conditions: [{ text: "old" }] },
        { inMailbox: "l" },
        { maxSize: 2048 },
        SCOPE,
      ],
    });
  });
});
