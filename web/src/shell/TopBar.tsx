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
    <header className="shell-topbar">
      <div className="shell-topbar-start">
        <IconButton label="Main menu" icon={Menu} tooltip="start" aria-expanded={navExpanded} aria-controls="shell-nav" onClick={onToggleNav} />
        <a className="shell-brand" href={formatRoute(INBOX)} aria-label="Postern, go to Inbox">
          <PosternMark />
          <span className="shell-wordmark" aria-hidden="true">
            Postern
          </span>
        </a>
      </div>
      <div className="shell-topbar-search">
        <SearchBox query={route.kind === "search" ? route.query : undefined} />
      </div>
      <div className="shell-topbar-end">
        <StatusSlot />
        <IconButton label="Help" icon={CircleHelp} onClick={help.open} />
        <IconButton label="Settings" icon={Settings} tooltip="end" href={formatRoute({ kind: "settings", section: "general" })} />
        <AccountMenu />
      </div>
    </header>
  );
}
