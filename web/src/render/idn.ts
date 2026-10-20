// Look-alike link hosts. An internationalised domain is fine on its own
// (münchen.de, пример.рф, 例え.jp); what deceives is a label that mixes
// scripts (аpple.test: a Cyrillic а, then Latin) or is written entirely in
// another script's letters that look Latin (аррӏе.test: all Cyrillic). Those
// are the ones flagged, after the rules Chrome uses to decide when to show a
// host as punycode (components/url_formatter/spoof_checks): mixed scripts in
// one label, except the CJK mixes Japanese, Chinese and Korean names use;
// whole-label Cyrillic or Greek confusables under a TLD of another script;
// and a few Latin letters made to pass for others. Pure.

/** Why a host is flagged: two scripts in one label, every letter imitating Latin, or a label that cannot be read. */
export type LookalikeReason = "mixed-script" | "confusable" | "unreadable";

// ---- Punycode (RFC 3492), decoding only ------------------------------------

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const MAX_LABEL = 63;

function adapt(delta: number, points: number, first: boolean): number {
  let d = first ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / points);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

function digit(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26; // 0-9
  if (code >= 0x61 && code <= 0x7a) return code - 0x61; // a-z
  if (code >= 0x41 && code <= 0x5a) return code - 0x41; // A-Z
  return -1;
}

/** Decode the part of a label after `xn--`. Null when it is not valid punycode. */
export function decodePunycode(input: string): string | null {
  if (input.length === 0 || input.length > MAX_LABEL) return null;
  const output: number[] = [];
  const delimiter = input.lastIndexOf("-");
  if (delimiter > 0) {
    for (let i = 0; i < delimiter; i++) {
      const c = input.charCodeAt(i);
      if (c >= 0x80) return null;
      output.push(c);
    }
  }
  let n = INITIAL_N;
  let bias = INITIAL_BIAS;
  let i = 0;
  for (let pos = delimiter > 0 ? delimiter + 1 : 0; pos < input.length; ) {
    const oldI = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (pos >= input.length) return null;
      const d = digit(input.charCodeAt(pos++));
      if (d < 0) return null;
      i += d * w;
      if (i > 0x10ffff * (output.length + 1)) return null;
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (d < t) break;
      w *= BASE - t;
    }
    const points = output.length + 1;
    bias = adapt(i - oldI, points, oldI === 0);
    n += Math.floor(i / points);
    i %= points;
    if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return null;
    output.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...output);
}

/** One label as Unicode: `xn--pple-43d` → `аpple`. Null when the punycode is broken. */
export function labelToUnicode(label: string): string | null {
  return /^xn--/i.test(label) ? decodePunycode(label.slice(4)) : label;
}

/** A host as Unicode, label by label (broken punycode labels stay as they are). */
export function hostToUnicode(host: string): string {
  return host
    .split(".")
    .map((label) => labelToUnicode(label) ?? label)
    .join(".");
}

// ---- Scripts ---------------------------------------------------------------

/** Scripts a domain label is likely to use, checked in this order. Anything else counts as "Other". */
const SCRIPTS: readonly [name: string, test: RegExp][] = [
  ["Latin", /\p{Script=Latin}/u],
  ["Cyrillic", /\p{Script=Cyrillic}/u],
  ["Greek", /\p{Script=Greek}/u],
  ["Armenian", /\p{Script=Armenian}/u],
  ["Georgian", /\p{Script=Georgian}/u],
  ["Hebrew", /\p{Script=Hebrew}/u],
  ["Arabic", /\p{Script=Arabic}/u],
  ["Han", /\p{Script=Han}/u],
  ["Hiragana", /\p{Script=Hiragana}/u],
  ["Katakana", /\p{Script=Katakana}/u],
  ["Hangul", /\p{Script=Hangul}/u],
  ["Bopomofo", /\p{Script=Bopomofo}/u],
  ["Thai", /\p{Script=Thai}/u],
  ["Devanagari", /\p{Script=Devanagari}/u],
];

