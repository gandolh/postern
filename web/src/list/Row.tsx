// One conversation row, three lines: the senders and the date; the label chips and the subject (which wraps
// before it is cut); the snippet, faded at the edge. An unread row hangs a patina dot in the gutter beside the
// checkbox and is bold; star and Important stack in the right padding; archive, delete and read/unread take
// the date's place on hover. At least `--row-height` tall: a long subject makes the row taller, so the list
// measures its rows (useVirtualRows).

import type { Id } from "@postern/jmap";
import { Archive, Bookmark, Mail, MailOpen, Paperclip, Star, Trash2 } from "lucide-react";
import { Fragment, memo, useMemo, type DragEvent, type MouseEvent, type ReactNode } from "react";
import {
  isImportant,
  isStarred,
  isUnread,
  labelIdsOf,
  shownMessages,
  type ConversationScope,
} from "../actions/conversation";
import { writeDrag } from "../labels/dragData";
import { useLabelColor } from "../labels/useLabelPrefs";
import { IconButton } from "../shell/IconButton";
import {
  chipLabels,
  formatFullDate,
  formatListDate,
  parseHighlights,
  summarizeSenders,
  type ChipLabel,
  type SenderMode,
  type SenderSummary,
} from "./format";
import { snoozedUntil } from "../snooze/keyword";
import { formatSnoozeTime } from "../snooze/times";
import { getActiveList } from "./registry";
import type { ConversationRow, RowMessage } from "./types";

/** What every row shares: the view, the account, the clock. */
export interface RowContext {
  scope: ConversationScope;
  /** The signed-in address, shown as "me". */
  me: string;
  senderMode: SenderMode;
  /** The list's own test for a message (Sent: in Sent), to name the recipients of the right messages. */
  matches?: (message: RowMessage) => boolean;
  /** Every label, in the navigation's order, for the chips. */
  labels: readonly ChipLabel[];
  /** The label being viewed: no chip for it. */
  currentLabelId: Id | undefined;
  now: Date;
  canArchive: boolean;
  deleteForever: boolean;
  /** Replace the subject and snippet. */
  renderSubject?: (row: ConversationRow) => ReactNode;
}

/** The list's handlers, stable for the list's lifetime. */
export interface RowHandlers {
  /** The checkbox; `range` with Shift. */
  onSelect(id: Id, index: number, range: boolean): void;
  onOpen(row: ConversationRow): void;
  onFocus(id: Id): void;
  onStar(row: ConversationRow): void;
  onImportant(row: ConversationRow): void;
  onArchive(row: ConversationRow): void;
  /** Delete, or Delete forever in Trash and Spam. */
  onDelete(row: ConversationRow): void;
  onToggleRead(row: ConversationRow): void;
}

export interface RowProps {
  row: ConversationRow;
  index: number;
  selected: boolean;
  /** The conversation open beside the list. */
  open: boolean;
  /** Holds the list's tab stop (roving focus). */
  tabbable: boolean;
  context: RowContext;
  handlers: RowHandlers;
}

/** Clicks on these do their own thing, not open the conversation. */
function isControl(target: EventTarget, row: HTMLElement): boolean {
  const control = (target as Element).closest?.("button, input, a, label");
  return control !== null && control !== undefined && row.contains(control);
}

/** A label chip, in the label's colour when the owner gave it one on this device. */
function Chip({ chip }: { chip: ChipLabel }) {
  const color = useLabelColor(chip.id);
  return (
    <span
      className="mt-px block flex-none rounded-md border border-border bg-surface-sunken px-[7px] py-px text-xs leading-4 whitespace-nowrap text-text-muted group-aria-selected/row:bg-surface group-data-open/row:bg-surface data-label-color:bg-(color:--label-chip-bg) data-label-color:text-text"
      data-label-color={color}
    >
      {chip.title}
    </span>
  );
}

