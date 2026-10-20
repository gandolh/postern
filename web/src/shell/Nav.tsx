// The left navigation: Compose, the system labels with their counts, the user
// labels nested and collapsible with "More" for the hidden ones, and Contacts.
// In rail mode only the icons show; the names stay for screen readers.

import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronRight, ChevronUp, File, Inbox, Mails, Pencil, Send, ShieldAlert, Star, Tag, Trash2, Users } from "lucide-react";
import { useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import { useCompose } from "../composer";
import type { LabelNode, SystemEntry } from "../labels/labelsStore";
import { useLabelColor, useLabelPrefs } from "../labels/useLabelPrefs";
import { useLabelDropTarget } from "../labels/useLabelDropTarget";
import { visibleNodes } from "../labels/visibility";
import "../labels/labels.css";
import { useLabels } from "../labels/useLabels";
import { formatRoute, SYSTEM_VIEWS, type Route, type SystemView } from "./router";
import { NavSkeleton } from "./states";

const SYSTEM_ICONS: Record<SystemView, LucideIcon> = {
  inbox: Inbox,
  starred: Star,
  sent: Send,
  drafts: File,
  spam: ShieldAlert,
  trash: Trash2,
  all: Mails,
};

const countFormat = new Intl.NumberFormat();

/** The number beside a label, shown only; the link's aria-label says it (countLabel). */
function Count({ value }: { value: number | null }) {
  if (value === null || value <= 0) return null;
  return (
    <span className="shell-nav-count" aria-hidden="true">
      {countFormat.format(value)}
    </span>
  );
}

/** "Inbox 127 unread": the accessible name of a label with a count; it starts with the visible text. */
function countLabel(title: string, value: number | null, noun: string): string | undefined {
  return value !== null && value > 0 ? `${title} ${countFormat.format(value)} ${noun}` : undefined;
}

function isCurrentSystem(route: Route, view: SystemView): boolean {
  return route.kind === "system" && route.view === view;
}

function isCurrentLabel(route: Route, id: string): boolean {
  return route.kind === "label" && route.labelId === id;
}

export interface NavProps {
  route: Route;
  /** expanded: names and icons; rail: icons only; drawer: expanded, over the page. */
  mode: "expanded" | "rail" | "drawer" | "hidden";
  /** A link in the navigation was followed (the drawer closes). */
  onNavigate?: () => void;
}

export function Nav({ route, mode, onNavigate }: NavProps) {
  const labels = useLabels();
  const compose = useCompose();
  const rail = mode === "rail";

  function onClick(event: MouseEvent<HTMLElement>): void {
    if ((event.target as HTMLElement).closest("a")) onNavigate?.();
  }

  return (
    <nav id="shell-nav" className="shell-nav" aria-label="Mail" data-mode={mode} onClick={onClick}>
      <button
        type="button"
        className="shell-compose"
        onClick={() => compose.open()}
        title={rail ? "Compose" : undefined}
      >
        <Pencil aria-hidden="true" />
        <span className="shell-nav-text">Compose</span>
      </button>

      <ul className="shell-nav-list">
        {SYSTEM_VIEWS.map((view) => (
          <SystemItem key={view} entry={labels.system[view]} current={isCurrentSystem(route, view)} rail={rail} />
        ))}
      </ul>

      <div className="shell-nav-section">
        <h2 className="shell-nav-heading">Labels</h2>
        {labels.status === "loading" ? (
          <NavSkeleton />
        ) : labels.status === "error" ? (
          <p className="shell-nav-note" role="alert">
            Labels didn't load.{" "}
            <button type="button" className="shell-nav-retry" onClick={() => void labels.store.sync()}>
              Retry
            </button>
          </p>
        ) : (
          <LabelTree tree={labels.tree} hidden={labels.hidden} route={route} rail={rail} />
        )}
      </div>

      <ul className="shell-nav-list shell-nav-foot">
        <li>
          <a
            className="shell-nav-item"
            href={formatRoute({ kind: "contacts" })}
            aria-current={route.kind === "contacts" ? "page" : undefined}
            title={rail ? "Contacts" : undefined}
          >
            <Users aria-hidden="true" />
            <span className="shell-nav-text">Contacts</span>
          </a>
        </li>
      </ul>
    </nav>
  );
}

function SystemItem({ entry, current, rail }: { entry: SystemEntry; current: boolean; rail: boolean }) {
  const Icon = SYSTEM_ICONS[entry.view];
  const unread = entry.count === "unread" && entry.badge !== null;
  const noun = entry.count === "total" ? (entry.badge === 1 ? "draft" : "drafts") : "unread";
  return (
    <li>
      <a
        className="shell-nav-item"
        href={formatRoute({ kind: "system", view: entry.view })}
        aria-current={current ? "page" : undefined}
        aria-label={countLabel(entry.title, entry.badge, noun)}
        data-unread={unread ? "true" : undefined}
        title={rail ? entry.title : undefined}
      >
        <Icon aria-hidden="true" />
        <span className="shell-nav-text">{entry.title}</span> <Count value={entry.badge} />
      </a>
    </li>
  );
}

interface LabelTreeProps {
  tree: readonly LabelNode[];
  hidden: readonly LabelNode[];
  route: Route;
  rail: boolean;
}

function LabelTree({ tree: allTree, hidden: allHidden, route, rail }: LabelTreeProps) {
  const { prefs } = useLabelPrefs();
  const currentId = route.kind === "label" ? route.labelId : undefined;
  // "Show if unread" labels leave the navigation while they have nothing unread.
  const tree = useMemo(() => visibleNodes(allTree, prefs, currentId), [allTree, prefs, currentId]);
  const hidden = useMemo(() => visibleNodes(allHidden, prefs, currentId), [allHidden, prefs, currentId]);
  const [showHidden, setShowHidden] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setCollapsed((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (allTree.length === 0 && allHidden.length === 0) {
    return <p className="shell-nav-note">No labels yet</p>;
  }

  return (
    <>
      <ul className="shell-nav-list">
        {tree.map((node) => (
          <LabelItem key={node.label.id} node={node} route={route} rail={rail} collapsed={collapsed} onToggle={toggle} />
        ))}
      </ul>
      {hidden.length > 0 ? (
        <>
          <button type="button" className="shell-nav-item shell-nav-more" aria-expanded={showHidden} onClick={() => setShowHidden((s) => !s)}>
            {showHidden ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            <span className="shell-nav-text">{showHidden ? "Less" : "More"}</span>
          </button>
          {showHidden ? (
            <ul className="shell-nav-list">
              {hidden.map((node) => (
                <LabelItem key={node.label.id} node={node} route={route} rail={rail} collapsed={collapsed} onToggle={toggle} />
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </>
  );
}

interface LabelItemProps {
  node: LabelNode;
  route: Route;
  rail: boolean;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

function LabelItem({ node, route, rail, collapsed, onToggle }: LabelItemProps) {
  const { label, children, depth } = node;
  const open = !collapsed.has(label.id);
  const hasChildren = children.length > 0;
  const unread = label.unreadThreads > 0;
  const color = useLabelColor(label.id);
  const drop = useLabelDropTarget(label.id, route);
  return (
    <li>
      <div className="shell-nav-row" style={{ "--depth": depth } as CSSProperties}>
        {hasChildren && !rail ? (
          <button
            type="button"
            className="shell-nav-twisty"
            aria-expanded={open}
            aria-label={`${label.title} sublabels`}
            onClick={() => onToggle(label.id)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        ) : (
          <span className="shell-nav-twisty-space" aria-hidden="true" />
        )}
        <a
          className="shell-nav-item"
          href={formatRoute({ kind: "label", labelId: label.id })}
          aria-current={isCurrentLabel(route, label.id) ? "page" : undefined}
          aria-label={countLabel(label.title, label.unreadThreads, "unread")}
          data-unread={unread ? "true" : undefined}
          title={rail || depth > 0 ? label.path : undefined}
          {...drop}
        >
          <Tag aria-hidden="true" data-label-color={color} />
          <span className="shell-nav-text">{label.title}</span> <Count value={label.unreadThreads} />
        </a>
      </div>
      {hasChildren && open && !rail ? (
        <ul className="shell-nav-list">
          {children.map((child) => (
            <LabelItem key={child.label.id} node={child} route={route} rail={rail} collapsed={collapsed} onToggle={onToggle} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
