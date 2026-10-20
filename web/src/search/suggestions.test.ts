import { describe, expect, it } from "vitest";
import { labelSource, quoteArg, RecentSearches, recentSearchSource, replaceToken, senderSource, suggestionQuery } from "./suggestions";

const signal = new AbortController().signal;

describe("suggestionQuery", () => {
  it("finds the word being typed", () => {
    expect(suggestionQuery("")).toMatchObject({ token: "", tokenStart: 0, operator: null, rest: "" });
    expect(suggestionQuery("budget bo")).toMatchObject({ token: "bo", tokenStart: 7, operator: null, rest: "bo" });
    expect(suggestionQuery("budget ")).toMatchObject({ token: "", tokenStart: 7 });
  });

  it("splits an operator and keeps a negation apart", () => {
    expect(suggestionQuery("-From:Bo")).toMatchObject({ negation: "-", operator: "from", rest: "Bo" });
    expect(suggestionQuery('label:"My la')).toMatchObject({ operator: "label", rest: "My la", tokenStart: 0 });
  });

  it("replaces only the word being typed", () => {
    const q = suggestionQuery("budget from:bo");
    expect(replaceToken(q, "from:bob@x.test")).toBe("budget from:bob@x.test");
  });

  it("quotes only when it must", () => {
    expect(quoteArg("Work/Clients")).toBe("Work/Clients");
    expect(quoteArg("My Label")).toBe('"My Label"');
  });
});

describe("recent searches", () => {
  it("keeps the newest first, without repeats, up to a limit", () => {
    const r = new RecentSearches(3);
    for (const q of ["a", "b", "c", "a", "d"]) r.add(q);
    r.add("  ");
    expect(r.all).toEqual(["d", "a", "c"]);
  });

  it("suggests the ones that contain the box's text, to search at once", () => {
    const r = new RecentSearches();
    r.add("from:bob");
    r.add("budget");
    const s = recentSearchSource(r);
    expect(s.suggest(suggestionQuery(""), signal)).toEqual([
      { key: "budget", label: "budget", text: "budget", submit: true },
      { key: "from:bob", label: "from:bob", text: "from:bob", submit: true },
    ]);
    expect((s.suggest(suggestionQuery("bob"), signal) as unknown[]).length).toBe(1);
    expect((s.suggest(suggestionQuery("budget"), signal) as unknown[]).length).toBe(0); // what is typed already
  });
});

describe("label source", () => {
  const labels = [
    { path: "Inbox", system: true },
    { path: "Work", system: false },
    { path: "Work/Clients", system: false },
    { path: "My Label", system: false },
  ];
  const source = labelSource(() => labels);
  const suggest = (input: string) => source.suggest(suggestionQuery(input), signal) as { label: string; text: string }[];

  it("matches names anywhere in the path, with - and _ as spaces", () => {
    expect(suggest("cli").map((s) => s.label)).toEqual(["Work/Clients"]);
    expect(suggest("my-lab").map((s) => s.label)).toEqual(["My Label"]);
  });

  it("writes label: for labels and in: for system labels, quoted when needed", () => {
    expect(suggest("budget wor").map((s) => s.text)).toEqual(["budget label:Work", "budget label:Work/Clients"]);
    expect(suggest("my").map((s) => s.text)).toEqual(['label:"My Label"']);
    expect(suggest("inb").map((s) => s.text)).toEqual(["in:inbox"]);
    expect(suggest("-wor").map((s) => s.text)[0]).toBe("-label:Work");
  });

  it("completes after label: and in:, and says nothing for other operators or an empty word", () => {
    expect(suggest("label:cl").map((s) => s.text)).toEqual(["label:Work/Clients"]);
    expect(suggest("label:").length).toBe(4); // every label, the system one as in:
    expect(suggest("from:wor")).toEqual([]);
    expect(suggest("budget ")).toEqual([]);
  });
});

describe("sender source", () => {
  const senders = [
    { name: "Bob Baker", email: "bob@postern.test" },
    { name: null, email: "carol@northwind.example.com" },
  ];
  const source = senderSource(async () => senders);
  const suggest = async (input: string) => (await source.suggest(suggestionQuery(input), signal)) as { label: string; detail?: string; text: string }[];

  it("matches names and addresses and writes from:", async () => {
    expect(await suggest("bak")).toEqual([{ key: "bob@postern.test", label: "Bob Baker", detail: "bob@postern.test", text: "from:bob@postern.test" }]);
    expect((await suggest("north"))[0]).toMatchObject({ label: "carol@northwind.example.com", text: "from:carol@northwind.example.com" });
  });

  it("keeps the operator typed, and waits for two letters otherwise", async () => {
    expect((await suggest("to:bo"))[0]!.text).toBe("to:bob@postern.test");
    expect((await suggest("x -from:car"))[0]!.text).toBe("x -from:carol@northwind.example.com");
    expect(await suggest("b")).toEqual([]);
    expect((await suggest("from:")).length).toBe(2);
    expect(await suggest("label:b")).toEqual([]);
  });
});
