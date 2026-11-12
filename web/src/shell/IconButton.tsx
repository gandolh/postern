// An icon-only button (or link) with an accessible name and a hover tooltip.
// Every icon-only control in the app uses it, so none ships without a label.
//
//   <IconButton label="Archive" icon={Archive} onClick={...} />
//   <IconButton label="Settings" icon={Settings} href="#settings/general" />

import type { LucideIcon } from "lucide-react";
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

interface Common {
  /** The accessible name, and the tooltip text. */
  label: string;
  icon: LucideIcon;
  /** Show the tooltip (default true). `start` / `end` align it to that edge, for buttons near the screen's edge. */
  tooltip?: boolean | "start" | "end";
}

const BASE = [
  "relative inline-grid size-10 cursor-pointer place-items-center rounded-pill bg-transparent p-0 text-text-muted",
  "transition-[background-color,color] duration-(--duration-fast) ease-out",
  "hover:bg-hover hover:text-text active:bg-active",
  "disabled:cursor-not-allowed disabled:opacity-45",
  "aria-expanded:bg-hover aria-expanded:text-text aria-pressed:bg-hover aria-pressed:text-text",
  "max-sm:size-11",
].join(" ");

/** The tooltip under the button, on hover and keyboard focus: a pseudo-element that shows `data-tooltip`. */
const TOOLTIP = [
  "after:pointer-events-none after:absolute after:top-[calc(100%+0.25rem)] after:left-1/2 after:z-tooltip",
  "after:-translate-x-1/2 after:-translate-y-0.5 after:rounded-sm after:bg-inverse after:px-2 after:py-1",
  "after:text-xs after:leading-tight after:font-medium after:whitespace-nowrap after:text-on-inverse",
  "after:opacity-0 after:content-[attr(data-tooltip)]",
  "after:transition-[opacity,translate] after:duration-(--duration-fast) after:ease-out",
  "hover:after:translate-y-0 hover:after:opacity-100 hover:after:delay-400",
  "focus-visible:after:translate-y-0 focus-visible:after:opacity-100 focus-visible:after:delay-400",
  "aria-expanded:after:hidden",
  "data-[tooltip-align=start]:after:left-0 data-[tooltip-align=start]:after:translate-x-0",
  "data-[tooltip-align=end]:after:right-0 data-[tooltip-align=end]:after:left-auto data-[tooltip-align=end]:after:translate-x-0",
].join(" ");

/** The classes of an icon-only button, for a control that is not an `IconButton` (a Base UI trigger, a tool in a toolbar). */
export function iconButtonClass(className?: string, tooltip: boolean | "start" | "end" = true): string {
  return cn(BASE, tooltip && TOOLTIP, className);
}

export type IconButtonProps = Common &
  (
    | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label">)
    | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "aria-label">)
  );

export const IconButton = forwardRef<HTMLButtonElement & HTMLAnchorElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, tooltip = true, className, ...rest },
  ref,
) {
  const tip = tooltip ? { "data-tooltip": label, "data-tooltip-align": tooltip === true ? undefined : tooltip } : {};
  const classes = iconButtonClass(className, tooltip);
  if (rest.href !== undefined) {
    const anchor = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a ref={ref} className={classes} aria-label={label} data-slot="icon-button" {...tip} {...anchor}>
        <Icon aria-hidden="true" />
      </a>
    );
  }
  const button = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button ref={ref} type="button" className={classes} aria-label={label} data-slot="icon-button" {...tip} {...button}>
      <Icon aria-hidden="true" />
    </button>
  );
});
