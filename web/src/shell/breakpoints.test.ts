import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PHONE_QUERY, WIDE_QUERY } from "./breakpoints";

/** A `--breakpoint-<name>` value in rem, from a stylesheet's text. */
function breakpoint(css: string, name: string): number {
  const match = new RegExp(`--breakpoint-${name}:\\s*([\\d.]+)rem`).exec(css);
  if (!match?.[1]) throw new Error(`--breakpoint-${name} is not in the stylesheet`);
  return Number(match[1]);
}

const index = readFileSync(new URL("../styles/index.css", import.meta.url), "utf8");
// `lg` is Tailwind's own; the file gives it no value of its own.
const tailwind = readFileSync(new URL("../../../node_modules/tailwindcss/theme.css", import.meta.url), "utf8");

describe("breakpoints.ts and index.css", () => {
  it("agree on the phone boundary: `max-sm:` is one hundredth of a rem narrower than `sm`", () => {
    const sm = breakpoint(index, "sm");
    expect(PHONE_QUERY).toBe(`(max-width: ${sm - 0.0625}rem)`);
  });

  it("agree on the wide boundary: `lg:` is Tailwind's 64rem", () => {
    expect(WIDE_QUERY).toBe(`(min-width: ${breakpoint(tailwind, "lg")}rem)`);
    expect(index).not.toMatch(/--breakpoint-lg/);
  });
});
