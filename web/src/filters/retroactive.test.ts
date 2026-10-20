// "Also apply to matching conversations": the search, the conversations it
// finds, and one plan with one exact undo.

import { emptyActions, emptyCriteria, parseSearch, type FilterActions, type FilterCriteria } from "@postern/jmap";
import { describe, expect, it } from "vitest";
import type { Conversation, ConversationMessage, ConversationScope } from "../actions/conversation";
import { fakeEmail, FakeMail, MAILBOXES, ROLES } from "../actions/fakeMail";
import { applyPatch } from "../actions/patches";
import { criteriaToSearch, findMatchingConversations, hasRetroactiveActions, planFilterActions } from "./retroactive";

const c = (partial: Partial<FilterCriteria>): FilterCriteria => ({ ...emptyCriteria(), ...partial });
const a = (partial: Partial<FilterActions>): FilterActions => ({ ...emptyActions(), ...partial });

describe("the criteria as a search", () => {
  it("uses Gmail's operators, with OR between several senders", () => {
    expect(criteriaToSearch(c({ from: ["bob@postern.test", "carol"] }))).toBe("from:bob@postern.test OR from:carol");
    expect(
      criteriaToSearch(
        c({ to: ["team list"], subject: "q3 report", words: ["roadmap", "big plan"], notWords: ["draft"], hasAttachment: true, size: { comparison: "larger", amount: 2, unit: "M" } }),
      ),
    ).toBe('to:"team list" subject:"q3 report" roadmap "big plan" -draft has:attachment larger:2M');
  });

  it("keeps typed words literal, so OR, -word or from: can't widen the search", () => {
    const search = criteriaToSearch(c({ words: ["invoice", "OR", "-paid", "from:boss"], notWords: ["OR"] }));
    expect(search).toBe('invoice "OR" "-paid" "from:boss" -"OR"');
    const parsed = parseSearch(search, { now: new Date(), labels: () => undefined, roles: ROLES });
    const json = JSON.stringify(parsed.filter);
    expect(json).not.toContain('"operator":"OR"');
    expect(json).not.toContain('"from":"boss"');
  });

  it("parses back into an Email/query filter with the default scope", () => {
    const parsed = parseSearch(criteriaToSearch(c({ from: ["bob@postern.test", "carol"], hasAttachment: true })), { now: new Date(), labels: () => undefined, roles: ROLES });
    expect(parsed.warnings).toEqual([]);
    expect(parsed.scope).toBe("normal");
    expect(JSON.stringify(parsed.filter)).toContain('"inMailboxOtherThan":["c","b"]');
    expect(JSON.stringify(parsed.filter)).toContain('{"operator":"OR","conditions":[{"from":"bob@postern.test"},{"from":"carol"}]}');
  });

  it("only archive, read, star, label and delete reach existing mail", () => {
    expect(hasRetroactiveActions(a({ forwardTo: "x@y.test", neverSpam: true }))).toBe(false);
    for (const one of [{ archive: true }, { markRead: true }, { star: true }, { label: { id: "i", name: "Work" } }, { delete: true }]) {
      expect(hasRetroactiveActions(a(one))).toBe(true);
    }
  });
});

let n = 0;
function msg(id: string, mailboxes: string[], keywords: string[] = []): ConversationMessage {
  n++;
  return {
    id,
    threadId: "T",
    receivedAt: `2026-10-0${n % 9 || 1}T00:00:00Z`,
    mailboxIds: Object.fromEntries(mailboxes.map((x) => [x, true as const])),
    keywords: Object.fromEntries(keywords.map((k) => [k, true as const])),
  };
}
const scope: ConversationScope = { kind: "normal", roles: ROLES };
const run = (convs: Conversation[], update: Record<string, Record<string, unknown>>) =>
  convs.map((cv) => ({ ...cv, messages: cv.messages.map((m) => (update[m.id] ? { ...m, ...applyPatch(m, update[m.id]!) } : m)) }));

describe("one plan for the filter's actions", () => {
  it("label + skip the Inbox + read + star, merged into one patch per message", () => {
    const conv: Conversation = { id: "T", messages: [msg("1", ["a"]), msg("2", ["a"], ["$seen"])] };
    const plan = planFilterActions([conv], scope, a({ label: { id: "i", name: "Work" }, archive: true, markRead: true, star: true }));
    expect(plan.update).toEqual({
      "1": { "mailboxIds/i": true, "mailboxIds/a": null, "keywords/$seen": true },
      "2": { "mailboxIds/i": true, "mailboxIds/a": null, "keywords/$flagged": true },
    });
    expect(plan.conversationIds).toEqual(["T"]);
    // Undo puts everything back exactly.
    expect(run(run([conv], plan.update), plan.inverse)).toEqual([conv]);
  });

  it("skip the Inbox alone lands a label-less message in All Mail", () => {
    const conv: Conversation = { id: "T", messages: [msg("1", ["a"])] };
    expect(planFilterActions([conv], scope, a({ archive: true })).update).toEqual({ "1": { "mailboxIds/a": null, "mailboxIds/h": true } });
  });

  it("delete moves to Trash and keeps the flags", () => {
    const conv: Conversation = { id: "T", messages: [msg("1", ["a", "i"])] };
    expect(planFilterActions([conv], scope, a({ delete: true, markRead: true, label: { id: "k", name: "Receipts" } })).update).toEqual({
      "1": { "mailboxIds/a": null, "mailboxIds/i": null, "mailboxIds/b": true, "keywords/$seen": true },
    });
  });

  it("forward and never-spam do nothing to existing mail", () => {
    const conv: Conversation = { id: "T", messages: [msg("1", ["a"])] };
    expect(planFilterActions([conv], scope, a({ forwardTo: "x@y.test", neverSpam: true })).update).toEqual({});
  });
});

describe("finding the matching conversations", () => {
  it("collapses to conversations and brings every message of each, oldest first", async () => {
    const mail = new FakeMail({
      mailboxes: MAILBOXES,
      emails: [
        fakeEmail({ id: "m1", threadId: "t1", receivedAt: "2026-10-01T10:00:00Z", mailboxIds: { i: true } }),
        fakeEmail({ id: "m2", threadId: "t1", receivedAt: "2026-10-02T10:00:00Z", mailboxIds: { e: true }, keywords: { $seen: true } }),
        fakeEmail({ id: "m3", threadId: "t2", receivedAt: "2026-10-03T10:00:00Z", mailboxIds: { i: true } }),
        fakeEmail({ id: "m4", threadId: "t3", receivedAt: "2026-10-04T10:00:00Z", mailboxIds: { a: true } }),
      ],
    });
    const client = await mail.connect();
    const found = await findMatchingConversations(client, { inMailbox: "i" });
    expect(found.total).toBe(2);
    expect(found.conversations.map((cv) => [cv.id, cv.messages.map((m) => m.id)])).toEqual([
      ["t2", ["m3"]],
      ["t1", ["m1", "m2"]],
    ]);
    expect(found.conversations[1]!.messages[1]).toMatchObject({ mailboxIds: { e: true }, keywords: { $seen: true } });
  });

  it("stops at the limit", async () => {
    const emails = Array.from({ length: 250 }, (_, i) => fakeEmail({ id: `m${i}`, threadId: `t${i}` }));
    const mail = new FakeMail({ mailboxes: MAILBOXES, emails });
    const client = await mail.connect();
    const found = await findMatchingConversations(client, null, { limit: 120 });
    expect(found.conversations).toHaveLength(120);
    expect(found.total).toBe(250);
  });
});