/** Dragging a row onto a label in the navigation: the row, or the whole selection when the row is part of it. */
function startDrag(event: DragEvent, row: ConversationRow, selected: boolean): void {
  const list = getActiveList();
  const picked = selected && list ? [...list.selectedIds] : [];
  writeDrag(event.dataTransfer, {
    ids: picked.includes(row.id) ? picked : [row.id],
    all: selected && list !== null && list.allSelected,
  });
}

function Senders({ summary }: { summary: SenderSummary }) {
  return (
    <>
      {summary.prefix ? <span className="text-text-muted">{summary.prefix} </span> : null}
      {summary.parts.map((part, i) => {
        const prev = summary.parts[i - 1];
        const sep = i === 0 ? "" : part.kind === "more" || prev?.kind === "more" ? " " : ", ";
        return (
          <Fragment key={i}>
            {sep}
            {part.kind === "more" ? (
              "…"
            ) : part.kind === "draft" ? (
              <span className="font-medium text-danger">Draft</span>
            ) : (
              <span className="data-unread:font-bold" data-unread={part.unread || undefined}>
                {part.text}
              </span>
            )}
          </Fragment>
        );
      })}
      {summary.count ? <span className="font-normal text-text-muted"> ({summary.count})</span> : null}
    </>
  );
}

