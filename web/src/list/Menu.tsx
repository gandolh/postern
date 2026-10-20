// A menu button: the toolbar's select menu and "More". Arrow keys move,
// Escape closes and returns focus, a click outside closes.

import type { LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
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
  const [open, setOpen] = useState(false);
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => entries[(to + entries.length) % entries.length]?.focus();
    switch (event.key) {
      case "ArrowDown":
        move(at + 1);
        break;
      case "ArrowUp":
        move(at - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(entries.length - 1);
        break;
      case "Escape":
        close(true);
        break;
      case "Tab":
        close(false);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className={className ? `list-menu ${className}` : "list-menu"}>
      <IconButton
        ref={buttonRef}
        label={label}
        icon={icon}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      />
      {open ? (
        <div ref={menuRef} id={id} role="menu" aria-label={label} className="list-menu-popup" data-align={align} onKeyDown={onKeyDown}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="list-menu-item"
              disabled={item.disabled}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
