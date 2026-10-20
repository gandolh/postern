// What the search box offers while you type. Pure: no React, no network.
//
// A SUGGESTION SOURCE is an object with `id`, `heading` and `suggest(query)`.
// The box asks every source on each keystroke (sources may answer later: return
// a promise), shows the answers grouped under each source's heading in source
// order, and writes a chosen suggestion's `text` into the box (and searches
// at once if `submit` is set). Brief 15 adds contacts by returning one more
// source from `useSuggestionSources()` (suggestionSources.ts).
//
//   const contacts: SuggestionSource = {
//     id: "contacts",
//     heading: "Contacts",
//     suggest: (q) => matching(q.rest).map((c) => ({ key: c.id, label: c.name, detail: c.email, text: replaceToken(q, `from:${c.email}`) })),
//   };

export interface SuggestionQuery {
  /** The whole box. */
  input: string;
  /** The word being typed: after the last space (a quoted phrase counts as one word). May be empty. */
  token: string;
  /** Where `token` starts in `input`. */
  tokenStart: number;
  /** "-" when the token starts with it (a negation), else "". Put it back in front of what you suggest. */
  negation: "" | "-";
  /** The operator being typed (`from` in `from:bo`), lower case, or null. */
  operator: string | null;
  /** What follows the operator, or the whole token without its "-"; quotes removed. */
  rest: string;
}

export interface Suggestion {
  /** Unique within its source. */
  key: string;
  /** The line shown. */
  label: string;
  /** A quieter second part: an address, a count. */
  detail?: string;
  /** The box's new content when this is chosen: build it with `replaceToken`. */
  text: string;
  /** Search straight away (a recent search) instead of leaving the box open for more. */
  submit?: boolean;
}

export interface SuggestionSource {
  /** Stable. */
  id: string;
  /** The group's name, shown above its suggestions. */
  heading: string;
  suggest(query: SuggestionQuery, signal: AbortSignal): Suggestion[] | Promise<Suggestion[]>;
}

/** The box's words at the end of `input`: what is being completed. */
export function suggestionQuery(input: string): SuggestionQuery {
  let tokenStart = 0;
  let inQuote = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === '"') inQuote = !inQuote;
    else if (/\s/.test(ch) && !inQuote) tokenStart = i + 1;
  }
  const token = input.slice(tokenStart);
  const negation = token.startsWith("-") ? "-" : "";
  const body = token.slice(negation.length);
  const match = /^([A-Za-z_][A-Za-z0-9_]*):(.*)$/s.exec(body);
  const operator = match ? match[1]!.toLowerCase() : null;
  const rest = (match ? match[2]! : body).replace(/"/g, "");
  return { input, token, tokenStart, negation, operator, rest };
}

/** `input` with the word being typed replaced by `replacement` (put `query.negation` in front yourself if it should stay). */
export function replaceToken(query: SuggestionQuery, replacement: string): string {
  return query.input.slice(0, query.tokenStart) + replacement;
}

/** `value` as an operator argument: quoted when it needs it. */
export function quoteArg(value: string): string {
  return /[\s(){}"]/.test(value) ? `"${value.replace(/"/g, "")}"` : value;
}

const fold = (text: string): string => text.toLowerCase().replace(/[\s_-]+/g, " ").trim();

// ---- Recent searches -------------------------------------------------------

/** The searches made this session (memory only), newest first. */
export class RecentSearches {
  readonly #list: string[] = [];
  readonly #max: number;

  constructor(max = 10) {
    this.#max = max;
  }

  add(query: string): void {
    const q = query.trim();
    if (!q) return;
    const at = this.#list.indexOf(q);
    if (at >= 0) this.#list.splice(at, 1);
    this.#list.unshift(q);
    this.#list.length = Math.min(this.#list.length, this.#max);
  }

  get all(): readonly string[] {
    return this.#list;
  }
}

export function recentSearchSource(recent: RecentSearches, limit = 5): SuggestionSource {
  return {
    id: "recent",
    heading: "Recent searches",
    suggest(q) {
      const typed = q.input.trim().toLowerCase();
      return recent.all
        .filter((s) => s.toLowerCase() !== typed && (typed === "" || s.toLowerCase().includes(typed)))
        .slice(0, limit)
        .map((s) => ({ key: s, label: s, text: s, submit: true }));
    },
  };
}

// ---- Labels ------------------------------------------------------------------

export interface SuggestibleLabel {
  /** "Work/Clients", or the system label's Gmail word ("Inbox"). */
  path: string;
  system: boolean;
}

/** System labels the box writes as `in:inbox`; the rest are `label:"Work/Clients"`. */
const SYSTEM_WORD: Record<string, string> = { inbox: "inbox", starred: "starred", sent: "sent", drafts: "drafts", spam: "spam", trash: "trash" };

export function labelSource(getLabels: () => readonly SuggestibleLabel[], limit = 5): SuggestionSource {
  return {
    id: "labels",
    heading: "Labels",
    suggest(q) {
      if (q.operator !== null && q.operator !== "label" && q.operator !== "in") return [];
      if (q.operator === null && q.rest.length < 1) return [];
      if (q.token === "") return [];
      const needle = fold(q.rest);
      const out: Suggestion[] = [];
      for (const l of getLabels()) {
        const hay = fold(l.path);
        if (needle && !hay.includes(needle)) continue;
        const word = l.system ? SYSTEM_WORD[l.path.toLowerCase()] : undefined;
        if (l.system && !word) continue;
        const operator = word ? "in" : (q.operator ?? "label");
        const value = word ?? quoteArg(l.path);
        out.push({ key: l.path, label: l.path, detail: `${operator}:${word ?? l.path}`, text: replaceToken(q, `${q.negation}${operator}:${value}`) });
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}

// ---- People ------------------------------------------------------------------

export interface Sender {
  name: string | null;
  email: string;
}

export function senderSource(getSenders: () => Promise<readonly Sender[]> | readonly Sender[], limit = 5): SuggestionSource {
  return {
    id: "senders",
    heading: "People",
    async suggest(q) {
      const operator = q.operator;
      if (operator !== null && operator !== "from" && operator !== "to" && operator !== "cc" && operator !== "bcc") return [];
      if (operator === null && q.rest.length < 2) return [];
      const needle = q.rest.toLowerCase();
      const out: Suggestion[] = [];
      for (const s of await getSenders()) {
        if (needle && !s.email.toLowerCase().includes(needle) && !(s.name ?? "").toLowerCase().includes(needle)) continue;
        out.push({
          key: s.email,
          label: s.name || s.email,
          detail: s.name ? s.email : undefined,
          text: replaceToken(q, `${q.negation}${operator ?? "from"}:${quoteArg(s.email)}`),
        });
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}
