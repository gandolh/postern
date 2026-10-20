// A label in the navigation as a drop target for conversation rows (Gmail's
// drag and drop: the conversation moves out of the label being viewed and
// into the one dropped on).
//
//   const drop = useLabelDropTarget(label.id, route);
//   <a {...drop}>  // onDragEnter / onDragOver / onDragLeave / onDrop and data-drop="over" while hovering

import type { Id } from "@postern/jmap";
import { useCallback, useMemo, useState, type DragEvent } from "react";
import type { Route } from "../shell/router";
import { isConversationDrag, readDrag } from "./dragData";
import { useLabelOps } from "./useLabelOps";

export interface LabelDropProps {
  onDragEnter: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  "data-drop": "over" | undefined;
}

export function useLabelDropTarget(labelId: Id, route: Route): LabelDropProps {
  const current = route.kind === "system" || route.kind === "label" ? route : null;
  const ops = useLabelOps(current);
  const [over, setOver] = useState(false);

  const accept = useCallback((event: DragEvent) => {
    if (!isConversationDrag(event.dataTransfer)) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    return true;
  }, []);

  return useMemo(
    () => ({
      onDragEnter: (event) => {
        if (accept(event)) setOver(true);
      },
      onDragOver: (event) => {
        if (accept(event)) setOver(true);
      },
      onDragLeave: (event) => {
        // Moving between the link's own children is not leaving it.
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (event) => {
        setOver(false);
        if (!isConversationDrag(event.dataTransfer)) return;
        event.preventDefault();
        const drag = readDrag(event.dataTransfer);
        if (drag) void ops.move(drag.ids, labelId, { all: drag.all });
      },
      "data-drop": over ? "over" : undefined,
    }),
    [accept, ops, labelId, over],
  );
}
