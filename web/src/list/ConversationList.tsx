// The conversation list, reusable: label routes render it through ListRoute,
// brief 10's search results with a query of their own.
//
//   <ConversationList query={...} presentation={...} title="Inbox" route={route} labelRoute={route} emptyMessage="..." />
//
// A grid (role="grid", aria-rowcount = every conversation, rows focusable
// with one tab stop), virtualised to the rows in view, paged 50 at a time as
// you scroll. While mounted it is the active list for keyboard shortcuts
// (registry.getActiveList()).

import { JmapNetworkError, type Id } from "@postern/jmap";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { isImportant, isStarred, isUnread, shownMessages, type ConversationScope } from "../actions/conversation";
import type { MailActions } from "../actions/runner";
import { undoLast } from "../actions/undo";
import { useMailActions } from "../actions/useMailActions";
import { useAccount, useJmap } from "../auth";
import { useLabels } from "../labels/useLabels";
import { navigate, withConversation, type LabelRoute, type MailRoute } from "../shell/router";
import { ConnectionLost, EmptyState, ListSkeleton } from "../shell/states";
import { useMinuteClock } from "./clock";
import { ConfirmDialog } from "./ConfirmDialog";
import type { ListController, SelectKind } from "./controller";
import type { ChipLabel } from "./format";
import type { ListStore } from "./listStore";
import { setActiveList } from "./registry";
import { rememberOpened, takeReturnFocus } from "./returnFocus";
import { ConversationRowView, PlaceholderRow, type RowContext, type RowHandlers } from "./Row";
import { Toolbar } from "./Toolbar";
import type { ConversationRow, ListPresentation, ListQuery } from "./types";
import { useListStore } from "./useListStore";
import { useVirtualRows } from "./useVirtualRows";
import "./list.css";

export interface ConversationListProps {
  query: ListQuery;
  presentation: ListPresentation;
  /** The label's name ("Inbox", "Work"): the grid's name. */
  title: string;
  /** The page's h1 (visually hidden, as Gmail has none). Default: `title`. */
  heading?: string;
  /** How "Select all N conversations …" ends: "in Inbox" by default, "that match this search" for brief 10. */
  allLabel?: string;
  /** Rows open with withConversation(route, id); route.conversationId is highlighted. */
  route: MailRoute;
  /** The label route, for the label menus' `current` (null in search results). */
  labelRoute: LabelRoute | null;
  /** What an empty list says: "No conversations in Spam". */
  emptyMessage: string;
  /** Replace a row's subject and snippet (brief 10). */
  renderSubject?: (row: ConversationRow) => ReactNode;
}

interface Selection {
  ids: ReadonlySet<Id>;
  /** "Select all N conversations": every conversation in the list, loaded or not. */
  all: boolean;
  /** The last row clicked, for shift-click ranges. */
  anchor: number | null;
}

const NO_SELECTION: Selection = { ids: new Set(), all: false, anchor: null };

/** Start loading the next page this many rows before the end of what is loaded. */
const LOAD_AHEAD = 10;

/** What the list's handlers read at the moment they run. */
interface Latest {
  rows: readonly ConversationRow[];
  selection: Selection;
  focusId: Id | null;
  presentation: ListPresentation;
  scope: ConversationScope;
  route: MailRoute;
  store: ListStore;
  actions: MailActions;
  scrollToIndex: (index: number) => void;
}

interface Setters {
  setSelection: (update: Selection | ((s: Selection) => Selection)) => void;
  setFocusId: (id: Id | null) => void;
  setConfirming: (rows: readonly ConversationRow[] | null) => void;
}

/** The list's behaviour beyond the keyboard controller: the toolbar's. */
export interface ListApi extends ListController {
  selectAllMatching(): void;
  toggleAll(): void;
  setRead(read: boolean): Promise<void>;
  setStar(on: boolean): Promise<void>;
  setImportant(on: boolean): Promise<void>;
  confirmDelete(rows: readonly ConversationRow[]): Promise<void>;
}

