/* eslint-disable no-console -- a command line tool: the table is its output */
// Contrast over the built tokens: every text and icon pair of the design, light and dark, from the `@theme` block of
// web/src/styles/index.css. Prints a markdown table (the one in corpus/wiki/design.md) and exits 1 when a pair falls
// under its minimum: 4.5 for text, 3 for large text, icons and UI parts.
//   node scripts/contrast.mjs

import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../web/src/styles/index.css", import.meta.url), "utf8");
const theme = css.slice(css.indexOf("@theme static"), css.indexOf("@layer base"));

/** token name -> [light, dark] hex. */
const tokens = new Map();
for (const m of theme.matchAll(/--color-([a-z-]+):\s*light-dark\(\s*(#[0-9a-fA-F]{6}),\s*(#[0-9a-fA-F]{6})\s*\)/g))
  tokens.set(m[1], [m[2], m[3]]);
for (const m of theme.matchAll(/--color-([a-z-]+):\s*var\(--color-([a-z-]+)\)/g)) tokens.set(m[1], tokens.get(m[2]));

const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum, note]
const PAIRS = [
  ["text", "surface", 4.5],
  ["text", "canvas", 4.5],
  ["text", "row-read", 4.5],
  ["text", "row-hover", 4.5],
  ["text", "row-selected", 4.5],
  ["text-muted", "surface", 4.5],
  ["text-muted", "canvas", 4.5],
  ["text-muted", "row-read", 4.5],
  ["text-muted", "row-hover", 4.5],
  ["text-muted", "row-selected", 4.5],
  ["text-muted", "surface-sunken", 4.5],
  ["text-muted", "hover", 4.5],
  ["text-subtle", "surface", 4.5],
  ["text-subtle", "canvas", 4.5],
  ["text-subtle", "surface-sunken", 4.5],
  ["accent", "surface", 4.5],
  ["accent", "canvas", 4.5],
  ["accent-hover", "surface", 4.5],
  ["on-accent", "accent", 4.5],
  ["on-accent", "accent-hover", 4.5],
  ["on-accent-soft", "accent-soft", 4.5],
  ["on-accent-soft", "accent-soft-hover", 4.5],
  ["danger", "surface", 4.5],
  ["danger", "danger-soft", 4.5],
  ["on-warning-soft", "warning-soft", 4.5],
  ["on-inverse", "inverse", 4.5],
  ["inverse-accent", "inverse", 4.5],
  ["star", "surface", 3],
  ["star", "row-read", 3],
  ["border-strong", "surface", 3],
  ["border-strong", "canvas", 3],
  ["border-strong", "row-read", 3],
  ["focus", "surface", 3],
  ["focus", "canvas", 3],
  ["focus", "row-selected", 3],
  ["accent", "row-read", 3],
];

let worst = [Infinity, Infinity];
let failed = 0;
const rows = [];
for (const [fg, bg, min] of PAIRS) {
  const f = tokens.get(fg);
  const b = tokens.get(bg);
  if (!f || !b) throw new Error(`unknown token in ${fg} on ${bg}`);
  const out = [0, 1].map((i) => ratio(f[i], b[i]));
  out.forEach((r, i) => {
    if (r < worst[i]) worst[i] = r;
    if (r < min) {
      failed += 1;
      console.error(`FAIL ${fg} on ${bg} (${i ? "dark" : "light"}): ${r.toFixed(2)} < ${min}`);
    }
  });
  rows.push(
    `| \`${fg}\` on \`${bg}\` | ${min} | ${f[0]} / ${b[0]} | ${out[0].toFixed(1)} | ${f[1]} / ${b[1]} | ${out[1].toFixed(1)} |`,
  );
}
console.log("| Pair | Min | Light | Ratio | Dark | Ratio |\n| --- | --- | --- | --- | --- | --- |");
console.log(rows.join("\n"));
console.log(
  `\nLowest: light ${worst[0].toFixed(2)}, dark ${worst[1].toFixed(2)}; ${PAIRS.length} pairs, ${failed} below their minimum.`,
);
process.exit(failed ? 1 : 0);
