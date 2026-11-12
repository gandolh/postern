// The left navigation: Compose, the system labels with their counts (and
// Scheduled after Drafts, when the server can hold a message:), the
// user labels nested and collapsible with "More" for the hidden ones, and
// Contacts.
// In rail mode only the icons show; the names stay for screen readers.

import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  File,
  Inbox,
  Mails,
  Pencil,
  Send,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import {
  createContext,
  Fragment,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type MouseEvent,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useCompose } from "../composer";
import { useOptionalComposerStore } from "../composer/compose";
import type { LabelNode, SystemEntry } from "../labels/labelsStore";
import { useLabelColor, useLabelPrefs } from "../labels/useLabelPrefs";
import { useLabelDropTarget } from "../labels/useLabelDropTarget";
import { visibleNodes } from "../labels/visibility";
import { useLabels } from "../labels/useLabels";
import { formatRoute, SYSTEM_VIEWS, type Route, type SystemView } from "./router";
import { NavSkeleton } from "./states";

const SYSTEM_ICONS: Record<SystemView, LucideIcon> = {
  inbox: Inbox,
  starred: Star,
  snoozed: Clock,
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
    <span
      className="ml-auto flex-none text-xs tracking-[0.01em] tabular-nums in-data-[nav=rail]:absolute in-data-[nav=rail]:top-0 in-data-[nav=rail]:right-1 in-data-[nav=rail]:min-w-4.5 in-data-[nav=rail]:rounded-pill in-data-[nav=rail]:bg-accent in-data-[nav=rail]:px-[0.3rem] in-data-[nav=rail]:py-0.5 in-data-[nav=rail]:text-center in-data-[nav=rail]:text-[0.6875rem] in-data-[nav=rail]:leading-none in-data-[nav=rail]:font-bold in-data-[nav=rail]:text-on-accent"
      aria-hidden="true"
    >
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

/**
 * What the label tree remembers: which parents are folded, whether the hidden
 * labels show, and where the panel was scrolled. The shell keeps it above the
 * navigation, because the drawer mounts a fresh `Nav` each time it opens.
 */
export interface NavMemory {
  collapsed: ReadonlySet<string>;
  setCollapsed: Dispatch<SetStateAction<ReadonlySet<string>>>;
  showHidden: boolean;
  setShowHidden: Dispatch<SetStateAction<boolean>>;
  scrollTop: MutableRefObject<number>;
}

const NavMemoryContext = createContext<NavMemory | null>(null);

export function NavMemoryProvider({ memory, children }: { memory: NavMemory; children: ReactNode }) {
  return <NavMemoryContext.Provider value={memory}>{children}</NavMemoryContext.Provider>;
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
  const canSchedule = useOptionalComposerStore()?.canSchedule ?? false;
  const rail = mode === "rail";

  function onClick(event: MouseEvent<HTMLElement>): void {
    if ((event.target as HTMLElement).closest("a")) onNavigate?.();
  }

  return (
    <nav
      id="shell-nav"
      className="flex min-h-full flex-col pt-2 pr-2 pb-4 pl-2 [--nav-inset:1.75rem] in-data-[nav=rail]:items-center in-data-[nav=rail]:px-2"
      aria-label="Mail"
      data-mode={mode}
      onClick={onClick}
    >
      <button
        type="button"
        className="mb-4 inline-flex h-13 cursor-pointer items-center gap-3 self-start rounded-lg bg-accent pr-6 pl-5 text-md font-semibold text-on-accent shadow-sm transition-[background-color,box-shadow] duration-(--duration-fast) ease-out hover:bg-accent-hover hover:shadow-md in-data-[nav=rail]:w-13 in-data-[nav=rail]:justify-center in-data-[nav=rail]:self-center in-data-[nav=rail]:p-0"
        onClick={() => compose.open()}
        title={rail ? "Compose" : undefined}
      >
        <Pencil aria-hidden="true" />
        <span className="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap in-data-[nav=rail]:absolute in-data-[nav=rail]:size-px in-data-[nav=rail]:[clip-path:inset(50%)]">
          Compose
        </span>
      </button>

      <ul className="m-0 list-none p-0 in-data-[nav=rail]:w-full">
        {SYSTEM_VIEWS.map((view) => (
          <Fragment key={view}>
            <SystemItem entry={labels.system[view]} current={isCurrentSystem(route, view)} rail={rail} />
            {view === "drafts" && canSchedule ? (
              <li>
                <a
                  className="relative flex h-(--nav-item-height) w-full cursor-pointer items-center gap-3 rounded-md bg-transparent pr-3 pl-[calc(var(--nav-inset)+var(--depth,0)*1rem)] text-start text-md leading-none text-text no-underline transition-[background-color] duration-(--duration-fast) ease-out hover:bg-hover hover:text-text data-[unread=true]:font-bold aria-[current=page]:bg-accent-soft aria-[current=page]:font-bold aria-[current=page]:text-on-accent-soft [&_.lucide]:text-text-muted aria-[current=page]:[&_.lucide]:text-on-accent-soft in-data-[nav=rail]:mx-auto in-data-[nav=rail]:mb-1 in-data-[nav=rail]:h-9 in-data-[nav=rail]:w-14 in-data-[nav=rail]:justify-center in-data-[nav=rail]:rounded-pill in-data-[nav=rail]:p-0"
                  href={formatRoute({ kind: "scheduled" })}
                  aria-current={route.kind === "scheduled" ? "page" : undefined}
                  title={rail ? "Scheduled" : undefined}
                >
                  <CalendarClock aria-hidden="true" />
                  <span className="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap in-data-[nav=rail]:absolute in-data-[nav=rail]:size-px in-data-[nav=rail]:[clip-path:inset(50%)]">
                    Scheduled
                  </span>
                </a>
              </li>
            ) : null}
          </Fragment>
        ))}
      </ul>

      <div className="mt-4 in-data-[nav=rail]:mt-2 in-data-[nav=rail]:w-full in-data-[nav=rail]:border-t in-data-[nav=rail]:border-border in-data-[nav=rail]:pt-2">
        <h2 className="flex min-h-9 items-center pr-3 pl-(--nav-inset) text-md font-semibold text-text in-data-[nav=rail]:hidden">
          Labels
        </h2>
        {labels.status === "loading" ? (
          <NavSkeleton />
        ) : labels.status === "error" ? (
          <p className="py-1 pr-3 pl-(--nav-inset) text-sm text-text-muted in-data-[nav=rail]:hidden" role="alert">
            Labels didn't load.{" "}
            <button
              type="button"
              className="cursor-pointer bg-transparent p-0 text-accent underline [font:inherit]"
              onClick={() => void labels.store.sync()}
            >
              Retry
            </button>
          </p>
        ) : (
          <LabelTree tree={labels.tree} hidden={labels.hidden} route={route} rail={rail} />
        )}
      </div>

      <ul className="m-0 list-none p-0 in-data-[nav=rail]:w-full mt-auto pt-4">
        <li>
          <a
            className="relative flex h-(--nav-item-height) w-full cursor-pointer items-center gap-3 rounded-md bg-transparent pr-3 pl-[calc(var(--nav-inset)+var(--depth,0)*1rem)] text-start text-md leading-none text-text no-underline transition-[background-color] duration-(--duration-fast) ease-out hover:bg-hover hover:text-text data-[unread=true]:font-bold aria-[current=page]:bg-accent-soft aria-[current=page]:font-bold aria-[current=page]:text-on-accent-soft [&_.lucide]:text-text-muted aria-[current=page]:[&_.lucide]:text-on-accent-soft in-data-[nav=rail]:mx-auto in-data-[nav=rail]:mb-1 in-data-[nav=rail]:h-9 in-data-[nav=rail]:w-14 in-data-[nav=rail]:justify-center in-data-[nav=rail]:rounded-pill in-data-[nav=rail]:p-0"
            href={formatRoute({ kind: "contacts" })}
            aria-current={route.kind === "contacts" ? "page" : undefined}
            title={rail ? "Contacts" : undefined}
          >
            <Users aria-hidden="true" />
            <span className="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap in-data-[nav=rail]:absolute in-data-[nav=rail]:size-px in-data-[nav=rail]:[clip-path:inset(50%)]">
              Contacts
            </span>
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
        className="relative flex h-(--nav-item-height) w-full cursor-pointer items-center gap-3 rounded-md bg-transparent pr-3 pl-[calc(var(--nav-inset)+var(--depth,0)*1rem)] text-start text-md leading-none text-text no-underline transition-[background-color] duration-(--duration-fast) ease-out hover:bg-hover hover:text-text data-[unread=true]:font-bold aria-[current=page]:bg-accent-soft aria-[current=page]:font-bold aria-[current=page]:text-on-accent-soft [&_.lucide]:text-text-muted aria-[current=page]:[&_.lucide]:text-on-accent-soft in-data-[nav=rail]:mx-auto in-data-[nav=rail]:mb-1 in-data-[nav=rail]:h-9 in-data-[nav=rail]:w-14 in-data-[nav=rail]:justify-center in-data-[nav=rail]:rounded-pill in-data-[nav=rail]:p-0"
        href={formatRoute({ kind: "system", view: entry.view })}
        aria-current={current ? "page" : undefined}
        aria-label={countLabel(entry.title, entry.badge, noun)}
        data-unread={unread ? "true" : undefined}
        title={rail ? entry.title : undefined}
      >
        <Icon aria-hidden="true" />
        <span className="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap in-data-[nav=rail]:absolute in-data-[nav=rail]:size-px in-data-[nav=rail]:[clip-path:inset(50%)]">
          {entry.title}
        </span>{" "}
        <Count value={entry.badge} />
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
  const local = {
    showHidden: useState(false),
    collapsed: useState<ReadonlySet<string>>(() => new Set()),
  };
  const memory = useContext(NavMemoryContext);
  const [showHidden, setShowHidden] = memory ? [memory.showHidden, memory.setShowHidden] : local.showHidden;
  const [collapsed, setCollapsed] = memory ? [memory.collapsed, memory.setCollapsed] : local.collapsed;
  const toggle = (id: string) =>
    setCollapsed((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (allTree.length === 0 && allHidden.length === 0) {
    return (
      <p className="py-1 pr-3 pl-(--nav-inset) text-sm text-text-muted in-data-[nav=rail]:hidden">No labels yet</p>
    );
  }

  return (
    <>
      <ul className="m-0 list-none p-0 in-data-[nav=rail]:w-full">
        {tree.map((node) => (
          <LabelItem
            key={node.label.id}
            node={node}
            route={route}
            rail={rail}
            collapsed={collapsed}
            onToggle={toggle}
          />
        ))}
      </ul>
      {hidden.length > 0 ? (
        <>
          <button
            type="button"
            className="relative flex h-(--nav-item-height) w-full cursor-pointer items-center gap-3 rounded-md bg-transparent pr-3 pl-[calc(var(--nav-inset)+var(--depth,0)*1rem)] text-start text-md leading-none no-underline transition-[background-color] duration-(--duration-fast) ease-out hover:bg-hover hover:text-text data-[unread=true]:font-bold aria-[current=page]:bg-accent-soft aria-[current=page]:font-bold aria-[current=page]:text-on-accent-soft [&_.lucide]:text-text-muted aria-[current=page]:[&_.lucide]:text-on-accent-soft in-data-[nav=rail]:mx-auto in-data-[nav=rail]:mb-1 in-data-[nav=rail]:h-9 in-data-[nav=rail]:w-14 in-data-[nav=rail]:justify-center in-data-[nav=rail]:rounded-pill in-data-[nav=rail]:p-0 text-text-muted"
            aria-expanded={showHidden}
            onClick={() => setShowHidden((s) => !s)}
          >
            {showHidden ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            <span className="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap in-data-[nav=rail]:absolute in-data-[nav=rail]:size-px in-data-[nav=rail]:[clip-path:inset(50%)]">
              {showHidden ? "Less" : "More"}
            </span>
          </button>
          {showHidden ? (
            <ul className="m-0 list-none p-0 in-data-[nav=rail]:w-full">
              {hidden.map((node) => (
                <LabelItem
                  key={node.label.id}
                  node={node}
                  route={route}
                  rail={rail}
                  collapsed={collapsed}
                  onToggle={toggle}
                />
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
      <div className="relative" style={{ "--depth": depth } as CSSProperties}>
        {hasChildren && !rail ? (
          <button
            type="button"
            className="absolute top-0 left-[calc(var(--depth,0)*1rem)] z-above grid h-(--nav-item-height) w-6 cursor-pointer place-items-center rounded-sm bg-transparent p-0 text-text-muted hover:bg-active hover:text-text [&_.lucide]:[--icon-size:1rem] [&_.lucide]:transition-transform [&_.lucide]:duration-(--duration-fast) [&_.lucide]:ease-out aria-expanded:[&_.lucide]:rotate-90"
            aria-expanded={open}
            aria-label={`${label.title} sublabels`}
            onClick={() => onToggle(label.id)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        ) : (
          <span
            className="absolute top-0 left-[calc(var(--depth,0)*1rem)] z-above h-(--nav-item-height) w-6 in-data-[nav=rail]:hidden"
            aria-hidden="true"
          />
        )}
        <a
          className="relative flex h-(--nav-item-height) w-full cursor-pointer items-center gap-3 rounded-md bg-transparent pr-3 pl-[calc(var(--nav-inset)+var(--depth,0)*1rem)] text-start text-md leading-none text-text no-underline transition-[background-color] duration-(--duration-fast) ease-out hover:bg-hover hover:text-text data-[unread=true]:font-bold aria-[current=page]:bg-accent-soft aria-[current=page]:font-bold aria-[current=page]:text-on-accent-soft [&_.lucide]:text-text-muted aria-[current=page]:[&_.lucide]:text-on-accent-soft in-data-[nav=rail]:mx-auto in-data-[nav=rail]:mb-1 in-data-[nav=rail]:h-9 in-data-[nav=rail]:w-14 in-data-[nav=rail]:justify-center in-data-[nav=rail]:rounded-pill in-data-[nav=rail]:p-0"
          href={formatRoute({ kind: "label", labelId: label.id })}
          aria-current={isCurrentLabel(route, label.id) ? "page" : undefined}
          aria-label={countLabel(label.title, label.unreadThreads, "unread")}
          data-unread={unread ? "true" : undefined}
          title={rail || depth > 0 ? label.path : undefined}
          {...drop}
        >
          <Tag
            aria-hidden="true"
            data-label-color={color}
            className="data-label-color:fill-(--label-fill) data-label-color:text-(color:--label-color)"
          />
          <span className="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap in-data-[nav=rail]:absolute in-data-[nav=rail]:size-px in-data-[nav=rail]:[clip-path:inset(50%)]">
            {label.title}
          </span>{" "}
          <Count value={label.unreadThreads} />
        </a>
      </div>
      {hasChildren && open && !rail ? (
        <ul className="m-0 list-none p-0 in-data-[nav=rail]:w-full">
          {children.map((child) => (
            <LabelItem
              key={child.label.id}
              node={child}
              route={route}
              rail={rail}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