/** The list's behaviour, made once per list; each call reads the state of the moment. */
function makeApi(get: () => Latest, set: Setters, requestFocus: () => void): { api: ListApi; handlers: RowHandlers } {
  const selected = (): ConversationRow[] => {
    const { selection, rows } = get();
    return selection.all ? [...rows] : rows.filter((r) => selection.ids.has(r.id));
  };

  const targets = async (): Promise<ConversationRow[]> => {
    const { selection, rows, focusId, store } = get();
    if (selection.all) return store.allConversations();
    const picked = selected();
    if (picked.length > 0) return picked;
    const focused = rows.find((r) => r.id === focusId);
    return focused ? [focused] : [];
  };

  /** Actions that take conversations out of the list end the selection, as Gmail's do. */
  const leaving = async (only: readonly ConversationRow[] | undefined, run: (rows: readonly ConversationRow[]) => Promise<unknown>) => {
    const rows = only ?? (await targets());
    if (rows.length === 0) return;
    if (!only) set.setSelection(NO_SELECTION);
    else {
      const gone = new Set(rows.map((r) => r.id));
      set.setSelection((s) => (s.all || [...s.ids].some((id) => gone.has(id)) ? { ...s, all: false, ids: new Set([...s.ids].filter((id) => !gone.has(id))) } : s));
    }
    // Keyboard focus moves to the next row (else the previous) so it is not lost with the row.
    const active = document.activeElement;
    if (active === document.body || active?.closest("[role='grid']")) {
      const gone = new Set(rows.map((r) => r.id));
      const all = get().rows;
      const last = all.reduce((at, r, i) => (gone.has(r.id) ? i : at), -1);
      const next = all.slice(last + 1).find((r) => !gone.has(r.id)) ?? [...all].reverse().find((r) => !gone.has(r.id));
      if (next) {
        requestFocus();
        set.setFocusId(next.id);
      }
    }
    await run(rows);
  };

  const staying = async (only: readonly ConversationRow[] | undefined, run: (rows: readonly ConversationRow[]) => Promise<unknown>) => {
    const rows = only ?? (await targets());
    if (rows.length > 0) await run(rows);
  };

  const focusRow = (id: Id) => {
    const index = get().rows.findIndex((r) => r.id === id);
    if (index < 0) return;
    requestFocus();
    set.setFocusId(id);
    get().scrollToIndex(index);
  };

  const toggleSelect = (id: Id | undefined, index?: number, range = false) => {
    const target = id ?? get().focusId;
    if (target === null) return;
    const at = index ?? get().rows.findIndex((r) => r.id === target);
    set.setSelection((sel) => {
      const { rows } = get();
      const ids = new Set(sel.all ? rows.map((r) => r.id) : sel.ids);
      const on = !ids.has(target);
      if (range && sel.anchor !== null && at >= 0) {
        const [from, to] = sel.anchor < at ? [sel.anchor, at] : [at, sel.anchor];
        for (let i = from; i <= to; i++) {
          const row = rows[i];
          if (!row) continue;
          if (on) ids.add(row.id);
          else ids.delete(row.id);
        }
      } else if (on) ids.add(target);
      else ids.delete(target);
      return { ids, all: false, anchor: at >= 0 ? at : null };
    });
  };

  const open = (id: Id | null | undefined) => {
    const target = id ?? get().focusId;
    if (!target) return;
    set.setFocusId(target);
    rememberOpened(target, Math.max(0, get().rows.findIndex((r) => r.id === target)));
    navigate(withConversation(get().route, target));
  };

  const archive = (only?: readonly ConversationRow[]) => {
    const { actions, scope, presentation } = get();
    if (!presentation.canArchive) return Promise.resolve();
    return leaving(only, (rows) => actions.archive(rows, scope));
  };

  const remove = (only?: readonly ConversationRow[]) => {
    const { actions, scope, presentation } = get();
    if (presentation.deleteForever) return staying(only, async (rows) => set.setConfirming(rows));
    return leaving(only, (rows) => actions.trash(rows, scope));
  };

  const setRead = (read: boolean, only?: readonly ConversationRow[], toast = true) => {
    const { actions, scope } = get();
    return staying(only, (rows) => (read ? actions.markRead(rows, scope, { toast }) : actions.markUnread(rows, scope, { toast })));
  };

  /** Star when none is starred, else unstar every one; quiet like Gmail's star (undo stays on z). */
  const toggleStar = (only?: readonly ConversationRow[]) => {
    const { actions, scope } = get();
    return staying(only, (rows) =>
      rows.some((r) => isStarred(r, scope)) ? actions.unstar(rows, scope, { toast: false }) : actions.star(rows, scope, { toast: false }),
    );
  };

  const setImportant = (on: boolean, only?: readonly ConversationRow[], toast = true) => {
    const { actions, scope } = get();
    return staying(only, (rows) => (on ? actions.markImportant(rows, scope, { toast }) : actions.markNotImportant(rows, scope, { toast })));
  };

  const select = (kind: SelectKind) => {
    const { rows, scope } = get();
    const pick: Record<SelectKind, () => readonly ConversationRow[]> = {
      all: () => rows,
      none: () => [],
      read: () => rows.filter((r) => !isUnread(r, scope)),
      unread: () => rows.filter((r) => isUnread(r, scope)),
      starred: () => rows.filter((r) => isStarred(r, scope)),
      unstarred: () => rows.filter((r) => !isStarred(r, scope)),
    };
    set.setSelection({ ids: new Set(pick[kind]().map((r) => r.id)), all: false, anchor: null });
  };

  const api: ListApi = {
    get focusedId() {
      return get().focusId;
    },
    get selectedIds() {
      return new Set(selected().map((r) => r.id));
    },
    get allSelected() {
      return get().selection.all;
    },
    get rows() {
      return get().rows;
    },
    focusRow,
    moveFocus(delta) {
      const { rows, focusId, store } = get();
      if (rows.length === 0) return;
      const at = rows.findIndex((r) => r.id === focusId);
      const from = at < 0 ? (delta > 0 ? -1 : rows.length) : at;
      const next = Math.max(0, Math.min(rows.length - 1, from + delta));
      if (next >= rows.length - LOAD_AHEAD) store.ensureLoaded(next + LOAD_AHEAD * 2);
      const row = rows[next];
      if (row) focusRow(row.id);
    },
    toggleSelect: (id) => toggleSelect(id),
    select,
    selectAllMatching: () => set.setSelection((s) => ({ ...s, all: true })),
    toggleAll: () => select(selected().length > 0 || get().selection.all ? "none" : "all"),
    open: (id) => open(id),
    targets,
    archive: () => archive(),
    trash: () => remove(),
    async confirmDelete(rows) {
      const { actions, scope } = get();
      set.setConfirming(null);
      set.setSelection(NO_SELECTION);
      await actions.deleteForever(rows, scope);
    },
    reportSpam() {
      const { actions, scope, presentation } = get();
      return leaving(undefined, (rows) => (presentation.notSpam ? actions.notSpam(rows, scope) : actions.reportSpam(rows, scope)));
    },
    markRead: () => setRead(true),
    markUnread: () => setRead(false),
    setRead: (read) => setRead(read),
    toggleStar: () => toggleStar(),
    setStar(on) {
      const { actions, scope } = get();
      return staying(undefined, (rows) => (on ? actions.star(rows, scope) : actions.unstar(rows, scope)));
    },
    markImportant: () => setImportant(true),
    markNotImportant: () => setImportant(false),
    setImportant: (on) => setImportant(on),
    refresh: () => get().store.refresh(),
    undoLast,
  };

  const handlers: RowHandlers = {
    onSelect: (id, index, range) => toggleSelect(id, index, range),
    onOpen: (row) => open(row.id),
    onFocus: (id) => set.setFocusId(id),
    onStar: (row) => void toggleStar([row]),
    onImportant: (row) => void setImportant(!isImportant(row, get().scope), [row], false),
    onArchive: (row) => void archive([row]),
    onDelete: (row) => void remove([row]),
    onToggleRead: (row) => void setRead(isUnread(row, get().scope), [row]),
  };

  return { api, handlers };
}

