// One conversation row: checkbox, star, important marker, senders, label
// chips, subject and snippet, attachment, date; archive, delete and
// read/unread on hover. Exactly one `--row-height` tall.

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
      className="block min-h-0 min-w-11 flex-[0_1_auto] overflow-hidden rounded-sm bg-surface-sunken px-2 text-xs leading-5 font-medium text-ellipsis whitespace-nowrap text-text-muted data-label-color:bg-(color:--label-chip-bg) data-label-color:text-text"
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
              <span className="text-danger">Draft</span>
            ) : (
              <span className="data-unread:font-bold" data-unread={part.unread || undefined}>
                {part.text}
              </span>
            )}
          </Fragment>
        );
      })}
      {summary.count ? (
        <span className="text-text-muted group-data-unread/row:font-bold"> ({summary.count})</span>
      ) : null}
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
      className="group/row grid h-(--row-height) cursor-pointer grid-cols-[auto_minmax(8rem,13rem)_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border bg-row-read py-0 pr-3 pl-1 text-md leading-tight text-text select-none hover:bg-row-hover hover:shadow-[inset_0_-1px_0_var(--color-border-strong)] focus-visible:-outline-offset-2 focus-visible:[outline:var(--focus-ring)] data-open:shadow-[inset_3px_0_0_var(--color-accent)] data-unread:bg-row hover:data-unread:bg-row-hover aria-selected:bg-row-selected! [&[draggable=true]]:cursor-default min-sm:@max-[46rem]/list:grid-cols-[auto_minmax(6rem,9rem)_minmax(0,1fr)_auto] min-sm:@max-[46rem]/list:gap-x-2 min-sm:@max-[46rem]/list:pr-2 min-sm:@max-[30rem]/list:grid-cols-[auto_minmax(4rem,7rem)_minmax(0,1fr)_auto] max-sm:relative max-sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] max-sm:grid-rows-[auto_minmax(0,1fr)] max-sm:[grid-template-areas:'controls_senders_end''controls_main_main'] max-sm:touch-pan-y max-sm:items-start max-sm:gap-x-2 max-sm:gap-y-1 max-sm:py-2 max-sm:pr-3 max-sm:pl-1 max-sm:hover:shadow-none data-swiping:relative data-swiping:z-above data-swiping:shadow-sm"
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
      <div role="gridcell" className="flex min-w-0 items-center gap-0 max-sm:[grid-area:controls] max-sm:self-start">
        <label className="inline-grid size-8 flex-none in-data-[density=compact]:size-7 cursor-pointer place-items-center max-sm:size-11 [&_input]:m-0 [&_input]:size-4 [&_input]:cursor-pointer [&_input]:accent-accent">
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
        <IconButton
          className="size-8 in-data-[density=compact]:size-7 [&_.lucide]:[--icon-size:1.125rem] aria-pressed:bg-transparent aria-pressed:text-star aria-pressed:hover:bg-hover aria-pressed:[&_.lucide]:fill-current max-sm:absolute max-sm:right-0 max-sm:bottom-0 max-sm:size-11"
          label={view.starred ? "Starred" : "Not starred"}
          icon={Star}
          aria-pressed={view.starred}
          tabIndex={-1}
          tooltip="start"
          onClick={stop(() => handlers.onStar(row))}
        />
        <IconButton
          className="size-8 in-data-[density=compact]:size-7 max-sm:size-8 [&_.lucide]:[--icon-size:1.125rem] text-text-subtle aria-pressed:bg-transparent aria-pressed:text-accent aria-pressed:hover:bg-hover aria-pressed:[&_.lucide]:fill-current @max-[46rem]/list:hidden max-sm:hidden"
          label={view.important ? "Important" : "Not important"}
          icon={Bookmark}
          aria-pressed={view.important}
          tabIndex={-1}
          tooltip="start"
          onClick={stop(() => handlers.onImportant(row))}
        />
      </div>
      <div
        role="gridcell"
        className="min-w-0 items-center block overflow-hidden text-ellipsis whitespace-nowrap text-text max-sm:[grid-area:senders] max-sm:self-center"
        title={view.senders.text}
      >
        {view.unread ? <span className="sr-only">Unread, </span> : null}
        <Senders summary={view.senders} />
      </div>
      <div
        role="gridcell"
        className="flex min-w-0 items-center gap-2 overflow-hidden max-sm:[grid-area:main] max-sm:items-start max-sm:pr-10"
      >
        {view.chips.length || view.snoozed ? (
          <span className="flex max-w-[45%] flex-none gap-1 overflow-hidden @max-[46rem]/list:hidden">
            {view.snoozed ? (
              <span
                className="block min-h-0 min-w-11 flex-[0_1_auto] overflow-hidden rounded-sm bg-accent-soft px-2 text-xs leading-5 font-medium text-ellipsis whitespace-nowrap text-on-accent-soft"
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
        <span className="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap max-sm:line-clamp-2 max-sm:whitespace-normal">
          {context.renderSubject ? (
            context.renderSubject(row)
          ) : (
            <>
              <span className="text-text group-data-unread/row:font-bold max-sm:block max-sm:overflow-hidden max-sm:text-ellipsis max-sm:whitespace-nowrap">
                <Highlighted html={row.snippet?.subject} fallback={subject} />
              </span>
              {row.preview || row.snippet?.preview ? (
                <span className="text-text-muted min-sm:@max-[30rem]/list:hidden max-sm:inline">
                  {/* Its own span so the phone row (mobile.css), which puts the snippet on a line of its own, can drop it. */}
                  <span className="max-sm:hidden">{" – "}</span>
                  <Highlighted html={row.snippet?.preview} fallback={row.preview} />
                </span>
              ) : null}
            </>
          )}
        </span>
      </div>
      <div
        role="gridcell"
        className="flex items-center min-w-22 justify-end gap-2 min-sm:@max-[30rem]/list:min-w-0 max-sm:[grid-area:end] max-sm:min-w-0 max-sm:self-center"
      >
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
          className="text-sm whitespace-nowrap text-text-muted tabular-nums group-data-unread/row:font-bold group-data-unread/row:text-text group-focus-within/row:hidden group-hover/row:hidden max-sm:group-focus-within/row:inline-flex max-sm:group-hover/row:inline-flex"
          dateTime={row.receivedAt}
          title={date.full}
        >
          {date.text}
        </time>
        <div className="hidden items-center gap-0 group-focus-within/row:flex group-hover/row:flex max-sm:group-focus-within/row:hidden max-sm:group-hover/row:hidden">
          {context.canArchive ? (
            <IconButton
              className="size-8 in-data-[density=compact]:size-7 max-sm:size-8 [&_.lucide]:[--icon-size:1.125rem]"
              label="Archive"
              icon={Archive}
              tabIndex={-1}
              tooltip="end"
              onClick={stop(() => handlers.onArchive(row))}
            />
          ) : null}
          <IconButton
            className="size-8 in-data-[density=compact]:size-7 max-sm:size-8 [&_.lucide]:[--icon-size:1.125rem]"
            label={context.deleteForever ? "Delete forever" : "Delete"}
            icon={Trash2}
            tabIndex={-1}
            tooltip="end"
            onClick={stop(() => handlers.onDelete(row))}
          />
          <IconButton
            className="size-8 in-data-[density=compact]:size-7 max-sm:size-8 [&_.lucide]:[--icon-size:1.125rem]"
            label={view.unread ? "Mark as read" : "Mark as unread"}
            icon={view.unread ? MailOpen : Mail}
            tabIndex={-1}
            tooltip="end"
            onClick={stop(() => handlers.onToggleRead(row))}
          />
        </div>
      </div>
    </div>
  );
});

/** A row not loaded yet: a placeholder of the same height. */
export function PlaceholderRow({ index }: { index: number }) {
  return (
    <div
      role="row"
      aria-rowindex={index + 1}
      aria-busy="true"
      className="group/row grid h-(--row-height) grid-cols-[auto_minmax(8rem,13rem)_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border py-0 pr-3 pl-1 text-md leading-tight text-text select-none focus-visible:-outline-offset-2 focus-visible:[outline:var(--focus-ring)] data-open:shadow-[inset_3px_0_0_var(--color-accent)] data-unread:bg-row hover:data-unread:bg-row-hover aria-selected:bg-row-selected! [&[draggable=true]]:cursor-default min-sm:@max-[46rem]/list:grid-cols-[auto_minmax(6rem,9rem)_minmax(0,1fr)_auto] min-sm:@max-[46rem]/list:gap-x-2 min-sm:@max-[46rem]/list:pr-2 min-sm:@max-[30rem]/list:grid-cols-[auto_minmax(4rem,7rem)_minmax(0,1fr)_auto] max-sm:relative max-sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] max-sm:grid-rows-[auto_minmax(0,1fr)] max-sm:[grid-template-areas:'controls_senders_end''controls_main_main'] max-sm:touch-pan-y max-sm:items-start max-sm:gap-x-2 max-sm:gap-y-1 max-sm:py-2 max-sm:pr-3 max-sm:pl-1 max-sm:hover:shadow-none data-swiping:relative data-swiping:z-above data-swiping:shadow-sm cursor-default bg-row hover:bg-row hover:shadow-none"
    >
      <div role="gridcell" className="flex min-w-0 items-center gap-0 max-sm:[grid-area:controls] max-sm:self-start">
        <span className="ml-2 size-4 block rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] motion-safe:animate-skeleton group-data-[animated=false]/skel:animate-none" />
      </div>
      <div
        role="gridcell"
        className="min-w-0 items-center block overflow-hidden text-ellipsis whitespace-nowrap text-text max-sm:[grid-area:senders] max-sm:self-center"
      >
        <span className="h-3 w-[70%] block rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] motion-safe:animate-skeleton group-data-[animated=false]/skel:animate-none" />
      </div>
      <div
        role="gridcell"
        className="flex min-w-0 items-center gap-2 overflow-hidden max-sm:[grid-area:main] max-sm:items-start max-sm:pr-10"
      >
        <span
          className="h-3 w-[70%] block rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] motion-safe:animate-skeleton group-data-[animated=false]/skel:animate-none"
          style={{ width: `${40 + ((index * 37) % 45)}%` }}
        />
      </div>
      <div
        role="gridcell"
        className="flex items-center min-w-22 justify-end gap-2 min-sm:@max-[30rem]/list:min-w-0 max-sm:[grid-area:end] max-sm:min-w-0 max-sm:self-center"
      >
        <span className="h-3 w-12 block rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] motion-safe:animate-skeleton group-data-[animated=false]/skel:animate-none" />
      </div>
    </div>
  );
}
