import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge, told Postern's @theme names (styles/index.css). Without the `text` list it reads
 * `text-md` as a colour, so `cn("text-md", "text-text")` would drop one of the two. Keep the lists in step
 * with @theme.
 *
 * The sizes carry no line height (the body's applies, and an element sets its own `leading-*`), so a size must
 * not remove a `leading-*`, which tailwind-merge does by default: `cn("leading-tight", "text-sm")` keeps both.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["xs", "sm", "md", "lg", "xl", "2xl"],
      radius: ["sm", "md", "lg", "xl", "pill"],
      shadow: ["sm", "md", "lg"],
    },
    classGroups: {
      z: [
        {
          z: [
            "above",
            "header",
            "sticky",
            "inline",
            "card",
            "scrim",
            "drawer",
            "tooltip",
            "compose",
            "popup",
            "overlay",
            "menu",
            "skip",
            "modal",
          ],
        },
      ],
    },
  },
  override: {
    conflictingClassGroups: { "font-size": [] },
  },
});

/** Joins class names, and lets a later class win over an earlier one it conflicts with. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
