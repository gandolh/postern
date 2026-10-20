// Gmail-style search to an Email/query filter. Pure and deterministic: `now`
// is injected and nothing throws, whatever the input.
//
// Grammar (what Gmail does):
//   search  := item*                    adjacent items are ANDed
//   item    := unary ("OR" unary)*      OR binds tighter than the space, as in Gmail
//   unary   := "-"? atom
//   atom    := word | "phrase" | name:value | name:"phrase" | name:(a b) | (search) | {a b}
// `{a b}` is `a OR b`. Bare words and phrases go to `text`. An operator
// Postern does not know falls back to plain text, with a warning.

import type { Id } from "../types/core.js";
import type { EmailFilter, EmailFilterCondition } from "../types/mail.js";
import { parseSearchDate, parseSize, subtractAge, toUtcDate } from "./dates.js";
import { tokenize, type Token } from "./tokenize.js";
import type { ParsedSearch, ParseSearchOptions, SearchRoles, SearchWarning, SearchWarningKind } from "./types.js";

type Node =
  | { t: "cond"; c: EmailFilterCondition }
  | { t: "and" | "or"; kids: Node[] }
  | { t: "not"; kid: Node }
  | { t: "nothing" };

const SEEN = "$seen";
const FLAGGED = "$flagged";
const IMPORTANT = "$important";

/** Gmail operators Stalwart 0.16 cannot honour (no header search, no classifier, no per-part search). */
const UNSUPPORTED = new Map<string, string>([
  ["rfc822msgid", "Stalwart can't search message headers"],
  ["list", "Stalwart can't search message headers"],
  ["deliveredto", "Stalwart can't search message headers"],
  ["filename", "Stalwart can't search attachment names"],
  ["category", "there are no categories"],
  ["size", "use larger: or smaller:"],
  ["replyto", "Stalwart can't search message headers"],
]);

const SYSTEM_IN = new Map<string, keyof SearchRoles | "starred" | "important" | "anywhere">([
  ["inbox", "inbox"],
  ["sent", "sent"],
  ["drafts", "drafts"],
  ["draft", "drafts"],
  ["spam", "junk"],
  ["junk", "junk"],
  ["trash", "trash"],
  ["bin", "trash"],
  ["starred", "starred"],
  ["important", "important"],
  ["anywhere", "anywhere"],
  ["all", "anywhere"],
]);

const ROLE_WORDS: Record<string, string> = { junk: "Spam", trash: "Trash", sent: "Sent", drafts: "Drafts", inbox: "Inbox", archive: "All Mail" };

export function parseSearch(input: string, options: ParseSearchOptions): ParsedSearch {
  return new Parser(input, options).run();
}

class Parser {
  readonly #opts: ParseSearchOptions;
  readonly #tokens: Token[];
  readonly #unterminated: string[];
  #pos = 0;
  readonly #warnings: SearchWarning[] = [];
  readonly #terms: string[] = [];
  /** Mailbox ids named by a positive `in:` / `label:`. */
  readonly #named = new Set<Id>();
  #anywhere = false;

  constructor(input: string, opts: ParseSearchOptions) {
    this.#opts = opts;
    const t = tokenize(typeof input === "string" ? input : "");
    this.#tokens = t.tokens;
    this.#unterminated = t.unterminated;
  }

