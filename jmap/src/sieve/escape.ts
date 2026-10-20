// Sieve quoted strings (RFC 5228 §2.4.2) for anything a person typed.
//
// Inside quotes only `\\` and `\"` are escapes. Every `${...}` in a string is
// a variable reference: Stalwart's compiler (sieve-rs 0.7.3) reads them even
// without "variables" and expands one it does not know to "", so a criterion
// "${x}" would match every message. An encoded "$" ("${hex:24}") does not
// help: the decoded text is read for variables again (RFC 5229 orders
// encoded-character before variables; sieve-rs `add_value`). So a literal
// "${" is written as "${postern_dollar}{", where the script sets
// postern_dollar to "$" at the top: expansion is one pass, never repeated.
// Control characters are written as "${hex:XX}", which decodes to the byte.
//
// Backslashes too: Stalwart's lexer (sieve-rs 0.7.3 tokenizer.rs) takes a
// quote after an escaped backslash ("a\\") as escaped, so the string runs
// on, and reads "\\n", "\\r", "\\t" as control characters. Written as
// "${hex:5C}", a backslash never reaches that lexer. A quote is "\"", which
// it reads right.

/** The variable holding "$" (declared by the generator when a string needs it). */
export const DOLLAR_VARIABLE = "postern_dollar";

export interface QuotedString {
  /** The Sieve token, quotes included. */
  text: string;
  /** True when it uses "${hex:...}" (the script must require "encoded-character"). */
  encoded: boolean;
  /** True when it uses "${postern_dollar}" (the script must set it, which needs "variables"). */
  dollar: boolean;
}

/** Quote `value` as a Sieve string that means exactly `value`. */
export function quoteSieve(value: string): QuotedString {
  let encoded = false;
  let dollar = false;
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    const code = ch.charCodeAt(0);
    if (ch === '"') {
      out += '\\"';
    } else if (ch === "$" && value[i + 1] === "{") {
      out += "${" + DOLLAR_VARIABLE + "}";
      dollar = true;
    } else if (ch === "\\" || code < 0x20 || code === 0x7f) {
      out += "${hex:" + code.toString(16).toUpperCase().padStart(2, "0") + "}";
      encoded = true;
    } else {
      out += ch;
    }
  }
  return { text: `"${out}"`, encoded, dollar };
}

/** Thrown for a string the parser cannot read back as plain text. */
export class SieveStringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SieveStringError";
  }
}

/**
 * The text of a string token's content (already unescaped of `\\` and `\"`):
 * "${postern_dollar}" is "$", "${hex:..}" and "${unicode:..}" are decoded.
 * Any other "${...}" is a variable reference, which Postern never writes in a
 * person's text.
 */
export function decodeSieveText(content: string): string {
  let out = "";
  let i = 0;
  while (i < content.length) {
    const ch = content[i]!;
    if (ch === "$" && content[i + 1] === "{") {
      const end = content.indexOf("}", i + 2);
      if (end < 0) throw new SieveStringError("An unfinished ${ in a string.");
      const inner = content.slice(i + 2, end);
      if (inner.toLowerCase() === DOLLAR_VARIABLE) {
        out += "$";
        i = end + 1;
        continue;
      }
      const m = /^(hex|unicode)\s*:\s*([0-9a-fA-F\s]*)$/i.exec(inner);
      if (!m) throw new SieveStringError(`A variable reference \${${inner}} where Postern writes plain text.`);
      const kind = m[1]!.toLowerCase();
      const parts = m[2]!.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) throw new SieveStringError(`An empty \${${inner}}.`);
      if (kind === "hex") {
        if (parts.some((p) => p.length > 2)) throw new SieveStringError(`A bad hex sequence \${${inner}}.`);
        out += new TextDecoder().decode(Uint8Array.from(parts.map((p) => parseInt(p, 16))));
      } else {
        for (const p of parts) {
          const cp = parseInt(p, 16);
          if (cp > 0x10ffff) throw new SieveStringError(`A bad unicode sequence \${${inner}}.`);
          out += String.fromCodePoint(cp);
        }
      }
      i = end + 1;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}
