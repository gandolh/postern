// A menu button: the toolbar's select menu and "More", on Base UI's Menu.
// Arrow keys and a typed letter move, Escape closes and returns focus, a
// click outside closes (and still lands where it was aimed). A chosen item
// runs once focus is back on the button, so one that opens a dialog keeps it.

import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { LucideIcon } from "lucide-react";
import { useRef, type ComponentProps, type Ref } from "react";
import { cn } from "../../lib/cn";
import { IconButton } from "../../shell/IconButton";

type PopupProps = ComponentProps<typeof BaseMenu.Popup>;
type PositionerProps = Pick<
  ComponentProps<typeof BaseMenu.Positioner>,
  "anchor" | "side" | "align" | "sideOffset" | "collisionPadding"
>;

export interface MenuPopupProps extends PopupProps, PositionerProps {
  /** The Positioner's own class. */
  positionerClassName?: string;
  /** Where the popup is portalled. Default <body>; the composer window passes its own layer. */
  container?: ComponentProps<typeof BaseMenu.Portal>["container"];
  ref?: Ref<HTMLDivElement>;
}

/** The popup, portalled and placed `bottom` / `start`, 4px from its button and 8px from the window's edge. */
function MenuPopup({
  positionerClassName,
  container,
  anchor,
  side = "bottom",
  align = "start",
  sideOffset = 4,
  collisionPadding = 8,
  ...popup
}: MenuPopupProps) {
  return (
    <BaseMenu.Portal container={container}>
      <BaseMenu.Positioner
        className={positionerClassName}
        anchor={anchor}
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
      >
        <BaseMenu.Popup {...popup} />
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

/** The parts of a menu a caller builds by hand: Root, Trigger, Popup (with its Portal and Positioner), Item, Separator. */
export const Menu = {
  Root: BaseMenu.Root,
  Trigger: BaseMenu.Trigger,
  Popup: MenuPopup,
  Item: BaseMenu.Item,
  CheckboxItem: BaseMenu.CheckboxItem,
  Separator: BaseMenu.Separator,
};

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
    <div className={cn("relative", className)}>
      <Menu.Root modal={false}>
        <Menu.Trigger ref={buttonRef} render={<IconButton label={label} icon={icon} />} />
        <Menu.Popup
          positionerClassName="z-popup"
          align={align}
          className="flex min-w-48 flex-col rounded-lg border border-border bg-surface-raised py-2 shadow-md"
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
              className="block min-h-9 w-full cursor-pointer px-4 text-start text-md text-text select-none focus-visible:-outline-offset-2 focus-visible:[outline:var(--focus-ring)] data-disabled:cursor-not-allowed data-disabled:text-text-subtle data-highlighted:bg-hover"
              disabled={item.disabled}
              onClick={() => {
                chosen.current = item;
              }}
            >
              {item.label}
            </Menu.Item>
          ))}
        </Menu.Popup>
      </Menu.Root>
    </div>
  );
}
