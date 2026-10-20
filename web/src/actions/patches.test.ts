import { describe, expect, it } from "vitest";
import { applyPatch, editToPatch, invertPatch, NoMailboxError, planEdits, reversePlan, subPlan, type MessageState } from "./patches";

const msg = (id: string, mailboxIds: string[], keywords: string[] = []): MessageState => ({
  id,
  mailboxIds: Object.fromEntries(mailboxIds.map((m) => [m, true as const])),
  keywords: Object.fromEntries(keywords.map((k) => [k, true as const])),
});

describe("editToPatch", () => {
  it("names only what changes, as JSON-pointer paths", () => {
    const m = msg("1", ["inbox", "work"], ["$seen"]);
    expect(editToPatch(m, { mailboxIds: { inbox: false, work: true, all: true } })).toEqual({
      "mailboxIds/inbox": null,
      "mailboxIds/all": true,
    });
    expect(editToPatch(m, { keywords: { $seen: false, $flagged: true } })).toEqual({ "keywords/$seen": null, "keywords/$flagged": true });
  });

  it("is null when the message already looks like that", () => {
    expect(editToPatch(msg("1", ["inbox"], ["$seen"]), { mailboxIds: { inbox: true }, keywords: { $seen: true, $flagged: false } })).toBeNull();
  });

  it("escapes ids and keywords with / and ~", () => {
    expect(editToPatch(msg("1", ["a"]), { keywords: { "a/b~c": true } })).toEqual({ "keywords/a~1b~0c": true });
  });

  it("refuses to leave a message in no label", () => {
    expect(() => editToPatch(msg("1", ["inbox"]), { mailboxIds: { inbox: false } })).toThrow(NoMailboxError);
  });
});

describe("applyPatch", () => {
  it("applies pointer paths and whole-property replacement", () => {
    const m = msg("1", ["inbox", "work"], ["$seen"]);
    expect(applyPatch(m, { "mailboxIds/inbox": null, "mailboxIds/all": true, "keywords/$flagged": true })).toEqual(
      msg("1", ["work", "all"], ["$seen", "$flagged"]),
    );
    expect(applyPatch(m, { mailboxIds: { trash: true } })).toEqual(msg("1", ["trash"], ["$seen"]));
    expect(applyPatch(m, { "keywords/a~1b": true }).keywords).toEqual({ $seen: true, "a/b": true });
  });

  it("returns the same object when nothing it understands changes", () => {
    const m = msg("1", ["inbox"]);
    expect(applyPatch(m, { subject: "x" })).toBe(m);
  });

  it("does not mutate the message", () => {
    const m = msg("1", ["inbox"]);
    applyPatch(m, { "mailboxIds/inbox": null, "mailboxIds/x": true });
    expect(m).toEqual(msg("1", ["inbox"]));
  });
});

describe("invertPatch", () => {
  const cases: [string, MessageState, Record<string, boolean>, Record<string, boolean>][] = [
    ["inbox only, archived", msg("1", ["inbox"], ["$seen"]), { inbox: false, all: true }, {}],
    ["inbox and Work, archived", msg("2", ["inbox", "work"]), { inbox: false }, {}],
    ["several labels, trashed", msg("3", ["inbox", "work", "travel"], ["$flagged"]), { inbox: false, work: false, travel: false, trash: true }, {}],
    ["starred and read", msg("4", ["inbox"]), {}, { $flagged: true, $seen: true }],
    ["unstarred", msg("5", ["work"], ["$flagged", "$seen"]), {}, { $flagged: false }],
  ];

  for (const [name, before, mailboxIds, keywords] of cases) {
    it(`restores exactly: ${name}`, () => {
      const patch = editToPatch(before, { mailboxIds, keywords });
      expect(patch).not.toBeNull();
      const after = applyPatch(before, patch!);
      const inverse = invertPatch(before, patch!);
      expect(Object.keys(inverse).sort()).toEqual(Object.keys(patch!).sort());
      expect(applyPatch(after, inverse)).toEqual(before);
    });
  }

  it("inverts whole-property replacement with the prior value", () => {
    const before = msg("1", ["inbox", "work"]);
    const inverse = invertPatch(before, { mailboxIds: { trash: true } });
    expect(inverse).toEqual({ mailboxIds: { inbox: true, work: true } });
  });

  it("leaves alone a label added elsewhere in the meantime", () => {
    const before = msg("1", ["inbox"]);
    const patch = editToPatch(before, { mailboxIds: { inbox: false, all: true } })!;
    const elsewhere = applyPatch(applyPatch(before, patch), { "mailboxIds/travel": true });
    expect(applyPatch(elsewhere, invertPatch(before, patch))).toEqual(msg("1", ["inbox", "travel"]));
  });
});

describe("plans", () => {
  const groups = [
    { id: "T1", messages: [msg("1", ["inbox"]), msg("2", ["sent"])] },
    { id: "T2", messages: [msg("3", ["work"])] },
  ];

  it("plans one patch per changed message and counts touched conversations", () => {
    const plan = planEdits(groups, (m) => (m.mailboxIds["inbox"] ? { mailboxIds: { inbox: false, all: true } } : null));
    expect(plan.update).toEqual({ "1": { "mailboxIds/inbox": null, "mailboxIds/all": true } });
    expect(plan.inverse).toEqual({ "1": { "mailboxIds/inbox": true, "mailboxIds/all": null } });
    expect(plan.conversationIds).toEqual(["T1"]);
  });

  it("splits into the parts that succeeded and failed, and reverses", () => {
    const plan = planEdits(groups, () => ({ keywords: { $seen: true } }));
    const done = subPlan(plan, ["1", "3"]);
    expect(Object.keys(done.update)).toEqual(["1", "3"]);
    expect(done.conversationIds).toEqual(["T1", "T2"]);
    expect(subPlan(plan, ["2"]).conversationIds).toEqual(["T1"]);
    expect(reversePlan(done).update).toEqual(done.inverse);
  });
});
