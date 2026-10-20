// Plain-text bodies: the text cut into runs, with http, https and mailto
// links (and bare www. hosts and e-mail addresses) as link runs. Rendered as
// React text nodes and <a> elements, so nothing in the text is ever HTML.

import { safeLinkUrl } from "./urls";

export type TextRun = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

// A message's text is hostile input and can be 1 MB, so both patterns stay
// linear (brief 17): an address only starts where a run of address
// characters starts (the lookbehind), and its parts are bounded by RFC 5321's
// lengths, so a long run with no "@" is not rescanned from every position.
const CANDIDATE = /\b(?:https?:\/\/|mailto:|www\.)[^\s<>"'`]+|(?<![\w.+-])[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/gi;

const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{", ">": "<" };

/** Trailing punctuation is the sentence's, not the URL's; a closing bracket stays if the URL opened one. One pass. */
function trimTrailing(url: string): string {
  const count = (c: string) => {
    let n = 0;
    for (const ch of url) if (ch === c) n++;
    return n;
  };
  const balance = new Map<string, number>();
  for (const [close, open] of Object.entries(CLOSERS)) balance.set(close, count(close) - count(open));
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1] as string;
    if (/[.,;:!?'"*_]/.test(last)) {
      end--;
      continue;
    }
    const surplus = balance.get(last);
    if (surplus !== undefined && surplus > 0) {
      balance.set(last, surplus - 1);
      end--;
      continue;
    }
    break;
  }
  return url.slice(0, end);
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
