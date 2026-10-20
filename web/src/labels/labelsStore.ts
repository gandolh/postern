// The label list (JMAP mailboxes) with counts, for the navigation and every
// screen that needs a label's name, id or counts. One LabelsStore per signed-in
// session; useLabels.ts provides it. Kept current with Mailbox/changes.
//
// System labels are found by JMAP role, never by name: Stalwart calls them
// "Junk Mail" and "Deleted Items", the UI always says Gmail's words. Starred
// is not a mailbox (it is the $flagged keyword). Stalwart creates no
// archive-role mailbox, so All Mail may have no mailbox behind it; brief 06
// creates it the first time something is archived. Nothing here creates one.

import {
  isAbortError,
  JmapNetworkError,
  ObjectStore,
  SessionExpiredError,
  SignedOutError,
  syncObjects,
  type Id,
  type Mailbox,
  type MailboxRights,
  type MailboxRole,
  type MethodCaller,
  type StateChange,
  type SyncResult,
} from "@postern/jmap";
import { SYSTEM_VIEWS, type LabelRoute, type SystemView } from "../shell/router";

// ---- What each system label is -------------------------------------------

/** What the navigation shows beside a system label. */
export type SystemCount = "unread" | "total" | "none";

export interface SystemLabelInfo {
  view: SystemView;
  /** Gmail's word, always. */
  title: string;
  /** The JMAP role behind it; null for Starred (the $flagged keyword). */
  role: MailboxRole | null;
  /** Inbox and Spam show unread conversations; Drafts shows how many drafts there are. */
  count: SystemCount;
}

export const SYSTEM_LABELS: Readonly<Record<SystemView, SystemLabelInfo>> = {
  inbox: { view: "inbox", title: "Inbox", role: "inbox", count: "unread" },
  starred: { view: "starred", title: "Starred", role: null, count: "none" },
  sent: { view: "sent", title: "Sent", role: "sent", count: "none" },
  drafts: { view: "drafts", title: "Drafts", role: "drafts", count: "total" },
  spam: { view: "spam", title: "Spam", role: "junk", count: "unread" },
  trash: { view: "trash", title: "Trash", role: "trash", count: "none" },
  all: { view: "all", title: "All Mail", role: "archive", count: "none" },
};

const VIEW_BY_ROLE = new Map<string, SystemView>(
  SYSTEM_VIEWS.flatMap((view) => {
    const role = SYSTEM_LABELS[view].role;
    return role ? [[role, view] as const] : [];
  }),
);

/** The system label for a mailbox role, if the role is one of Gmail's. */
export function viewForRole(role: MailboxRole | null | undefined): SystemView | undefined {
  return role ? VIEW_BY_ROLE.get(role) : undefined;
}

// ---- The UI's label -------------------------------------------------------

/** A mailbox as the UI sees it. */
export interface Label {
  id: Id;
  /** The mailbox's own name ("Junk Mail" for Spam). Show `title` instead. */
  name: string;
  /** What the UI shows: Gmail's word for a system label, the name otherwise. */
  title: string;
  /** Names from the root, `Work/Clients`. */
  path: string;
  parentId: Id | null;
  role: MailboxRole | null;
  /** The system label this is, or null for a user label. */
  system: SystemView | null;
  sortOrder: number;
  /** Unsubscribed labels sit under "More" in the navigation. */
  isSubscribed: boolean;
  unreadThreads: number;
  totalThreads: number;
  unreadEmails: number;
  totalEmails: number;
  myRights: MailboxRights;
}

/** A user label and its sublabels, sorted. */
export interface LabelNode {
  label: Label;
  depth: number;
  children: LabelNode[];
}

/** A system label in the navigation. */
export interface SystemEntry extends SystemLabelInfo {
  /** The mailbox; undefined for Starred, and for All Mail until an archive mailbox exists. */
  label: Label | undefined;
  /** The number beside it, or null for none (zero shows none). */
  badge: number | null;
}

export type LabelsStatus = "loading" | "ready" | "error";

/** Everything the label list holds, immutable; a new object after each change. */
export interface LabelsSnapshot {
  /** `loading` until the first Mailbox/get lands; `error` if that failed. Later failures keep `ready` and set `error`. */
  status: LabelsStatus;
  /** The last sync's failure, if it failed (cleared by the next success). */
  error: unknown;
  /** True when that failure was the network (the "connection lost" state). */
  offline: boolean;
  /** The Mailbox state string the data is at. */
  state: string | null;
  /** Every mailbox, system ones first in Gmail's order, then user labels by tree order. */
  labels: readonly Label[];
  byId: ReadonlyMap<Id, Label>;
  system: Readonly<Record<SystemView, SystemEntry>>;
  /** User labels shown in the navigation, nested. */
  tree: readonly LabelNode[];
  /** User labels hidden under "More" (unsubscribed top-level labels and their sublabels). */
  hidden: readonly LabelNode[];
}