  run(): ParsedSearch {
    for (const raw of this.#unterminated) {
      this.#warn("unterminated-quote", raw, "A quotation mark was never closed; the rest of the search is taken as quoted.");
    }
    const root = this.#sequence("eof", false, null);
    const roles = this.#opts.roles;
    const exclude = [roles.junk, roles.trash].filter((id): id is Id => id !== undefined && !this.#named.has(id));
    const parts: Node[] = [];
    if (root) parts.push(root);
    if (!this.#anywhere && exclude.length > 0) parts.push({ t: "cond", c: { inMailboxOtherThan: exclude } });
    const filter = toFilter(parts.length === 1 ? parts[0]! : { t: "and", kids: parts });

    let scope: ParsedSearch["scope"] = "normal";
    if (!this.#anywhere && this.#named.size === 1) {
      const [only] = [...this.#named];
      if (only === roles.trash) scope = "trash";
      else if (only === roles.junk) scope = "spam";
    }
    return { filter, warnings: this.#warnings, terms: this.#terms, scope };
  }

  #warn(kind: SearchWarningKind, token: string, message: string): void {
    this.#warnings.push({ kind, token, message });
  }

  #peek(): Token | undefined {
    return this.#tokens[this.#pos];
  }

  /**
   * Items up to the closing token. `or`: every item is an alternative
   * (braces). `ctx`: an operator name that every bare word inside applies to.
   */
  #sequence(until: "eof" | "rparen" | "rbrace", or: boolean, ctx: string | null, neg = false): Node | null {
    const items: Node[] = [];
    for (;;) {
      const tok = this.#peek();
      if (!tok) {
        if (until !== "eof") this.#warn("unbalanced-parenthesis", until === "rparen" ? "(" : "{", `A ${until === "rparen" ? "parenthesis" : "brace"} was never closed.`);
        break;
      }
      if (tok.kind === "rparen" || tok.kind === "rbrace") {
        if ((tok.kind === "rparen" && until === "rparen") || (tok.kind === "rbrace" && until === "rbrace")) {
          this.#pos++;
          break;
        }
        // A closer for something that is not open here.
        this.#pos++;
        this.#warn("unbalanced-parenthesis", tok.kind === "rparen" ? ")" : "}", `A stray ${tok.kind === "rparen" ? "parenthesis" : "brace"} was ignored.`);
        continue;
      }
      if (tok.kind === "or") {
        this.#pos++;
        continue; // a leading or doubled OR joins nothing
      }
      const first = this.#unary(ctx, neg);
      if (!first) continue;
      if (or) {
        items.push(first);
        continue;
      }
      const alternatives = [first];
      while (this.#peek()?.kind === "or") {
        this.#pos++;
        const next = this.#peek();
        if (!next || next.kind === "rparen" || next.kind === "rbrace") break;
        if (next.kind === "or") continue;
        const more = this.#unary(ctx, neg);
        if (more) alternatives.push(more);
      }
      items.push(alternatives.length === 1 ? first : { t: "or", kids: alternatives });
    }
    if (items.length === 0) return null;
    return or ? (items.length === 1 ? items[0]! : { t: "or", kids: items }) : items.length === 1 ? items[0]! : { t: "and", kids: items };
  }

  /** One atom with its `-`. Null when it says nothing. */
  #unary(ctx: string | null, neg: boolean): Node | null {
    let negated = false;
    while (this.#peek()?.kind === "neg") {
      this.#pos++;
      negated = !negated;
    }
    const effective = neg !== negated; // parity: is the atom under an odd number of "-"
    const tok = this.#peek();
    if (!tok) return null;
    if (tok.kind === "rparen" || tok.kind === "rbrace" || tok.kind === "or") return null;
    this.#pos++;
    let node: Node | null;
    switch (tok.kind) {
      case "lparen":
        node = this.#sequence("rparen", false, ctx, effective);
        break;
      case "lbrace":
        node = this.#sequence("rbrace", true, ctx, effective);
        break;
      case "opgroup":
        node = this.#sequence("rparen", false, tok.name, effective);
        break;
      case "word":
        node = ctx ? this.#operator(ctx, tok.text, false, tok.raw, effective) : this.#text(tok.text, false, effective);
        break;
      case "phrase":
        if (tok.text.trim() === "") return null;
        node = ctx ? this.#operator(ctx, tok.text, true, tok.raw, effective) : this.#text(tok.text, true, effective);
        break;
      case "op":
        node = this.#operator(tok.name, tok.value, tok.quoted, tok.raw, effective);
        break;
      default:
        return null;
    }
    if (!node) return null;
    return negated ? { t: "not", kid: node } : node;
  }

