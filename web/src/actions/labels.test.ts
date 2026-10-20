import { describe, expect, it } from "vitest";
import type { Conversation, ConversationMessage, ConversationScope } from "./conversation";
import {
  cleanLabelName,
  descendantIds,
  filterLabels,
  labelChecks,
  nestTargets,
  planLabelRemoval,
  planPromoteChildren,
  toggleChange,
  validateLabelName,
  validateNesting,
  type LabelShape,
} from "./labels";
import { applyPatch } from "./patches";
import { planLabels, planMove } from "./plans";

const roles = { inbox: "a", trash: "b", junk: "c", sent: "e", archive: "h" };
const normal: ConversationScope = { kind: "normal", roles };

function m(id: string, mailboxIds: string[]): ConversationMessage {
  return { id, threadId: "T", receivedAt: "2026-10-01T00:00:00Z", mailboxIds: Object.fromEntries(mailboxIds.map((x) => [x, true as const])), keywords: {} };
}
const conv = (id: string, ...messages: ConversationMessage[]): Conversation => ({ id, messages });

describe("labelChecks (the menu's checkboxes)", () => {
  const withWork = conv("T1", m("1", ["a", "w"]));
  const without = conv("T2", m("2", ["a"]));

  it("is checked when every conversation has the label, unchecked when none, indeterminate for some", () => {
    expect(labelChecks([withWork, conv("T3", m("3", ["w"]))], normal, ["w"]).get("w")).toBe("checked");
    expect(labelChecks([without], normal, ["w"]).get("w")).toBe("unchecked");
    expect(labelChecks([withWork, without], normal, ["w"]).get("w")).toBe("indeterminate");
  });

  it("counts a conversation as carrying the label when any message it shows does", () => {
    const mixed = conv("T4", m("4", ["a"]), m("5", ["a", "w"]));
    expect(labelChecks([mixed], normal, ["w"]).get("w")).toBe("checked");
  });

  it("ignores messages the view does not show (Trash)", () => {
    const trashed = conv("T5", m("6", ["a"]), m("7", ["b"]));
    expect(labelChecks([trashed], normal, ["b"]).get("b")).toBe("unchecked");
  });

  it("answers for every label asked, and unchecked for an empty selection", () => {
    expect([...labelChecks([withWork], normal, ["w", "x"]).entries()]).toEqual([
      ["w", "checked"],
      ["x", "unchecked"],
    ]);
    expect(labelChecks([], normal, ["w"]).get("w")).toBe("unchecked");
  });
});

describe("toggleChange", () => {
  it("removes a checked label and adds an unchecked or indeterminate one", () => {
    expect(toggleChange("checked", "w")).toEqual({ remove: ["w"] });
    expect(toggleChange("unchecked", "w")).toEqual({ add: ["w"] });
    expect(toggleChange("indeterminate", "w")).toEqual({ add: ["w"] });
  });

  it("feeds planLabels: removing the last label sends the message to All Mail", () => {
    const only = conv("T", m("1", ["w"]));
    const plan = planLabels([only], normal, toggleChange("checked", "w"));
    expect(plan.update).toEqual({ "1": { "mailboxIds/w": null, "mailboxIds/h": true } });
  });
});

describe("move to (planMove semantics)", () => {
  it("takes the conversation out of the viewed label and into the target", () => {
    const c = conv("T", m("1", ["w"]));
    const plan = planMove([c], normal, "w", "i");
    expect(applyPatch(c.messages[0]!, plan.update["1"]!).mailboxIds).toEqual({ i: true });
  });
});

describe("filterLabels", () => {
  const list = [
    { title: "Clients", path: "Work/Clients" },
    { title: "Receipts", path: "Receipts" },
  ];
  it("matches the path or the title, ignoring case", () => {
    expect(filterLabels(list, "work")).toEqual([list[0]]);
    expect(filterLabels(list, " REC ")).toEqual([list[1]]);
    expect(filterLabels(list, "")).toEqual(list);
    expect(filterLabels(list, "zzz")).toEqual([]);
  });
});

const L = (id: string, name: string, parentId: string | null = null, role: string | null = null): LabelShape => ({ id, name, parentId, role });
const labels = [L("a", "Inbox", null, "inbox"), L("w", "Work"), L("c", "Clients", "w"), L("p", "Projects", "c"), L("r", "Receipts")];

