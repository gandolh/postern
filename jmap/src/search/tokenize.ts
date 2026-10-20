// Splits a search string into tokens. Never throws: an unterminated quote runs
// to the end of the input and is reported.

export type Token =
  | { kind: "word"; text: string; raw: string }
  | { kind: "phrase"; text: string; raw: string }
  /** `name:value`. `quoted` when the value was in quotes. */
  | { kind: "op"; name: string; value: string; quoted: boolean; raw: string }
  /** `name:(` : the group that follows applies the operator to each of its words. */
  | { kind: "opgroup"; name: string; raw: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "lbrace" }
  | { kind: "rbrace" }
  | { kind: "or" }
  | { kind: "neg" };

export interface Tokenized {
  tokens: Token[];
  /** Raw text of quotes that never closed. */
  unterminated: string[];
}

const SPACE = /\s/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const STOPS = new Set(["(", ")", "{", "}"]);

export function tokenize(input: string): Tokenized {
  const tokens: Token[] = [];
  const unterminated: string[] = [];
  let i = 0;
  const n = input.length;

  /** Reads a quoted string starting at the opening quote; returns its text. */
  function quoted(): string {
    const start = i;
    i++;
    let text = "";
    let closed = false;
    while (i < n) {
      const ch = input[i]!;
      if (ch === '"') {
        closed = true;
        i++;
        break;
      }
      text += ch;
      i++;
    }
    if (!closed) unterminated.push(input.slice(start));
    return text;
  }

  while (i < n) {
    const ch = input[i]!;
    if (SPACE.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (ch === "{") {
      tokens.push({ kind: "lbrace" });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ kind: "rbrace" });
      i++;
      continue;
    }
    if (ch === "-" && i + 1 < n && !SPACE.test(input[i + 1]!) && input[i + 1] !== "-") {
      tokens.push({ kind: "neg" });
      i++;
      continue;
    }
    if (ch === "-") {
      // A lone or doubled dash says nothing.
      i++;
      continue;
    }
    if (ch === '"') {
      const start = i;
      const text = quoted();
      tokens.push({ kind: "phrase", text, raw: input.slice(start, i) });
      continue;
    }
    // A word: up to a space, a bracket, or (after `name:`) the start of a quote.
    const start = i;
    while (i < n && !SPACE.test(input[i]!) && !STOPS.has(input[i]!)) {
      if (input[i] === '"') break;
      i++;
    }
    const text = input.slice(start, i);
    if (text === "") {
      // A quote glued to a word ("a"b"): take it as the next token.
      continue;
    }
    const colon = text.indexOf(":");
    if (colon > 0 && NAME.test(text.slice(0, colon))) {
      const name = text.slice(0, colon).toLowerCase();
      const value = text.slice(colon + 1);
      if (value === "" && input[i] === '"') {
        const qStart = start;
        const v = quoted();
        tokens.push({ kind: "op", name, value: v, quoted: true, raw: input.slice(qStart, i) });
        continue;
      }
      if (value === "" && input[i] === "(") {
        tokens.push({ kind: "opgroup", name, raw: text });
        i++; // the "("
        continue;
      }
      tokens.push({ kind: "op", name, value, quoted: false, raw: text });
      continue;
    }
    if (text === "OR") tokens.push({ kind: "or" });
    else if (text === "AND") continue;
    else tokens.push({ kind: "word", text, raw: text });
    // A quote right after a plain word starts a new token.
  }
  return { tokens, unterminated };
}
