// Brief 09 replaces this stub with the label menu: apply and remove labels
// with checkboxes, search, "Create new", and its "Move to" twin. Brief 06's
// toolbar renders it for the selection.

import type { Id } from "@postern/jmap";
import { ArrowRightToLine, Tag } from "lucide-react";
import type { LabelRoute } from "../shell/router";
import { IconButton } from "../shell/IconButton";

export interface LabelMenuProps {
  /** The selected conversations (JMAP Thread ids). */
  conversationIds: readonly Id[];
  /** Their messages (JMAP Email ids): what the `mailboxIds` patches apply to. */
  emailIds: readonly Id[];
  /** The label being viewed, for "Move to" (which removes it) and to leave it out of the list; null in search results. */
  current: LabelRoute | null;
  /** `label` (apply/remove, Gmail's Labels button) or `move` (Gmail's Move to). Default `label`. */
  mode?: "label" | "move";
  /** Called after the menu applied a change or closed. */
  onDone?: () => void;
}

export function LabelMenu({ conversationIds, mode = "label" }: LabelMenuProps) {
  return (
    <IconButton
      label={mode === "move" ? "Move to" : "Labels"}
      icon={mode === "move" ? ArrowRightToLine : Tag}
      disabled={conversationIds.length === 0}
    />
  );
}
