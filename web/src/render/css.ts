// The message's CSS (<style> blocks and style="" attributes), made safe to
// keep. DOMPurify keeps CSS as it is, so this is where remote requests and
// page-spoofing layout are taken out. Pure text processing, so it runs the
// same in the browser and in jsdom.
//
// In order:
//   1. CSS escapes are decoded (`\75 rl(` is `url(`), so nothing hides behind them;
//   2. comments go;
//   3. `<` goes, so a </style> can never end the block early;
//   4. @import, @font-face, @namespace and @charset go, always (no remote
//      stylesheets or fonts, even after "Display images");
//   5. image-set() goes (its bare strings are URLs);
//   6. each url() goes through imageUrl(): kept (cid: → data:, https after
//      "Display images"), blocked (counted, shown as `none`) or dropped;
//   7. position: fixed / absolute / sticky (or anything computed, like var())
//      becomes static, so a message cannot lay a fake dialog over itself;
//   8. legacy script hooks (expression(), -moz-binding, behavior) are defused.

import { imageUrl, type ImageUrlContext } from "./urls";

export interface CssContext extends ImageUrlContext {
  /** Called once per remote URL left out because remote content is blocked. */
  onBlocked?: () => void;
}

/** Decode CSS escapes (`\75`, `\"`, line continuations) to the characters they stand for. */
export function decodeCssEscapes(css: string): string {
  return css.replace(/\\(?:([0-9a-f]{1,6})[ \t\n\r\f]?|(\r\n|[\n\r\f])|([\s\S]))/gi, (_whole, hex: string | undefined, newline: string | undefined, char: string | undefined) => {
    if (newline !== undefined) return "";
    if (hex !== undefined) {
      const code = parseInt(hex, 16);
      if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "�";
      return String.fromCodePoint(code);
    }
    return char ?? "";
  });
}

/** Index just past the end of the at-rule starting at `start`: its `;`, or its `{...}` block, or the end of the text. */
function atRuleEnd(css: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) return i + 1;
    else if (c === "{" && depth === 0) {
      let braces = 0;
      for (let j = i; j < css.length; j++) {
        if (css[j] === "{") braces++;
        else if (css[j] === "}" && --braces === 0) return j + 1;
      }
      return css.length;
    }
  }
  return css.length;
}

const DROPPED_AT_RULES = /@(?:-[a-z]+-)?(?:import|font-face|namespace|charset)\b/gi;

function removeAtRules(css: string): string {
  let out = "";
  let at = 0;
  for (let m = DROPPED_AT_RULES.exec(css); m; m = DROPPED_AT_RULES.exec(css)) {
    if (m.index < at) continue;
    out += css.slice(at, m.index);
    at = atRuleEnd(css, m.index);
    DROPPED_AT_RULES.lastIndex = at;
  }
  DROPPED_AT_RULES.lastIndex = 0;
  return out + css.slice(at);
}

/** Index of the `)` closing the function whose `(` is at `open`, honouring quotes and nesting; -1 if none. */
function closingParen(css: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

/** Replace every call of a function (by name pattern) with what `replace` returns for its argument text. */
function replaceFunctions(css: string, name: RegExp, replace: (arg: string) => string): string {
  let out = "";
  let at = 0;
  const re = new RegExp(`(?<![\\w-])(?:${name.source})\\(`, "gi");
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (m.index < at) continue;
    const open = m.index + m[0].length - 1;
    const close = closingParen(css, open);
    out += css.slice(at, m.index);
    if (close === -1) {
      // Unterminated: nothing after it can be a valid value; drop the rest.
      return out + replace("");
    }
    out += replace(css.slice(open + 1, close));
    at = close + 1;
    re.lastIndex = at;
  }
  return out + css.slice(at);
}

/** The URL inside url(...): quoted or bare. */
function urlArgument(arg: string): string {
  const trimmed = arg.trim();
  const quoted = /^(["'])([\s\S]*)\1$/.exec(trimmed);
  return quoted ? (quoted[2] as string) : trimmed;
}

const SAFE_POSITIONS = new Set(["static", "relative", "inherit", "initial", "unset", "revert", "revert-layer"]);

function neutralisePositions(css: string): string {
  return css.replace(/(^|[\s;{])position\s*:([^;}]*)/gi, (whole, lead: string, value: string) => {
    const bare = value.replace(/!\s*important/i, "").trim().toLowerCase();
    return SAFE_POSITIONS.has(bare) ? whole : `${lead}position:static`;
  });
}

/** Make CSS text safe to keep in the message frame. */
export function sanitizeCss(css: string, ctx: CssContext): string {
  let out = decodeCssEscapes(css);
  out = out.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ");
  out = out.replace(/</g, "");
  out = removeAtRules(out);
  out = replaceFunctions(out, /(?:-[a-z]+-)?image-set/, () => "none");
  out = replaceFunctions(out, /url/, (arg) => {
    const decision = imageUrl(urlArgument(arg), ctx);
    if (decision.kind === "keep") return `url("${decision.url.replace(/["\\\n\r\f]/g, (c) => encodeURIComponent(c))}")`;
    if (decision.kind === "blocked") ctx.onBlocked?.();
    return "none";
  });
  out = neutralisePositions(out);
  out = out.replace(/expression\s*\(/gi, "none(").replace(/-moz-binding/gi, "-x-binding").replace(/(^|[\s;{])behavior\s*:/gi, "$1-x-behavior:");
  return out;
}

/** Does CSS text set colours (so the message keeps its own light palette)? */
export function setsColours(css: string): boolean {
  return /(^|[\s;{])(color|background(-color|-image)?)\s*:/i.test(css);
}
