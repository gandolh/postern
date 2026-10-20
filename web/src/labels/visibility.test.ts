import { describe, expect, it } from "vitest";
import type { Label, LabelNode } from "./labelsStore";
import { visibleNodes } from "./visibility";

const node = (id: string, unread: number, ...children: LabelNode[]): LabelNode => ({
  label: { id, unreadThreads: unread } as Label,
  depth: 0,
  children,
});

describe("visibleNodes (show if unread)", () => {
  const tree = [node("w", 0, node("c", 2)), node("r", 0), node("t", 3)];

  it("keeps everything when nothing is set to show only if unread", () => {
    expect(visibleNodes(tree, {}, undefined).map((n) => n.label.id)).toEqual(["w", "r", "t"]);
  });

  it("hides a flagged label with nothing unread, unless it is being viewed or a sublabel shows", () => {
    const prefs = { w: { showIfUnread: true }, r: { showIfUnread: true }, t: { showIfUnread: true } };
    expect(visibleNodes(tree, prefs, undefined).map((n) => n.label.id)).toEqual(["w", "t"]);
    expect(visibleNodes(tree, prefs, "r").map((n) => n.label.id)).toEqual(["w", "r", "t"]);
  });

  it("filters sublabels too", () => {
    const prefs = { c: { showIfUnread: true } };
    expect(visibleNodes([node("w", 0, node("c", 0))], prefs, undefined)[0]!.children).toEqual([]);
  });
});
