// The phone's bottom bar: Inbox, Starred, Sent and Labels, 64 px at the foot of the screen under 600 px.
// Labels opens the navigation drawer with the whole tree (the top bar has no menu button on a phone), and
// takes the menu button's place for the drawer's focus return (aria-controls="shell-nav").

import type { LucideIcon } from "lucide-react";
import { Inbox, Send, Star, Tag } from "lucide-react";
import { formatRoute, type Route, type SystemView } from "../shell/router";

const ITEM =
  "flex min-h-12 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 bg-transparent p-0 text-xs font-medium text-text-muted no-underline hover:text-text aria-[current=page]:font-bold aria-[current=page]:text-on-accent-soft aria-expanded:font-bold aria-expanded:text-on-accent-soft [&_.lucide]:[--icon-size:1.25rem]";
const PLATE =
  "grid h-7 w-14 place-items-center rounded-pill group-aria-[current=page]/item:bg-accent-soft group-aria-expanded/item:bg-accent-soft";

function Plate({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className={PLATE}>
      <Icon aria-hidden="true" />
    </span>
  );
}

const VIEWS: Array<{ view: SystemView; label: string; icon: LucideIcon }> = [
  { view: "inbox", label: "Inbox", icon: Inbox },
  { view: "starred", label: "Starred", icon: Star },
  { view: "sent", label: "Sent", icon: Send },
];

export function BottomBar({
  route,
  labelsOpen,
  onLabels,
}: {
  route: Route;
  labelsOpen: boolean;
  onLabels: () => void;
}) {
  return (
    <nav
      aria-label="Mail shortcuts"
      className="fixed inset-x-0 bottom-0 z-sticky flex h-[calc(var(--bottombar-height)+env(safe-area-inset-bottom,0px))] border-t border-border bg-surface pb-[env(safe-area-inset-bottom,0px)] shadow-md"
    >
      {VIEWS.map(({ view, label, icon }) => (
        <a
          key={view}
          className={`group/item ${ITEM}`}
          href={formatRoute({ kind: "system", view })}
          aria-current={route.kind === "system" && route.view === view ? "page" : undefined}
        >
          <Plate icon={icon} />
          <span>{label}</span>
        </a>
      ))}
      <button
        type="button"
        className={`group/item ${ITEM}`}
        aria-expanded={labelsOpen}
        aria-controls="shell-nav"
        aria-current={route.kind === "label" ? "page" : undefined}
        onClick={onLabels}
      >
        <Plate icon={Tag} />
        <span>Labels</span>
      </button>
    </nav>
  );
}
