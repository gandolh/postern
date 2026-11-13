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
  /** Under 600 px: no menu button (the bottom bar's Labels opens the navigation), no brand, no help. */
  phone: boolean;
  navExpanded: boolean;
  onToggleNav: () => void;
}

export function TopBar({ route, phone, navExpanded, onToggleNav }: TopBarProps) {
  const help = useHelpSheet();
  return (
    <header className="flex min-w-0 items-center gap-2 pr-4 pl-2 [grid-area:top] max-sm:gap-1 max-sm:px-2">
      <div
        className={
          phone
            ? "hidden"
            : "flex w-(--nav-width) flex-none items-center gap-1 in-data-[nav=hidden]:w-auto in-data-[nav=rail]:w-auto"
        }
      >
        {phone ? null : (
          <IconButton
            label="Main menu"
            icon={Menu}
            tooltip="start"
            aria-expanded={navExpanded}
            aria-controls="shell-nav"
            onClick={onToggleNav}
          />
        )}
        <a
          className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-text no-underline hover:text-text [&_svg]:flex-none"
          href={formatRoute(INBOX)}
          aria-label="Postern, go to Inbox"
        >
          <PosternMark />
          <span className="text-xl leading-7 font-bold" aria-hidden="true">
            Postern
          </span>
        </a>
      </div>
      <div className="ml-2 max-w-[45rem] min-w-0 flex-[1_1_auto] max-sm:ml-0 max-sm:max-w-none">
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
