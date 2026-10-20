// What a dragged conversation row carries, for dropping on a label in the
// navigation. A custom type, so nothing else on the page reacts to it.

import type { Id } from "@postern/jmap";

export const CONVERSATION_DRAG_TYPE = "application/x-postern-conversations";

export interface ConversationDrag {
  /** Thread ids: the row, or the selection when the row is part of it. */
  ids: Id[];
  /** "Select all N" was on: the drop takes every conversation of the list. */
  all: boolean;
}

export function writeDrag(data: DataTransfer, drag: ConversationDrag): void {
  data.setData(CONVERSATION_DRAG_TYPE, JSON.stringify(drag));
  data.effectAllowed = "move";
}

export function isConversationDrag(data: Pick<DataTransfer, "types">): boolean {
  return Array.from(data.types).includes(CONVERSATION_DRAG_TYPE);
}

export function readDrag(data: Pick<DataTransfer, "getData">): ConversationDrag | null {
  try {
    const raw = JSON.parse(data.getData(CONVERSATION_DRAG_TYPE)) as Partial<ConversationDrag>;
    const ids = Array.isArray(raw.ids) ? raw.ids.filter((id): id is string => typeof id === "string") : [];
    return ids.length > 0 ? { ids, all: raw.all === true } : null;
  } catch {
    return null;
  }
}
