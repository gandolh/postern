// The list's toolbar, as Gmail's: the select checkbox and menu; with nothing
// selected, refresh and where you are ("1–17 of 2,035"); with a selection,
// archive, report spam, delete, mark read or unread, snooze (not yet), move
// to, labels and more.

import type { Id } from "@postern/jmap";
import { Archive, ChevronDown, Clock, EllipsisVertical, Mail, MailOpen, OctagonAlert, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { LabelMenu } from "../labels/LabelMenu";
import { IconButton } from "../shell/IconButton";
import type { LabelRoute } from "../shell/router";
import type { SelectKind } from "./controller";
import { MenuButton, type MenuItem } from "./Menu";
import type { ListPresentation } from "./types";

export interface ToolbarProps {
  presentation: ListPresentation;
  /** How many conversations are selected (all of them in "Select all N" mode). */
  selectedCount: number;
  /** Every loaded row is selected. */
  allLoadedSelected: boolean;
  /** What the selection holds, so each menu item shows when it would do something. */
  someUnread: boolean;
  someRead: boolean;
  someStarred: boolean;
  someUnstarred: boolean;
  someImportant: boolean;
  someNotImportant: boolean;
  /** "1–17 of 2,035", or empty. */
  paging: string;
  /** For the label menus (brief 09). */
  conversationIds: readonly Id[];
  emailIds: readonly Id[];
  labelRoute: LabelRoute | null;
  onSelect(kind: SelectKind): void;
  onToggleAll(): void;
  onRefresh(): void;
  onArchive(): void;
  onSpam(): void;
  onDelete(): void;
  onRead(read: boolean): void;
  onStar(on: boolean): void;
  onImportant(on: boolean): void;
  onLabelsDone(): void;
  onMoveDone(): void;
}

export function Toolbar(props: ToolbarProps) {
  const { presentation, selectedCount, someUnread } = props;
  const checkRef = useRef<HTMLInputElement>(null);
  const some = selectedCount > 0;
  const mixed = some && !props.allLoadedSelected;

  useEffect(() => {
    if (checkRef.current) checkRef.current.indeterminate = mixed;
  }, [mixed]);

  const selectItems: MenuItem[] = [
    { label: "All", onSelect: () => props.onSelect("all") },
    { label: "None", onSelect: () => props.onSelect("none") },
    { label: "Read", onSelect: () => props.onSelect("read") },
    { label: "Unread", onSelect: () => props.onSelect("unread") },
    { label: "Starred", onSelect: () => props.onSelect("starred") },
    { label: "Unstarred", onSelect: () => props.onSelect("unstarred") },
  ];

  // The toolbar's read button marks read when anything is unread; More has the other way round.
  const moreItems: MenuItem[] = [
    ...(someUnread && props.someRead ? [{ label: "Mark as unread", onSelect: () => props.onRead(false) }] : []),
    ...(props.someNotImportant ? [{ label: "Mark as important", onSelect: () => props.onImportant(true) }] : []),
    ...(props.someImportant ? [{ label: "Mark as not important", onSelect: () => props.onImportant(false) }] : []),
    ...(props.someUnstarred ? [{ label: "Add star", onSelect: () => props.onStar(true) }] : []),
    ...(props.someStarred ? [{ label: "Remove star", onSelect: () => props.onStar(false) }] : []),
  ];

  return (
    <div className="list-toolbar" role="toolbar" aria-label="Conversation actions">
      <div className="list-select">
        <label className="list-check list-select-check">
          <input
            ref={checkRef}
            type="checkbox"
            aria-label={some ? "Select none" : "Select all"}
            checked={props.allLoadedSelected && some}
            onChange={() => props.onToggleAll()}
          />
        </label>
        <MenuButton label="Select" icon={ChevronDown} items={selectItems} className="list-select-menu" />
      </div>

      {some ? (
        <>
          <div className="list-toolbar-group">
            {presentation.canArchive ? <IconButton label="Archive" icon={Archive} onClick={props.onArchive} /> : null}
            {presentation.notSpam ? (
              <button type="button" className="btn btn-quiet list-text-btn" onClick={props.onSpam}>
                Not spam
              </button>
            ) : (
              <IconButton label="Report spam" icon={OctagonAlert} onClick={props.onSpam} />
            )}
            {presentation.deleteForever ? (
              <button type="button" className="btn btn-quiet list-text-btn" onClick={props.onDelete}>
                Delete forever
              </button>
            ) : (
              <IconButton label="Delete" icon={Trash2} onClick={props.onDelete} />
            )}
          </div>
          <span className="list-toolbar-divider" aria-hidden="true" />
          <div className="list-toolbar-group">
            {someUnread ? (
              <IconButton label="Mark as read" icon={MailOpen} onClick={() => props.onRead(true)} />
            ) : (
              <IconButton label="Mark as unread" icon={Mail} onClick={() => props.onRead(false)} />
            )}
            <IconButton label="Snooze isn't available yet" icon={Clock} aria-disabled="true" className="list-unavailable" />
          </div>
          <span className="list-toolbar-divider" aria-hidden="true" />
          <div className="list-toolbar-group">
            <LabelMenu conversationIds={props.conversationIds} emailIds={props.emailIds} current={props.labelRoute} mode="move" onDone={props.onMoveDone} />
            <LabelMenu conversationIds={props.conversationIds} emailIds={props.emailIds} current={props.labelRoute} mode="label" onDone={props.onLabelsDone} />
            <MenuButton label="More" icon={EllipsisVertical} items={moreItems} />
          </div>
        </>
      ) : (
        <div className="list-toolbar-group">
          <IconButton label="Refresh" icon={RefreshCw} onClick={props.onRefresh} />
        </div>
      )}

      <p className="list-paging" aria-live="off">
        {props.paging}
      </p>
    </div>
  );
}
