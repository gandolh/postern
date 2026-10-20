// Which user labels the navigation shows, given "show if unread" (a per-device
// preference). A label set to show only if unread is left out while it has no
// unread conversations, unless it is the label being viewed or a sublabel
// that is shown keeps it as its parent.

import type { Id } from "@postern/jmap";
import type { LabelNode } from "./labelsStore";
import type { LabelPrefs } from "./labelPrefs";

export function visibleNodes(nodes: readonly LabelNode[], prefs: LabelPrefs, currentId: Id | undefined): LabelNode[] {
  return nodes.flatMap((node) => {
    const children = visibleNodes(node.children, prefs, currentId);
    const hide = prefs[node.label.id]?.showIfUnread === true && node.label.unreadThreads === 0 && node.label.id !== currentId && children.length === 0;
    return hide ? [] : [{ ...node, children }];
  });
}