/** Digits, the hyphen and combining marks belong to no script of their own. */
const NEUTRAL = /[\p{Script=Common}\p{Script=Inherited}]/u;

/** Script mixes a single label may use (UTS #39 "highly restrictive"): Latin with Japanese, Chinese or Korean. */
const ALLOWED_MIXES: readonly ReadonlySet<string>[] = [
  new Set(["Latin", "Han", "Hiragana", "Katakana"]),
  new Set(["Latin", "Han", "Bopomofo"]),
  new Set(["Latin", "Han", "Hangul"]),
];

function scriptOf(char: string): string | null {
  if (NEUTRAL.test(char)) return null;
  for (const [name, test] of SCRIPTS) if (test.test(char)) return name;
  return "Other";
}

/** The scripts a label's letters are written in (digits, hyphens and marks left out). */
export function labelScripts(label: string): Set<string> {
  const scripts = new Set<string>();
  for (const char of label) {
    const script = scriptOf(char);
    if (script) scripts.add(script);
  }
  return scripts;
}

function isAllowedMix(scripts: Set<string>): boolean {
  if (scripts.size <= 1) return true;
  if (scripts.has("Other")) return false;
  return ALLOWED_MIXES.some((allowed) => [...scripts].every((s) => allowed.has(s)));
}

// Letters that pass for Latin ones in a URL bar. Cyrillic is Chromium's set
// (idn_spoof_checker.cc, cyrillic_letters_latin_alike_); Greek is the
// lower-case letters with a Latin twin. Hosts are lower-cased by the URL
// parser, so lower case is enough.
const LATIN_ALIKE: Record<string, RegExp> = {
  Cyrillic: /^[асԁеһіјӏорԛѕԝхуъьҽпгѵѡ]+$/u,
  Greek: /^[αεικνορτυχ]+$/u,
};

/** TLDs whose own script makes a whole-label Cyrillic or Greek name ordinary. */
const NATIVE_TLDS: Record<string, ReadonlySet<string>> = {
  Cyrillic: new Set(["ru", "su", "by", "bg", "kz", "kg", "mk", "mn", "rs", "tj", "ua", "uz", "me", "ba"]),
  Greek: new Set(["gr", "cy"]),
};

/** Latin letters made to pass for other Latin letters: dotless i, dotless j, Latin alpha, script g. */
const LATIN_LOOKALIKES = /[ıȷɑɡ]/u;

/** Letters, marks, digits and the hyphen: anything else in a label is a trick. */
const LABEL_CHARS = /^[\p{L}\p{M}\p{N}-]+$/u;

/**
 * Why a link's host could pass for another, or null when it reads as what it
 * is. `host` is the URL's hostname (punycode, as `new URL()` gives it).
 */
export function lookalikeHost(host: string): LookalikeReason | null {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  const unicode = labels.map(labelToUnicode);
  if (unicode.some((label) => label === null)) return "unreadable";
  const decoded = unicode as string[];
  const tld = decoded[decoded.length - 1] ?? "";
  const tldScripts = labelScripts(tld);
  for (let i = 0; i < labels.length; i++) {
    if (!/^xn--/i.test(labels[i] as string)) continue;
    const label = decoded[i] as string;
    if (!LABEL_CHARS.test(label)) return "unreadable";
    const scripts = labelScripts(label);
    if (!isAllowedMix(scripts)) return "mixed-script";
    if (LATIN_LOOKALIKES.test(label)) return "confusable";
    if (scripts.size === 1) {
      const [script] = [...scripts] as [string];
      const alike = LATIN_ALIKE[script];
      const letters = [...label].filter((c) => !NEUTRAL.test(c)).join("");
      const nativeTld = tldScripts.has(script) || (NATIVE_TLDS[script]?.has(tld) ?? false);
      if (alike && letters !== "" && alike.test(letters) && !nativeTld) return "confusable";
    }
  }
  return null;
}
