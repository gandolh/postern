// A menu button: the toolbar's select menu and "More", on Base UI's Menu.
// Arrow keys and a typed letter move, Escape closes and returns focus, a
// click outside closes (and still lands where it was aimed). A chosen item
// runs once focus is back on the button, so one that opens a dialog keeps it.

import { Menu } from "@base-ui/react/menu";
import type { LucideIcon } from "lucide-react";
import { useRef } from "react";
import { IconButton } from "../shell/IconButton";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface MenuButtonProps {
  /** The button's accessible name and tooltip. */
  label: string;
  icon: LucideIcon;
  items: readonly MenuItem[];
  /** Which edge the menu lines up with. */
  align?: "start" | "end";
  className?: string;
}

export function MenuButton({ label, icon, items, align = "start", className }: MenuButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const chosen = useRef<MenuItem | null>(null);

  return (
    <div className={className ? `list-menu ${className}` : "list-menu"}>
      <Menu.Root modal={false}>
        <Menu.Trigger ref={buttonRef} render={<IconButton label={label} icon={icon} />} />
        <Menu.Portal>
          <Menu.Positioner className="list-menu-positioner" side="bottom" align={align} sideOffset={4} collisionPadding={8}>
            <Menu.Popup
              className="list-menu-popup"
              aria-label={label}
              finalFocus={() => {
                const item = chosen.current;
                if (!item) return true;
                chosen.current = null;
                buttonRef.current?.focus();
                item.onSelect();
                return false;
              }}
            >
              {items.map((item) => (
                <Menu.Item
                  key={item.label}
                  className="list-menu-item"
                  disabled={item.disabled}
                  onClick={() => {
                    chosen.current = item;
                  }}
                >
                  {item.label}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