function byOrder(a: Label, b: Label): number {
  return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || (a.id < b.id ? -1 : 1);
}

function pathOf(mailbox: Mailbox, byId: ReadonlyMap<Id, Mailbox>): string {
  const parts = [mailbox.name];
  const seen = new Set<Id>([mailbox.id]);
  let parent = mailbox.parentId;
  while (parent && !seen.has(parent)) {
    const p = byId.get(parent);
    if (!p) break;
    parts.unshift(p.name);
    seen.add(p.id);
    parent = p.parentId;
  }
  return parts.join("/");
}

function systemBadge(info: SystemLabelInfo, label: Label | undefined): number | null {
  if (!label) return null;
  const n = info.count === "unread" ? label.unreadThreads : info.count === "total" ? label.totalEmails : 0;
  return n > 0 ? n : null;
}

/** The parts of a snapshot built from the mailboxes. Pure. */
export function buildLabels(mailboxes: readonly Mailbox[]): Pick<LabelsSnapshot, "labels" | "byId" | "system" | "tree" | "hidden"> {
  const mailboxById = new Map<Id, Mailbox>(mailboxes.map((m) => [m.id, m]));

  // A role belongs to the first mailbox holding it; a second one is an ordinary label.
  const systemByView = new Map<SystemView, Label>();
  const all: Label[] = [];
  const sorted = [...mailboxes].sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1));
  for (const m of sorted) {
    let system = viewForRole(m.role) ?? null;
    if (system && systemByView.has(system)) system = null;
    const label: Label = {
      id: m.id,
      name: m.name,
      title: system ? SYSTEM_LABELS[system].title : m.name,
      path: pathOf(m, mailboxById),
      parentId: m.parentId,
      role: m.role,
      system,
      sortOrder: m.sortOrder,
      isSubscribed: m.isSubscribed,
      unreadThreads: m.unreadThreads,
      totalThreads: m.totalThreads,
      unreadEmails: m.unreadEmails,
      totalEmails: m.totalEmails,
      myRights: m.myRights,
    };
    if (system) systemByView.set(system, label);
    all.push(label);
  }

  const system = Object.fromEntries(
    SYSTEM_VIEWS.map((view) => {
      const info = SYSTEM_LABELS[view];
      const label = systemByView.get(view);
      return [view, { ...info, label, badge: systemBadge(info, label) } satisfies SystemEntry];
    }),
  ) as Record<SystemView, SystemEntry>;

  // User labels, nested by parentId. A label whose parent is a system mailbox,
  // or missing, or part of a cycle, is a root.
  const users = all.filter((l) => l.system === null);
  const userIds = new Set(users.map((l) => l.id));
  const childrenOf = new Map<Id | null, Label[]>();
  for (const label of users) {
    const parent = label.parentId && userIds.has(label.parentId) && label.parentId !== label.id ? label.parentId : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(label);
    childrenOf.set(parent, list);
  }
  const placed = new Set<Id>();
  const grow = (label: Label, depth: number): LabelNode => {
    placed.add(label.id);
    const children = (childrenOf.get(label.id) ?? []).filter((c) => !placed.has(c.id)).sort(byOrder);
    return { label, depth, children: children.map((c) => grow(c, depth + 1)) };
  };
  const roots = (childrenOf.get(null) ?? []).sort(byOrder).map((l) => grow(l, 0));
  // Labels caught in a parent cycle never reach a root: show them at the top.
  for (const label of users.filter((l) => !placed.has(l.id)).sort(byOrder)) {
    if (!placed.has(label.id)) roots.push(grow(label, 0));
  }

  const tree = roots.filter((n) => n.label.isSubscribed);
  const hidden = roots.filter((n) => !n.label.isSubscribed);

  const flatten = (nodes: readonly LabelNode[]): Label[] => nodes.flatMap((n) => [n.label, ...flatten(n.children)]);
  const ordered = [
    ...SYSTEM_VIEWS.flatMap((v) => (systemByView.get(v) ? [systemByView.get(v)!] : [])),
    ...flatten(tree),
    ...flatten(hidden),
  ];
  return { labels: ordered, byId: new Map(ordered.map((l) => [l.id, l])), system, tree, hidden };
}

// ---- Resolving a route to a label ------------------------------------------

/** What a label route points at, for the list (brief 06) and the conversation view (brief 07). */
export interface ResolvedLabel {
  route: LabelRoute;
  /** The heading: "Inbox", "Spam", "All Mail", or the user label's name. */
  title: string;
  /** The system label, or null for a user label. */
  view: SystemView | null;
  /** The mailbox behind it. Undefined for Starred, and for All Mail while no archive mailbox exists. */
  label: Label | undefined;
  /** `label.id`, for `inMailbox` filters. */
  mailboxId: Id | undefined;
  /** Starred is the `$flagged` keyword across every label. */
  keyword: "$flagged" | undefined;
}

