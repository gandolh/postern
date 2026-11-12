// The top bar: menu toggle and mark, the search box, the status slot, help,
// settings and the account menu.

import { CircleHelp, Menu, Settings } from "lucide-react";
import { useHelpSheet } from "../keys";
import { SearchBox } from "../search/SearchBox";
import { AccountMenu } from "./AccountMenu";
import { IconButton } from "./IconButton";
import { PosternMark } from "./PosternMark";
import { formatRoute, INBOX, type Route } from "./router";
import { StatusSlot } from "./status";

export interface TopBarProps {
  route: Route;
  navExpanded: boolean;
  onToggleNav: () => void;
}

export function TopBar({ route, navExpanded, onToggleNav }: TopBarProps) {
  const help = useHelpSheet();
  return (
    <header className="flex min-w-0 items-center gap-2 pr-3 pl-2 [grid-area:top] max-sm:gap-1 max-sm:px-1">
      <div className="flex w-[calc(var(--nav-width)-0.5rem)] flex-none items-center gap-1 in-data-[nav=hidden]:w-auto in-data-[nav=rail]:w-auto">
        <IconButton
          label="Main menu"
          icon={Menu}
          tooltip="start"
          aria-expanded={navExpanded}
          aria-controls="shell-nav"
          onClick={onToggleNav}
        />
        <a
          className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-text no-underline hover:text-text max-sm:hidden [&_svg]:flex-none"
          href={formatRoute(INBOX)}
          aria-label="Postern, go to Inbox"
        >
          <PosternMark />
          <span className="text-xl font-semibold tracking-[-0.01em] max-sm:hidden" aria-hidden="true">
            Postern
          </span>
        </a>
      </div>
      <div className="max-w-[45rem] min-w-0 flex-[1_1_auto]">
        <SearchBox query={route.kind === "search" ? route.query : undefined} />
      </div>
      <div className="ml-auto flex flex-none items-center gap-1">
        <StatusSlot />
        {/* shell-help: hidden on phones (mobile.css), where the shortcuts it lists don't apply. */}
        <IconButton className="max-sm:hidden" label="Help" icon={CircleHelp} onClick={help.open} />
        <IconButton
          label="Settings"
          icon={Settings}
          tooltip="end"
          href={formatRoute({ kind: "settings", section: "general" })}
        />
        <AccountMenu />
      </div>
    </header>
  );
}
