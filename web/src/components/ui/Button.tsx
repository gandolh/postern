import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

/**
 * The text buttons of the app:
 *
 * - `default`: an outlined button ("Cancel", "Reply").
 * - `primary`: the accent fill; one per view ("Send", "Save").
 * - `soft`: the soft accent fill.
 * - `quiet`: accent text, no outline ("Retry", "Discard").
 * - `danger`: the destructive confirmation ("Delete forever").
 */
export type ButtonVariant = "default" | "primary" | "soft" | "quiet" | "danger";

const BASE = [
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border-strong bg-transparent px-4",
  "text-md leading-none font-medium text-text no-underline",
  "transition-[background-color,border-color,color] duration-(--duration-fast) ease-out",
  "hover:bg-hover hover:text-text active:bg-active",
  "disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
  "max-sm:min-h-11",
].join(" ");

const VARIANTS: Record<ButtonVariant, string> = {
  default: "",
  primary:
    "border-transparent bg-accent text-on-accent hover:bg-accent-hover hover:text-on-accent active:bg-accent-hover",
  soft: "border-transparent bg-accent-soft text-on-accent-soft hover:bg-accent-soft-hover hover:text-on-accent-soft",
  quiet: "border-transparent text-accent hover:text-accent-hover",
  danger: "border-transparent bg-danger text-surface hover:bg-danger hover:text-surface hover:brightness-92",
};

/** The classes of a button, for a link that looks like one. */
export function buttonClass(variant: ButtonVariant = "default", className?: string): string {
  return cn(BASE, VARIANTS[variant], className);
}

export interface ButtonProps extends Omit<ComponentProps<typeof BaseButton>, "className"> {
  variant?: ButtonVariant;
  className?: string;
}

/** The house button, on Base UI's Button. A `type` is never implied: it is `button` unless a form's submit says so. */
export function Button({ variant = "default", className, ...props }: ButtonProps) {
  return <BaseButton {...props} className={buttonClass(variant, className)} />;
}