/**
 * The label a route shows. Null when it is a user label the account does not
 * have (deleted, or a stale link), or while the labels are still loading.
 */
export function resolveLabelRoute(route: LabelRoute, snapshot: Pick<LabelsSnapshot, "byId" | "system">): ResolvedLabel | null {
  if (route.kind === "system") {
    const entry = snapshot.system[route.view];
    return {
      route,
      title: entry.title,
      view: route.view,
      label: entry.label,
      mailboxId: entry.label?.id,
      keyword: route.view === "starred" ? "$flagged" : undefined,
    };
  }
  const label = snapshot.byId.get(route.labelId);
  if (!label) return null;
  return { route, title: label.title, view: label.system, label, mailboxId: label.id, keyword: undefined };
}

// ---- The store --------------------------------------------------------------

const EMPTY = buildLabels([]);

export const INITIAL_LABELS: LabelsSnapshot = Object.freeze({
  status: "loading",
  error: null,
  offline: false,
  state: null,
  ...EMPTY,
});

/** Session errors are the sign-in layer's to show (brief 04): never an error state here. */
function isQuiet(err: unknown): boolean {
  return isAbortError(err) || err instanceof SessionExpiredError || err instanceof SignedOutError;
}

/**
 * The account's labels, kept current. React reads it through
 * `useSyncExternalStore(store.subscribe, store.getSnapshot)` (useLabels).
 *
 * Brief 11 keeps the counts live by passing each push `StateChange` to
 * `applyStateChange`; anything else that knows mailboxes changed calls `sync`.
 */
export class LabelsStore {
  readonly #client: MethodCaller;
  readonly #accountId: () => Id;
  readonly #mailboxes = new ObjectStore<Mailbox>("Mailbox");
  readonly #listeners = new Set<() => void>();
  #snapshot: LabelsSnapshot = INITIAL_LABELS;
  #running: Promise<void> | null = null;
  #again = false;
  #disposed = false;

  /** @param accountId the mail account, read at each sync (the client's `accountId`). */
  constructor(client: MethodCaller, accountId: () => Id) {
    this.#client = client;
    this.#accountId = accountId;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): LabelsSnapshot => this.#snapshot;

  /** The Mailbox state the store is at (null before the first load). */
  get state(): string | null {
    return this.#mailboxes.state;
  }

  /** The mailbox id with a role (`inbox`, `junk`, `archive`...), if the account has one. */
  mailboxIdForRole(role: MailboxRole): Id | undefined {
    const view = viewForRole(role);
    if (view) return this.#snapshot.system[view].label?.id;
    return this.#snapshot.labels.find((l) => l.role === role)?.id;
  }

  /**
   * Bring the labels up to date: the first call loads every mailbox, later
   * calls fetch `Mailbox/changes` from the held state (and everything again
   * if the server cannot calculate them). Calls made while a sync runs share
   * it, and one more sync follows so nothing is missed. Never rejects: a
   * failure lands in the snapshot's `error`.
   */
  sync(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = (async () => {
      try {
        do {
          this.#again = false;
          await this.#syncOnce();
        } while (this.#again && !this.#disposed);
      } finally {
        this.#running = null;
      }
    })();
    return this.#running;
  }

  /**
   * Brief 11's entry point: a push `StateChange`. Syncs only when it names a
   * Mailbox state for this account that differs from the one held.
   */
  applyStateChange(change: StateChange): Promise<void> {
    const next = change.changed[this.#accountId()]?.["Mailbox"];
    if (next === undefined || next === this.#mailboxes.state) return Promise.resolve();
    return this.sync();
  }

  /** Stop syncing and notifying (the session ended). In-flight requests finish unseen. */
  dispose(): void {
    this.#disposed = true;
  }

  /** Undo `dispose` (the provider mounting again). */
  activate(): void {
    this.#disposed = false;
  }

  async #syncOnce(): Promise<void> {
    let result: SyncResult;
    try {
      result = await syncObjects(this.#client, "Mailbox", this.#mailboxes);
      if (result.status === "cannotCalculateChanges") {
        // The store was cleared: load everything again.
        result = await syncObjects(this.#client, "Mailbox", this.#mailboxes);
      }
    } catch (err) {
      if (isQuiet(err)) return;
      this.#publish({
        ...this.#snapshot,
        status: this.#snapshot.status === "ready" ? "ready" : "error",
        error: err,
        offline: err instanceof JmapNetworkError,
      });
      return;
    }
    if (result.status === "unchanged" && this.#snapshot.status === "ready" && this.#snapshot.error === null) return;
    this.#publish({
      status: "ready",
      error: null,
      offline: false,
      state: this.#mailboxes.state,
      ...buildLabels(this.#mailboxes.values()),
    });
  }

  #publish(snapshot: LabelsSnapshot): void {
    if (this.#disposed) return;
    this.#snapshot = snapshot;
    for (const listener of [...this.#listeners]) listener();
  }
}