/** One per mounted list: its behaviour, and the state the behaviour reads (updated after each render). */
class ListBehaviour {
  #latest: Latest | null = null;
  #focusRequested = false;
  readonly api: ListApi;
  readonly handlers: RowHandlers;

  constructor(set: Setters) {
    const made = makeApi(
      () => this.#latest as Latest,
      set,
      () => {
        this.#focusRequested = true;
      },
    );
    this.api = made.api;
    this.handlers = made.handlers;
  }

  update(latest: Latest): void {
    this.#latest = latest;
  }

  /** A focus move waits for its row to render. */
  get focusRequested(): boolean {
    return this.#focusRequested;
  }

  focusDone(): void {
    this.#focusRequested = false;
  }
}

export function ConversationList(props: ConversationListProps) {
  const { query, presentation, title, route, emptyMessage } = props;
  const client = useJmap();
  const { username } = useAccount();
  const labels = useLabels();
  const actions = useMailActions();
  const { store, snapshot } = useListStore(client, query);
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [focusId, setFocusId] = useState<Id | null>(null);
  const [confirming, setConfirming] = useState<readonly ConversationRow[] | null>(null);
  const now = useMinuteClock();
  const bodyRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const rows = snapshot.rows;
  const count = snapshot.status === "ready" ? snapshot.total : 0;
  const virtual = useVirtualRows(bodyRef, probeRef, count);
  const { scrollToIndex } = virtual;
  const scope = query.scope;

  const [behaviour] = useState(() => new ListBehaviour({ setSelection, setFocusId, setConfirming }));
  const { api, handlers } = behaviour;
  useLayoutEffect(() => {
    behaviour.update({ rows, selection, focusId, presentation, scope, route, store, actions, scrollToIndex });
  });

  useEffect(() => setActiveList(api), [api]);

  // Load the next page as the end of what is loaded comes into view.
  useEffect(() => {
    if (snapshot.status !== "ready" || snapshot.complete) return;
    if (virtual.end > rows.length - LOAD_AHEAD) store.ensureLoaded(virtual.end + LOAD_AHEAD);
  }, [virtual.end, rows.length, snapshot.status, snapshot.complete, store]);

  // Back from a conversation: focus returns to its row (or the one that took its place).
  useEffect(() => {
    if (snapshot.status !== "ready") return;
    const id = takeReturnFocus(rows);
    if (id) api.focusRow(id);
  });

  // Keyboard focus follows focusRow / moveFocus once the row is rendered.
  useEffect(() => {
    if (!behaviour.focusRequested || focusId === null) return;
    const el = [...(gridRef.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [])].find((r) => r.dataset["rowId"] === focusId);
    if (!el) return;
    behaviour.focusDone();
    el.focus({ preventScroll: true });
  });

  const selectedRows = useMemo(() => (selection.all ? rows : rows.filter((r) => selection.ids.has(r.id))), [rows, selection]);
  const selectedIds = useMemo(() => new Set(selectedRows.map((r) => r.id)), [selectedRows]);
  const selectedCount = selection.all ? snapshot.total : selectedRows.length;
  const allLoadedSelected = rows.length > 0 && selectedRows.length === rows.length;

  const chipLabels = useMemo<ChipLabel[]>(() => labels.labels.map((l) => ({ id: l.id, title: l.system ? l.title : l.path, system: l.system })), [labels.labels]);
  const context = useMemo<RowContext>(
    () => ({
      scope,
      me: username,
      senderMode: presentation.senderMode,
      ...(query.matches ? { matches: query.matches } : {}),
      labels: chipLabels,
      currentLabelId: presentation.currentLabelId,
      now,
      canArchive: presentation.canArchive,
      deleteForever: presentation.deleteForever,
      ...(props.renderSubject ? { renderSubject: props.renderSubject } : {}),
    }),
    [scope, username, presentation, query.matches, chipLabels, now, props.renderSubject],
  );

  const focusIndex = focusId === null ? -1 : rows.findIndex((r) => r.id === focusId);
  const tabStop = focusIndex >= virtual.start && focusIndex < Math.min(virtual.end, rows.length) ? focusIndex : Math.min(virtual.start, rows.length - 1);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).getAttribute("role") !== "row" || event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case "ArrowDown":
        api.moveFocus(1);
        break;
      case "ArrowUp":
        api.moveFocus(-1);
        break;
      case "Home":
        if (rows[0]) api.focusRow(rows[0].id);
        break;
      case "End": {
        const last = rows[rows.length - 1];
        if (last) api.focusRow(last.id);
        break;
      }
      case "Enter":
        api.open();
        break;
      case " ":
        api.toggleSelect();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const total = snapshot.total.toLocaleString();
  const allLabel = props.allLabel ?? `in ${title}`;
  const paging = count > 0 ? `${(virtual.first + 1).toLocaleString()}–${Math.min(Math.max(virtual.last, virtual.first + 1), count).toLocaleString()} of ${count.toLocaleString()}` : "";
  const announcement = selectedCount > 0 ? `${selectedCount.toLocaleString()} ${selectedCount === 1 ? "conversation" : "conversations"} selected` : "";

  let body: ReactNode;
  if (snapshot.status === "loading") {
    body = <ListSkeleton />;
  } else if (snapshot.status === "error") {
    body =
      snapshot.error instanceof JmapNetworkError ? (
        <ConnectionLost onRetry={() => store.retry()} />
      ) : (
        <ConnectionLost title="Your conversations didn't load" onRetry={() => store.retry()}>
          <p>Something went wrong on the way. Try again in a moment.</p>
        </ConnectionLost>
      );
  } else if (count === 0) {
    body = <EmptyState title={emptyMessage} />;
  } else {
    const items: ReactNode[] = [];
    for (let i = virtual.start; i < virtual.end; i++) {
      const row = rows[i];
      items.push(
        row ? (
          <ConversationRowView
            key={row.id}
            row={row}
            index={i}
            selected={selectedIds.has(row.id)}
            open={route.conversationId === row.id}
            tabbable={i === tabStop}
            context={context}
            handlers={handlers}
          />
        ) : (
          <PlaceholderRow key={`placeholder-${i}`} index={i} />
        ),
      );
    }
    body = (
      <div
        ref={gridRef}
        role="grid"
        aria-label={`Conversations ${allLabel}`}
        aria-rowcount={count}
        aria-multiselectable="true"
        className="list-grid"
        onKeyDown={onKeyDown}
      >
        <div role="presentation" className="list-canvas" style={{ height: virtual.totalHeight }}>
          <div role="rowgroup" className="list-rows" style={{ transform: `translateY(${virtual.start * virtual.rowHeight}px)` }}>
            {items}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="list-page" aria-labelledby="list-heading">
      <h1 id="list-heading" className="visually-hidden">
        {props.heading ?? title}
      </h1>
      <Toolbar
        presentation={presentation}
        selectedCount={selectedCount}
        allLoadedSelected={allLoadedSelected || selection.all}
        someUnread={selectedRows.some((r) => isUnread(r, scope))}
        someRead={selectedRows.some((r) => !isUnread(r, scope))}
        someStarred={selectedRows.some((r) => isStarred(r, scope))}
        someUnstarred={selection.all || selectedRows.some((r) => !isStarred(r, scope))}
        someImportant={selectedRows.some((r) => isImportant(r, scope))}
        someNotImportant={selection.all || selectedRows.some((r) => !isImportant(r, scope))}
        paging={paging}
        conversationIds={selectedRows.map((r) => r.id)}
        emailIds={selectedRows.flatMap((r) => shownMessages(r, scope).map((m) => m.id))}
        labelRoute={props.labelRoute}
        onSelect={(kind) => api.select(kind)}
        onToggleAll={() => api.toggleAll()}
        onRefresh={() => void api.refresh()}
        onArchive={() => void api.archive()}
        onSpam={() => void api.reportSpam()}
        onDelete={() => void api.trash()}
        onRead={(read) => void api.setRead(read)}
        onStar={(on) => void api.setStar(on)}
        onImportant={(on) => void api.setImportant(on)}
        onLabelsDone={() => {}}
        onMoveDone={() => api.select("none")}
      />
      {selection.all ? (
        <div className="list-banner">
          <span>
            All {total} conversations {allLabel} are selected.
          </span>
          <button type="button" className="btn btn-quiet list-banner-action" onClick={() => api.select("none")}>
            Clear selection
          </button>
        </div>
      ) : allLoadedSelected && snapshot.total > rows.length ? (
        <div className="list-banner">
          <span>All {rows.length.toLocaleString()} conversations shown are selected.</span>
          <button type="button" className="btn btn-quiet list-banner-action" onClick={() => api.selectAllMatching()}>
            Select all {total} conversations {allLabel}
          </button>
        </div>
      ) : null}
      <div ref={bodyRef} className="list-body">
        <div ref={probeRef} className="list-probe" aria-hidden="true" />
        {body}
      </div>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Delete forever?"
          body={`${confirming.length === 1 ? "This conversation" : `These ${confirming.length.toLocaleString()} conversations`} will be deleted forever. This can't be undone.`}
          confirmLabel="Delete forever"
          onConfirm={() => void api.confirmDelete(confirming)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </section>
  );
}
