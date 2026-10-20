// An icon-only button (or link) with an accessible name and a hover tooltip.
// Every icon-only control in the app uses it, so none ships without a label.
//
//   <IconButton label="Archive" icon={Archive} onClick={...} />
//   <IconButton label="Settings" icon={Settings} href="#settings/general" />

import type { LucideIcon } from "lucide-react";
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";

interface Common {
  /** The accessible name, and the tooltip text. */
  label: string;
  icon: LucideIcon;
  /** Show the tooltip (default true). `start` / `end` align it to that edge, for buttons near the screen's edge. */
  tooltip?: boolean | "start" | "end";
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
  const classes = className ? `icon-btn ${className}` : "icon-btn";
  if (rest.href !== undefined) {
    const anchor = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a ref={ref} className={classes} aria-label={label} {...tip} {...anchor}>
        <Icon aria-hidden="true" />
      </a>
    );
  }
  const button = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button ref={ref} type="button" className={classes} aria-label={label} {...tip} {...button}>
      <Icon aria-hidden="true" />
    </button>
  );
});
