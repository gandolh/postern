import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "../actions/conversation";
import { chipLabels, formatFullDate, formatListDate, parseHighlights, summarizeSenders, type ChipLabel } from "./format";

const ME = "alice@postern.test";
const alice = { name: "Alice Archer", email: ME };
const bob = { name: "Bob Baker", email: "bob@postern.test" };
const carol = { name: "Carol Chen", email: "carol@example.com" };
const dan = { name: "Dan", email: "dan@example.com" };
const erin = { name: null, email: "erin@example.com" };

let n = 0;
function m(from: { name: string | null; email: string } | null, keywords: string[] = ["$seen"], to: { name: string | null; email: string }[] = [alice]): ConversationMessage {
  n++;
  return {
    id: `m${n}`,
    threadId: "T",
    receivedAt: `2026-10-0${(n % 9) + 1}T00:00:00Z`,
    mailboxIds: { a: true },
    keywords: Object.fromEntries(keywords.map((k) => [k, true as const])),
    from: from ? [from] : [],
    to,
  };
}

describe("summarizeSenders", () => {
  it("gives one sender's full name, with no count for one message", () => {
    expect(summarizeSenders([m(bob)], ME).text).toBe("Bob Baker");
  });

  it("uses first names and 'me' for several, with the message count", () => {
    const s = summarizeSenders([m(bob), m(alice), m(carol), m(bob), m(alice)], ME);
    expect(s.text).toBe("Bob, me, Carol (5)");
    expect(s.count).toBe(5);
    expect(s.parts.map((p) => (p.kind === "name" ? [p.text, p.me] : p.kind))).toEqual([
      ["Bob", false],
      ["me", true],
      ["Carol", false],
    ]);
  });

  it("is 'me' alone in my own conversation, compared without case", () => {
    expect(summarizeSenders([m({ name: "Alice", email: "Alice@Postern.TEST" })], ME).text).toBe("me");
  });

  it("shows the first and last two around an ellipsis past three", () => {
    expect(summarizeSenders([m(bob), m(carol), m(dan), m(erin), m(alice)], ME).text).toBe("Bob … erin, me (5)");
  });

  it("names a sender without a display name by the address's local part", () => {
    expect(summarizeSenders([m(erin), m(bob)], ME).text).toBe("erin, Bob (2)");
    expect(summarizeSenders([m(erin)], ME).text).toBe("erin@example.com");
  });

  it("marks unread senders", () => {
    const s = summarizeSenders([m(bob, ["$seen"]), m(carol, [])], ME);
    expect(s.parts).toEqual([
      { kind: "name", text: "Bob", unread: false, me: false },
      { kind: "name", text: "Carol", unread: true, me: false },
    ]);
  });

  it("puts a draft last, as Gmail's red 'Draft'", () => {
    const s = summarizeSenders([m(bob), m(alice, ["$seen", "$draft"])], ME);
    expect(s.text).toBe("Bob, Draft (2)");
    expect(s.parts[1]).toEqual({ kind: "draft", text: "Draft" });
  });

  it("names the recipients after 'To:' in Sent", () => {
    expect(summarizeSenders([m(alice, ["$seen"], [bob, carol])], ME, "to").text).toBe("To: Bob, Carol");
    expect(summarizeSenders([m(alice, ["$seen"], [bob])], ME, "to").text).toBe("To: Bob Baker");
  });

  it("copes with no sender at all", () => {
    expect(summarizeSenders([m(null)], ME).text).toBe("(no sender)");
  });
});

describe("formatListDate", () => {
  const now = new Date("2026-10-20T15:30:00Z");
  const utc = { locale: "en-US", timeZone: "UTC" };

  it("shows the time for today", () => {
    expect(formatListDate("2026-10-20T09:05:00Z", now, utc)).toBe("9:05 AM");
    expect(formatListDate("2026-10-20T14:05:00Z", now, { locale: "en-GB", timeZone: "UTC" })).toBe("14:05");
  });

  it("shows month and day earlier this year", () => {
    expect(formatListDate("2026-10-09T23:00:00Z", now, utc)).toBe("Oct 9");
    expect(formatListDate("2026-01-01T00:00:00Z", now, utc)).toBe("Jan 1");
  });

  it("shows the full numeric date before this year, per locale", () => {
    expect(formatListDate("2025-10-09T12:00:00Z", now, utc)).toBe("10/9/2025");
    expect(formatListDate("2025-10-09T12:00:00Z", now, { locale: "sv-SE", timeZone: "UTC" })).toBe("2025-10-09");
  });

  it("decides 'today' in the given time zone", () => {
    // 23:30 UTC on the 19th is the 20th in Bucharest (UTC+3 in October).
    expect(formatListDate("2026-10-19T23:30:00Z", now, { locale: "en-GB", timeZone: "Europe/Bucharest" })).toBe("2:30");
    expect(formatListDate("2026-10-19T23:30:00Z", now, { locale: "en-GB", timeZone: "UTC" })).toBe("19 Oct");
  });

  it("is empty for a bad date, and gives the full date for the tooltip", () => {
    expect(formatListDate("nonsense", now, utc)).toBe("");
    expect(formatFullDate("2026-10-09T14:05:00Z", utc)).toBe("Friday, October 9, 2026 at 2:05 PM");
  });
});

describe("chipLabels", () => {
  const labels: ChipLabel[] = [
    { id: "a", title: "Inbox", system: "inbox" },
    { id: "e", title: "Sent", system: "sent" },
    { id: "h", title: "All Mail", system: "all" },
    { id: "i", title: "Work", system: null },
    { id: "j", title: "Work/Clients", system: null },
  ];

  it("shows user labels and the Inbox, never the label viewed or other system labels", () => {
    expect(chipLabels(["j", "a", "e", "i"], labels, "i").map((l) => l.title)).toEqual(["Inbox", "Work/Clients"]);
    expect(chipLabels(["a", "i"], labels, "a").map((l) => l.title)).toEqual(["Work"]);
    expect(chipLabels(["h"], labels, undefined)).toEqual([]);
  });
});

describe("parseHighlights", () => {
  it("splits on <mark> and decodes entities, keeping no other HTML", () => {
    expect(parseHighlights("Your <mark>invoice</mark> &amp; receipt")).toEqual([
      { text: "Your ", mark: false },
      { text: "invoice", mark: true },
      { text: " & receipt", mark: false },
    ]);
    expect(parseHighlights('<img src=x onerror="alert(1)"><mark>a&lt;b</mark><script>x</script>')).toEqual([
      { text: "a<b", mark: true },
      { text: "x", mark: false },
    ]);
    expect(parseHighlights("&#x1F600; &#65;")).toEqual([{ text: "\u{1F600} A", mark: false }]);
  });
});
