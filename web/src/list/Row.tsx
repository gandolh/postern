// One conversation row: checkbox, star, important marker, senders, label
// chips, subject and snippet, attachment, date; archive, delete and
// read/unread on hover. Exactly one `--row-height` tall.

import type { Id } from "@postern/jmap";
import { Archive, Bookmark, Mail, MailOpen, Paperclip, Star, Trash2 } from "lucide-react";
import { Fragment, memo, useMemo, type MouseEvent, type ReactNode } from "react";
import { isImportant, isStarred, isUnread, labelIdsOf, shownMessages, type ConversationScope } from "../actions/conversation";
import { IconButton } from "../shell/IconButton";
import { chipLabels, formatFullDate, formatListDate, parseHighlights, summarizeSenders, type ChipLabel, type SenderMode, type SenderSummary } from "./format";
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
  /** Replace the subject and snippet (brief 10). */
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

function Senders({ summary }: { summary: SenderSummary }) {
  return (
    <>
      {summary.prefix ? <span className="list-sender-prefix">{summary.prefix} </span> : null}
      {summary.parts.map((part, i) => {
        const prev = summary.parts[i - 1];
        const sep = i === 0 ? "" : part.kind === "more" || prev?.kind === "more" ? " " : ", ";
        return (
          <Fragment key={i}>
            {sep}
            {part.kind === "more" ? (
              "…"
            ) : part.kind === "draft" ? (
              <span className="list-draft">Draft</span>
            ) : (
              <span className="list-sender" data-unread={part.unread || undefined}>
                {part.text}
              </span>
            )}
          </Fragment>
        );
      })}
      {summary.count ? <span className="list-count"> ({summary.count})</span> : null}
    </>
  );
}

function Highlighted({ html, fallback }: { html: string | null | undefined; fallback: string }) {
  if (!html) return <>{fallback}</>;
  return (
    <>
      {parseHighlights(html).map((run, i) =>
        run.mark ? (
          <mark key={i} className="list-mark">
            {run.text}
          </mark>
        ) : (
          <Fragment key={i}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}

export const ConversationRowView = memo(function ConversationRowView({ row, index, selected, open, tabbable, context, handlers }: RowProps) {
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
    };
  }, [row, scope, me, senderMode, matches, labels, currentLabelId]);
  const date = useMemo(() => ({ text: formatListDate(row.receivedAt, now), full: formatFullDate(row.receivedAt) }), [row.receivedAt, now]);

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
      className="list-row"
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
      <div role="gridcell" className="list-cell list-controls">
        <label className="list-check">
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
          className="list-icon-btn list-star"
          label={view.starred ? "Starred" : "Not starred"}
          icon={Star}
          aria-pressed={view.starred}
          tabIndex={-1}
          tooltip="start"
          onClick={stop(() => handlers.onStar(row))}
        />
        <IconButton
          className="list-icon-btn list-important"
          label={view.important ? "Important" : "Not important"}
          icon={Bookmark}
          aria-pressed={view.important}
          tabIndex={-1}
          tooltip="start"
          onClick={stop(() => handlers.onImportant(row))}
        />
      </div>
      <div role="gridcell" className="list-cell list-senders" title={view.senders.text}>
        <Senders summary={view.senders} />
      </div>
      <div role="gridcell" className="list-cell list-main">
        {view.chips.length ? (
          <span className="list-chips">
            {view.chips.map((chip) => (
              <span key={chip.id} className="chip list-chip">
                {chip.title}
              </span>
            ))}
          </span>
        ) : null}
        <span className="list-text">
          {context.renderSubject ? (
            context.renderSubject(row)
          ) : (
            <>
              <span className="list-subject">
                <Highlighted html={row.snippet?.subject} fallback={subject} />
              </span>
              {row.preview || row.snippet?.preview ? (
                <span className="list-snippet">
                  {" – "}
                  <Highlighted html={row.snippet?.preview} fallback={row.preview} />
                </span>
              ) : null}
            </>
          )}
        </span>
      </div>
      <div role="gridcell" className="list-cell list-end">
        {row.hasAttachment ? (
          <span className="list-attachment" title="Has attachment">
            <Paperclip aria-hidden="true" />
            <span className="visually-hidden">Has attachment</span>
          </span>
        ) : null}
        <time className="list-date" dateTime={row.receivedAt} title={date.full}>
          {date.text}
        </time>
        <div className="list-hover">
          {context.canArchive ? (
            <IconButton className="list-icon-btn" label="Archive" icon={Archive} tabIndex={-1} tooltip="end" onClick={stop(() => handlers.onArchive(row))} />
          ) : null}
          <IconButton
            className="list-icon-btn"
            label={context.deleteForever ? "Delete forever" : "Delete"}
            icon={Trash2}
            tabIndex={-1}
            tooltip="end"
            onClick={stop(() => handlers.onDelete(row))}
          />
          <IconButton
            className="list-icon-btn"
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
    <div role="row" aria-rowindex={index + 1} aria-busy="true" className="list-row list-row-placeholder">
      <div role="gridcell" className="list-cell list-controls">
        <span className="skeleton list-skeleton-check" />
      </div>
      <div role="gridcell" className="list-cell list-senders">
        <span className="skeleton list-skeleton-text" />
      </div>
      <div role="gridcell" className="list-cell list-main">
        <span className="skeleton list-skeleton-text" style={{ width: `${40 + ((index * 37) % 45)}%` }} />
      </div>
      <div role="gridcell" className="list-cell list-end">
        <span className="skeleton list-skeleton-date" />
      </div>
    </div>
  );
}