  #text(text: string, phrase: boolean, negated: boolean): Node {
    if (!negated) this.#terms.push(text);
    return { t: "cond", c: { text: phrase ? `"${text}"` : text } };
  }

  /** `name:value`. `negated`: the effective parity, for what a positive mention means. */
  #operator(name: string, value: string, quoted: boolean, raw: string, negated: boolean): Node | null {
    const opts = this.#opts;
    const v = value.trim();
    const asText = (kind: SearchWarningKind, why: string): Node | null => {
      this.#warn(kind, raw, why);
      return this.#text(raw, false, negated);
    };
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) return this.#text(raw, false, negated);
    const KNOWN = ["from", "to", "cc", "bcc", "subject", "has", "is", "in", "label", "before", "after", "older_than", "newer_than", "larger", "smaller"];
    if (!KNOWN.includes(name)) {
      if (v.startsWith("//") && !UNSUPPORTED.has(name)) return this.#text(raw, false, negated); // a URL
      const why = UNSUPPORTED.get(name);
      if (why) return asText("unsupported", `${name}: isn't supported (${why}); searched as plain words.`);
      return asText("unknown-operator", `${name}: isn't a search operator here; searched as plain words.`);
    }
    if (v === "") {
      this.#warn("empty-operator", raw, `${name}: needs a value; it was left out.`);
      return null;
    }
    switch (name) {
      case "from":
      case "to":
      case "cc":
      case "bcc": {
        const address = v.toLowerCase() === "me" && opts.me ? opts.me : v;
        if (!negated) this.#terms.push(address);
        return { t: "cond", c: { [name]: address } };
      }
      case "subject":
        if (!negated) this.#terms.push(v);
        return { t: "cond", c: { subject: quoted ? `"${v}"` : v } };
      case "has":
        if (v.toLowerCase() === "attachment" || v.toLowerCase() === "attachments") return { t: "cond", c: { hasAttachment: true } };
        return asText("unsupported", `has:${v} isn't supported; searched as plain words.`);
      case "is": {
        switch (v.toLowerCase()) {
          case "unread":
            return { t: "cond", c: { notKeyword: SEEN } };
          case "read":
            return { t: "cond", c: { hasKeyword: SEEN } };
          case "starred":
            return { t: "cond", c: { hasKeyword: FLAGGED } };
          case "important":
            return { t: "cond", c: { hasKeyword: IMPORTANT } };
          default:
            return asText("unsupported", `is:${v} isn't supported; searched as plain words.`);
        }
      }
      case "in":
      case "label":
        return this.#place(name, v, raw, negated);
      case "before":
      case "after": {
        const date = parseSearchDate(v, opts.utcOffsetMinutes ?? 0);
        if (!date) {
          this.#warn("bad-value", raw, `${name}: wants a date like 2026/01/31 or 2026-01-31; it was left out.`);
          return null;
        }
        return { t: "cond", c: { [name]: toUtcDate(date) } };
      }
      case "older_than":
      case "newer_than": {
        const date = subtractAge(opts.now, v);
        if (!date) {
          this.#warn("bad-value", raw, `${name}: wants a number and d, m or y, like 3d or 2m; it was left out.`);
          return null;
        }
        return { t: "cond", c: { [name === "older_than" ? "before" : "after"]: toUtcDate(date) } };
      }
      case "larger":
      case "smaller": {
        const bytes = parseSize(v);
        if (bytes === null) {
          this.#warn("bad-value", raw, `${name}: wants a size like 500, 10K or 5M; it was left out.`);
          return null;
        }
        // Gmail's larger/smaller are strict; JMAP's minSize is inclusive and maxSize exclusive.
        return { t: "cond", c: name === "larger" ? { minSize: bytes + 1 } : { maxSize: bytes } };
      }
    }
    return null;
  }

  /** `in:` and `label:`: a system place or a label by name. */
  #place(name: string, v: string, raw: string, negated: boolean): Node | null {
    const roles = this.#opts.roles;
    const key = v.toLowerCase();
    const sys = SYSTEM_IN.get(key);
    if (sys === "anywhere") {
      if (name === "in" && !negated) this.#anywhere = true;
      return null;
    }
    if (sys === "starred") return { t: "cond", c: { hasKeyword: FLAGGED } };
    if (sys === "important") return { t: "cond", c: { hasKeyword: IMPORTANT } };
    if (sys) {
      const id = roles[sys];
      if (id === undefined) {
        this.#warn("missing-mailbox", raw, `This account has no ${ROLE_WORDS[sys] ?? sys} label; nothing matches ${raw}.`);
        return { t: "nothing" };
      }
      if (!negated) this.#named.add(id);
      return { t: "cond", c: { inMailbox: id } };
    }
    const id = this.#opts.labels(v);
    if (id === undefined) {
      this.#warn("unknown-label", raw, `There's no label called “${v}”.`);
      return { t: "nothing" };
    }
    if (!negated) this.#named.add(id);
    return { t: "cond", c: { inMailbox: id } };
  }
}

/** The Email/query filter for a node: no empty AND, single children unwrapped, NOT of one. */
function toFilter(node: Node): EmailFilter | null {
  switch (node.t) {
    case "cond":
      return node.c;
    case "nothing":
      return { operator: "OR", conditions: [] };
    case "not": {
      const kid = toFilter(node.kid);
      return kid ? { operator: "NOT", conditions: [kid] } : null;
    }
    case "and":
    case "or": {
      const kids: EmailFilter[] = [];
      for (const k of node.kids) {
        const f = toFilter(k);
        if (!f) continue;
        // Flatten an AND in an AND: { AND [ {AND [a,b]}, c ] } is { AND [a,b,c] }.
        if (node.t === "and" && "operator" in f && f.operator === "AND") kids.push(...f.conditions);
        else kids.push(f);
      }
      if (kids.length === 0) return null;
      if (kids.length === 1) return kids[0]!;
      return { operator: node.t === "and" ? "AND" : "OR", conditions: kids };
    }
  }
}