function Highlighted({ html, fallback }: { html: string | null | undefined; fallback: string }) {
  if (!html) return <>{fallback}</>;
  return (
    <>
      {parseHighlights(html).map((run, i) =>
        run.mark ? (
          <mark key={i} className="rounded-sm bg-accent-soft text-inherit">
            {run.text}
          </mark>
        ) : (
          <Fragment key={i}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}

export const ConversationRowView = memo(function ConversationRowView({
  row,
  index,
  selected,
  open,
  tabbable,
  context,
  handlers,
}: RowProps) {
  const { scope, me, senderMode, matches, labels, currentLabelId, now } = context;
  const view = useMemo(() => {
    const shown = shownMessages(row, scope);
    const inList = senderMode === "to" && matches ? shown.filter(matches) : shown;
    return {
      unread: isUnread(row, scope),
      starred: isStarred(row, scope),
      important: isImportant(row, scope),
      senders: summarizeSenders(inList.length ? inList : shown, me, senderMode),
      chips: chipLabels(labelIdsOf(row, scope), labels, currentLabelId),
      // A snoozed conversation says when it comes back.
      snoozed: snoozedUntil(shown),
    };
  }, [row, scope, me, senderMode, matches, labels, currentLabelId]);
  const date = useMemo(
    () => ({ text: formatListDate(row.receivedAt, now), full: formatFullDate(row.receivedAt) }),
    [row.receivedAt, now],
  );

  const stop = (fn: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    fn();
  };

  const subject = row.subject.trim() || "(no subject)";

  return (
    <div
      role="row"
      aria-rowindex={index + 1}
      aria-selected={selected}
      aria-current={open ? "true" : undefined}
      tabIndex={tabbable ? 0 : -1}
      className="group/row relative grid min-h-(--row-height) cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_auto] grid-rows-[auto_auto] content-center items-start border-b border-border bg-row-read py-1.5 pr-11 pl-1 text-md text-text select-none hover:bg-row-hover focus-visible:[outline:var(--focus-ring)] focus-visible:-outline-offset-2 in-data-[density=comfortable]:py-1 aria-selected:bg-row-selected! data-open:bg-row-selected! data-open:shadow-[inset_3px_0_0_var(--color-accent)] data-swiping:relative data-swiping:z-above data-swiping:shadow-sm data-unread:bg-row hover:data-unread:bg-row-hover max-sm:min-h-0 max-sm:touch-pan-y max-sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] max-sm:pr-13 max-sm:pl-0 [&[draggable=true]]:cursor-default"
      draggable
      onDragStart={(event) => startDrag(event, row, selected)}
      data-row-id={row.id}
      data-unread={view.unread || undefined}
      data-open={open || undefined}
      onClick={(event) => {
        if (isControl(event.target, event.currentTarget)) return;
        handlers.onOpen(row);
      }}
      onFocus={(event) => {
        if (event.target === event.currentTarget) handlers.onFocus(row.id);
      }}
    >
      {view.unread ? (
        <span
          className="pointer-events-none absolute top-3 left-[2.1875rem] size-2 rounded-pill bg-accent max-sm:left-[2.5rem]"
          aria-hidden="true"
        />
      ) : null}
      <div role="gridcell" className="col-start-1 row-span-2 row-start-1 flex min-w-0 items-start">
        <label className="inline-grid h-11 w-10 flex-none cursor-pointer place-items-center max-sm:w-11 [&_input]:m-0">
          <input
            type="checkbox"
            tabIndex={-1}
            checked={selected}
            aria-label="Select"
            onChange={() => {}}
            onClick={(event) => {
              event.stopPropagation();
              handlers.onSelect(row.id, index, event.shiftKey);
            }}
          />
        </label>
        <div className="absolute top-1.5 right-3 flex flex-col items-center max-sm:top-1.5 max-sm:right-1">
          <IconButton
            className="size-7 rounded-md text-text-muted aria-pressed:bg-transparent aria-pressed:text-star aria-pressed:hover:bg-hover max-sm:size-11 max-sm:rounded-pill [&_.lucide]:[--icon-size:1.125rem] aria-pressed:[&_.lucide]:fill-current max-sm:[&_.lucide]:[--icon-size:1.25rem]"
            label={view.starred ? "Starred" : "Not starred"}
            icon={Star}
            aria-pressed={view.starred}
            tabIndex={-1}
            tooltip="end"
            onClick={stop(() => handlers.onStar(row))}
          />
          <IconButton
            className="size-7 rounded-md text-text-muted aria-pressed:bg-transparent aria-pressed:text-accent aria-pressed:hover:bg-hover max-sm:hidden [&_.lucide]:[--icon-size:1.125rem] aria-pressed:[&_.lucide]:fill-current"
            label={view.important ? "Important" : "Not important"}
            icon={Bookmark}
            aria-pressed={view.important}
            tabIndex={-1}
            tooltip="end"
            onClick={stop(() => handlers.onImportant(row))}
          />
        </div>
      </div>
      <div
        role="gridcell"
        className="col-start-2 row-start-1 block h-5 min-w-0 [mask-image:linear-gradient(to_right,black_calc(100%-1rem),transparent)] pl-0.5 leading-5 whitespace-nowrap text-text max-sm:pl-1"
        title={view.senders.text}
      >
        {view.unread ? <span className="sr-only">Unread, </span> : null}
        <Senders summary={view.senders} />
      </div>
      <div role="gridcell" className="col-start-3 row-start-1 flex h-5 items-center justify-end gap-1.5 pl-2">
        {row.hasAttachment ? (
          <span
            className="inline-flex text-text-muted group-focus-within/row:hidden group-hover/row:hidden max-sm:group-focus-within/row:inline-flex max-sm:group-hover/row:inline-flex [&_.lucide]:[--icon-size:1rem]"
            title="Has attachment"
          >
            <Paperclip aria-hidden="true" />
            <span className="sr-only">Has attachment</span>
          </span>
        ) : null}
        <time
          className="text-xs leading-4 whitespace-nowrap text-text-muted tabular-nums group-focus-within/row:hidden group-hover/row:hidden group-data-unread/row:font-bold group-data-unread/row:text-text max-sm:group-focus-within/row:inline-flex max-sm:group-hover/row:inline-flex"
          dateTime={row.receivedAt}
          title={date.full}
        >
          {date.text}
        </time>
        <div className="hidden items-center gap-0 group-focus-within/row:flex group-hover/row:flex max-sm:group-focus-within/row:hidden max-sm:group-hover/row:hidden">
          {context.canArchive ? (
            <IconButton
              className="-my-1 size-7 rounded-md [&_.lucide]:[--icon-size:1.125rem]"
              label="Archive"
              icon={Archive}
              tabIndex={-1}
              tooltip="end"
              onClick={stop(() => handlers.onArchive(row))}
            />
          ) : null}
          <IconButton
            className="-my-1 size-7 rounded-md [&_.lucide]:[--icon-size:1.125rem]"
            label={context.deleteForever ? "Delete forever" : "Delete"}
            icon={Trash2}
            tabIndex={-1}
            tooltip="end"
            onClick={stop(() => handlers.onDelete(row))}
          />
          <IconButton
            className="-my-1 size-7 rounded-md [&_.lucide]:[--icon-size:1.125rem]"
            label={view.unread ? "Mark as read" : "Mark as unread"}
            icon={view.unread ? MailOpen : Mail}
            tabIndex={-1}
            tooltip="end"
            onClick={stop(() => handlers.onToggleRead(row))}
          />
        </div>
      </div>
      <div role="gridcell" className="col-span-2 col-start-2 row-start-2 min-w-0 pl-0.5 max-sm:pl-1">
        {context.renderSubject ? (
          <div className="leading-5 wrap-anywhere">{context.renderSubject(row)}</div>
        ) : (
          <>
            <div className="flex items-start gap-2 leading-5 max-sm:text-lg max-sm:leading-6 max-sm:font-semibold">
              {view.chips.length || view.snoozed ? (
                <span className="flex flex-none gap-1 max-sm:hidden">
                  {view.snoozed ? (
                    <span
                      className="mt-px block flex-none rounded-md bg-accent-soft px-[7px] py-px text-xs leading-4 font-medium whitespace-nowrap text-on-accent-soft"
                      title={formatFullDate(view.snoozed.toISOString())}
                    >
                      Snoozed until {formatSnoozeTime(view.snoozed, now)}
                    </span>
                  ) : null}
                  {view.chips.map((chip) => (
                    <Chip key={chip.id} chip={chip} />
                  ))}
                </span>
              ) : null}
              <span className="min-w-0 flex-[1_1_auto] [text-wrap:pretty] wrap-anywhere text-text group-data-unread/row:font-bold max-sm:group-data-unread/row:font-semibold">
                <Highlighted html={row.snippet?.subject} fallback={subject} />
              </span>
            </div>
            {row.preview || row.snippet?.preview ? (
              <div className="[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] text-sm leading-[1.125rem] whitespace-nowrap text-text-muted in-data-[density=comfortable]:text-xs in-data-[density=comfortable]:leading-4 in-data-[density=compact]:hidden">
                <Highlighted html={row.snippet?.preview} fallback={row.preview} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
});

/** A row not loaded yet: three still bars where the sender, subject and snippet go. */
export function PlaceholderRow({ index }: { index: number }) {
  return (
    <div
      role="row"
      aria-rowindex={index + 1}
      aria-busy="true"
      className="grid min-h-(--row-height) cursor-default grid-cols-[2.5rem_minmax(0,1fr)] items-center border-b border-border bg-row py-1.5 pr-11 pl-1 max-sm:grid-cols-[2.75rem_minmax(0,1fr)] max-sm:pr-13 max-sm:pl-0"
    >
      <div role="gridcell" className="grid place-items-center">
        <span className="block size-4 rounded-sm bg-skeleton" />
      </div>
      <div role="gridcell" className="flex flex-col gap-2.5 pl-1">
        <span className="block h-2.5 w-[34%] rounded-sm bg-skeleton" />
        <span className="block h-2.5 rounded-sm bg-skeleton" style={{ width: `${40 + ((index * 37) % 45)}%` }} />
        <span className="block h-2.5 w-[88%] rounded-sm bg-skeleton" />
      </div>
    </div>
  );
}
