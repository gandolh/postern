// A small Sieve reader (RFC 5228 §2 and §8): tokens, then commands and tests
// as a tree. It knows the grammar, not the meaning; ./parse decides whether
// the tree is one Postern wrote. Multi-line `text:` strings are refused
// (Postern never writes them).

export class SieveSyntaxError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(`Line ${line}: ${message}`);
    this.name = "SieveSyntaxError";
    this.line = line;
  }
}

export type Token =
  | { kind: "identifier"; value: string; line: number }
  | { kind: "tag"; value: string; line: number }
  | { kind: "number"; value: number; unit: "" | "K" | "M" | "G"; line: number }
  /** `raw`: the content with `\\` and `\"` undone, before any "${...}" decoding. */
  | { kind: "string"; raw: string; line: number }
  | { kind: "punct"; value: "[" | "]" | "(" | ")" | "{" | "}" | "," | ";"; line: number };

/** Split Sieve source into tokens. Comments are dropped. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const src = source.replace(/^\uFEFF/, "");
  const n = src.length;
  while (i < n) {
    const ch = src[i]!;
    if (ch === "\n") {
      line++;
      i++;
    } else if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
    } else if (ch === "#") {
      while (i < n && src[i] !== "\n") i++;
    } else if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) throw new SieveSyntaxError("A comment is not closed.", line);
      for (let j = i; j < end; j++) if (src[j] === "\n") line++;
      i = end + 2;
    } else if (ch === '"') {
      const start = line;
      let raw = "";
      i++;
      for (;;) {
        if (i >= n) throw new SieveSyntaxError("A string is not closed.", start);
        const c = src[i]!;
        if (c === "\\") {
          if (i + 1 >= n) throw new SieveSyntaxError("A string is not closed.", start);
          raw += src[i + 1]!;
          if (src[i + 1] === "\n") line++;
          i += 2;
        } else if (c === '"') {
          i++;
          break;
        } else {
          if (c === "\n") line++;
          raw += c;
          i++;
        }
      }
      tokens.push({ kind: "string", raw, line: start });
    } else if ("[](){},;".includes(ch)) {
      tokens.push({ kind: "punct", value: ch as "[", line });
      i++;
    } else if (ch === ":") {
      const m = /^:([A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(i, i + 200));
      if (!m) throw new SieveSyntaxError("A colon not followed by a tag name.", line);
      tokens.push({ kind: "tag", value: m[1]!.toLowerCase(), line });
      i += m[0].length;
    } else if (/[0-9]/.test(ch)) {
      const m = /^([0-9]+)([KMGkmg]?)/.exec(src.slice(i, i + 40))!;
      const after = src[i + m[0].length];
      if (after !== undefined && /[A-Za-z0-9_]/.test(after)) throw new SieveSyntaxError("A malformed number.", line);
      tokens.push({ kind: "number", value: Number(m[1]), unit: m[2]!.toUpperCase() as "" | "K", line });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 200))!;
      if (m[0].toLowerCase() === "text" && src[i + m[0].length] === ":") {
        throw new SieveSyntaxError("A multi-line text: string, which Postern never writes.", line);
      }
      tokens.push({ kind: "identifier", value: m[0].toLowerCase(), line });
      i += m[0].length;
    } else {
      throw new SieveSyntaxError(`An unexpected character ${JSON.stringify(ch)}.`, line);
    }
  }
  return tokens;
}

export type Argument =
  | { kind: "tag"; name: string }
  | { kind: "number"; value: number; unit: "" | "K" | "M" | "G" }
  | { kind: "string"; raw: string }
  | { kind: "list"; raws: string[] };

export interface Test {
  name: string;
  args: Argument[];
  /** The tests of allof / anyof, the one test of not. */
  tests: Test[];
  line: number;
}

export interface Command {
  name: string;
  args: Argument[];
  /** The test of if / elsif. */
  tests: Test[];
  /** The block of if / elsif / else, or null for a plain command. */
  block: Command[] | null;
  line: number;
}

class Reader {
  #i = 0;
  readonly #tokens: Token[];
  constructor(tokens: Token[]) {
    this.#tokens = tokens;
  }
  peek(): Token | undefined {
    return this.#tokens[this.#i];
  }
  next(): Token {
    const t = this.#tokens[this.#i++];
    if (!t) throw new SieveSyntaxError("The script ends too early.", this.#tokens[this.#tokens.length - 1]?.line ?? 1);
    return t;
  }
  isPunct(value: string): boolean {
    const t = this.peek();
    return t?.kind === "punct" && t.value === value;
  }
  expectPunct(value: string): void {
    const t = this.next();
    if (t.kind !== "punct" || t.value !== value) throw new SieveSyntaxError(`Expected "${value}".`, t.line);
  }
  get done(): boolean {
    return this.#i >= this.#tokens.length;
  }
}

function readArguments(r: Reader): Argument[] {
  const args: Argument[] = [];
  for (;;) {
    const t = r.peek();
    if (!t) return args;
    if (t.kind === "tag") {
      r.next();
      args.push({ kind: "tag", name: t.value });
    } else if (t.kind === "number") {
      r.next();
      args.push({ kind: "number", value: t.value, unit: t.unit });
    } else if (t.kind === "string") {
      r.next();
      args.push({ kind: "string", raw: t.raw });
    } else if (t.kind === "punct" && t.value === "[") {
      r.next();
      const raws: string[] = [];
      for (;;) {
        const s = r.next();
        if (s.kind !== "string") throw new SieveSyntaxError("A string list holds strings only.", s.line);
        raws.push(s.raw);
        const sep = r.next();
        if (sep.kind === "punct" && sep.value === "]") break;
        if (sep.kind !== "punct" || sep.value !== ",") throw new SieveSyntaxError('Expected "," or "]".', sep.line);
      }
      args.push({ kind: "list", raws });
    } else {
      return args;
    }
  }
}

function readTest(r: Reader): Test {
  const t = r.next();
  if (t.kind !== "identifier") throw new SieveSyntaxError("Expected a test.", t.line);
  const args = readArguments(r);
  const tests: Test[] = [];
  if (r.isPunct("(")) {
    r.next();
    tests.push(readTest(r));
    while (r.isPunct(",")) {
      r.next();
      tests.push(readTest(r));
    }
    r.expectPunct(")");
  } else if (r.peek()?.kind === "identifier") {
    tests.push(readTest(r));
  }
  return { name: t.value, args, tests, line: t.line };
}

function readCommands(r: Reader, inBlock: boolean): Command[] {
  const commands: Command[] = [];
  for (;;) {
    if (r.done) {
      if (inBlock) throw new SieveSyntaxError('A block is not closed with "}".', 0);
      return commands;
    }
    if (inBlock && r.isPunct("}")) {
      r.next();
      return commands;
    }
    const t = r.next();
    if (t.kind !== "identifier") throw new SieveSyntaxError("Expected a command.", t.line);
    const args = readArguments(r);
    const tests: Test[] = [];
    if (r.peek()?.kind === "identifier") tests.push(readTest(r));
    if (r.isPunct("{")) {
      r.next();
      commands.push({ name: t.value, args, tests, block: readCommands(r, true), line: t.line });
    } else {
      r.expectPunct(";");
      commands.push({ name: t.value, args, tests, block: null, line: t.line });
    }
  }
}

/** The script as a list of top-level commands. */
export function parseSyntax(source: string): Command[] {
  return readCommands(new Reader(tokenize(source)), false);
}