describe("label names", () => {
  it("cleans whitespace", () => expect(cleanLabelName("  Big   Deal ")).toBe("Big Deal"));

  it("rejects empty names and slashes (nesting is by parent)", () => {
    expect(validateLabelName("   ", null, labels)).toMatch(/name/i);
    expect(validateLabelName("a/b", null, labels)).toMatch(/slash/i);
    expect(validateLabelName("x".repeat(256), null, labels)).toMatch(/255/);
    expect(validateLabelName("Fine name", null, labels)).toBeNull();
  });

  it("rejects a sibling's name ignoring case, system labels included, but allows it under another parent", () => {
    expect(validateLabelName("work", null, labels)).toMatch(/already exists/);
    expect(validateLabelName("INBOX", null, labels)).toMatch(/already exists/);
    expect(validateLabelName("Work", "w", labels)).toBeNull();
    expect(validateLabelName("Clients", "w", labels)).toMatch(/already exists there/);
  });

  it("lets a label keep its own name", () => expect(validateLabelName("Work", null, labels, "w")).toBeNull());
});

describe("nesting", () => {
  it("finds a label and everything below it", () => {
    expect([...descendantIds(labels, "w")].sort()).toEqual(["c", "p", "w"]);
    expect([...descendantIds(labels, "r")]).toEqual(["r"]);
  });

  it("offers user labels other than itself and its descendants", () => {
    expect(nestTargets(labels, "w").map((l) => l.id)).toEqual(["r"]);
    expect(nestTargets(labels, "r").map((l) => l.id)).toEqual(["w", "c", "p"]);
  });

  it("refuses cycles, system parents, system labels and sibling clashes", () => {
    expect(validateNesting(labels, "w", "p")).toMatch(/inside itself/);
    expect(validateNesting(labels, "w", "w")).toMatch(/inside itself/);
    expect(validateNesting(labels, "r", "a")).toMatch(/only be nested under other labels/);
    expect(validateNesting(labels, "a", "w")).toMatch(/System labels/);
    expect(validateNesting(labels, "nope", null)).toMatch(/doesn't exist/);
    expect(validateNesting([...labels, L("x", "Receipts", "w")], "x", null)).toMatch(/already exists/);
    expect(validateNesting(labels, "r", "w")).toBeNull();
    expect(validateNesting(labels, "c", null)).toBeNull();
  });
});

describe("planLabelRemoval (before a label is deleted)", () => {
  it("takes the label off every message; one left with no label goes to All Mail in the same patch", () => {
    const { update, orphans } = planLabelRemoval([m("1", ["w"]), m("2", ["w", "a"]), m("3", ["a"])], "w", "h");
    expect(update).toEqual({
      "1": { "mailboxIds/w": null, "mailboxIds/h": true },
      "2": { "mailboxIds/w": null },
    });
    expect(orphans).toEqual(["1"]);
    for (const message of [m("1", ["w"]), m("2", ["w", "a"])]) {
      expect(Object.keys(applyPatch(message, update[message.id]!).mailboxIds).length).toBeGreaterThan(0);
    }
  });

  it("needs no All Mail when nobody is orphaned, and refuses when it would orphan without one", () => {
    expect(planLabelRemoval([m("2", ["w", "a"])], "w", undefined).orphans).toEqual([]);
    expect(() => planLabelRemoval([m("1", ["w"])], "w", undefined)).toThrow(/no label/);
  });

  it("escapes ids with slashes", () => {
    const { update } = planLabelRemoval([m("1", ["a/b"])], "a/b", "h");
    expect(update["1"]).toEqual({ "mailboxIds/a~1b": null, "mailboxIds/h": true });
  });
});

describe("planPromoteChildren (deleting a parent)", () => {
  it("moves each sublabel up to the deleted label's parent", () => {
    expect(planPromoteChildren(labels, "w")).toEqual({ update: { c: { parentId: null } } });
    expect(planPromoteChildren(labels, "c")).toEqual({ update: { p: { parentId: "w" } } });
    expect(planPromoteChildren(labels, "r")).toEqual({ update: {} });
  });

  it("stops before anything changes when a sublabel's name is taken one level up", () => {
    const clash = [...labels, L("x", "Clients")];
    expect(planPromoteChildren(clash, "w")).toEqual({ error: expect.stringMatching(/"Clients".*already exists/) });
  });
});
