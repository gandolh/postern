import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

/** The classes of a text field, for a `<select>` or `<textarea>` that looks like one. */
export function inputClass(className?: string): string {
  return cn(
    "min-h-10 rounded-md border border-border-strong bg-surface px-3 text-lg text-text",
    "placeholder:text-text-subtle",
    "focus-visible:border-focus focus-visible:-outline-offset-1 focus-visible:[outline:var(--focus-ring)]",
    "aria-invalid:border-danger max-sm:min-h-11",
    className,
  );
}

/** The house text field. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={inputClass(className)} />;
}
