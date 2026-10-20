// Plain-text bodies: the text cut into runs, with http, https and mailto
// links (and bare www. hosts and e-mail addresses) as link runs. Rendered as
// React text nodes and <a> elements, so nothing in the text is ever HTML.

import { safeLinkUrl } from "./urls";

export type TextRun = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

const CANDIDATE = /\b(?:https?:\/\/|mailto:|www\.)[^\s<>"'`]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;

/** Trailing punctuation is the sentence's, not the URL's; a closing bracket stays if the URL opened one. */
function trimTrailing(url: string): string {
  let out = url;
  for (;;) {
    const last = out.slice(-1);
    if (/[.,;:!?'"*_]/.test(last)) {
      out = out.slice(0, -1);
      continue;
    }
    const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{", ">": "<" };
    const open = pairs[last];
    if (open !== undefined) {
      const opens = out.split(open).length - 1;
      const closes = out.split(last).length - 1;
      if (closes > opens) {
        out = out.slice(0, -1);
        continue;
      }
    }
    return out;
  }
}

/** Cut text into text and link runs. Every href is http:, https: or mailto:. */
export function linkify(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let at = 0;
  const push = (run: TextRun) => {
    const prev = runs[runs.length - 1];
    if (run.kind === "text" && prev?.kind === "text") prev.text += run.text;
    else if (run.text !== "") runs.push(run);
  };
  for (const m of text.matchAll(CANDIDATE)) {
    const start = m.index;
    if (start < at) continue;
    const raw = trimTrailing(m[0]);
    if (raw === "") continue;
    let href: string | null;
    if (/^www\./i.test(raw)) href = safeLinkUrl(`https://${raw}`);
    else if (/^(?:https?:\/\/|mailto:)/i.test(raw)) href = safeLinkUrl(raw);
    else href = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/.test(raw) ? safeLinkUrl(`mailto:${raw}`) : null;
    if (href === null || href.startsWith("#")) continue;
    push({ kind: "text", text: text.slice(at, start) });
    push({ kind: "link", text: raw, href });
    at = start + raw.length;
  }
  push({ kind: "text", text: text.slice(at) });
  return runs;
}
