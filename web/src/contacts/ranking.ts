// Which people a recipient field offers, and in what order. Pure.
//
// A person matches when what was typed is the start of their address, of their
// name, of any word of the name, or of any word of the address's local part
// (and, from three characters, anywhere in the address). Matches are ordered:
//
//   1. how the match was made (start of name or address, then a later word,
//      then anywhere);
//   2. a member of a matching group, before a lone match;
//   3. saved contacts before "Other contacts" (people only written to);
//   4. how often they were written to, then how recently;
//   5. name, then address, so equal people stay put.

export type Provenance = "contact" | "other";

/** One address someone may be offered. */
export interface Candidate {
  name: string | null;
  email: string;
  provenance: Provenance;
  /** Messages in Sent that went to this address. */
  count: number;
  /** When the newest of them was sent, ms since the epoch; 0 for never. */
  last: number;
  /** The query matched the name of a group this person belongs to. */
  viaGroup?: boolean;
}

const WORD_BREAK = /[\s.,'"()-]+/;
const LOCAL_BREAK = /[._+-]+/;

/** How the query matches: 0 start of name or address, 1 a later word, 2 anywhere in the address; null for no match. `q` is trimmed and lower-case. */
export function matchTier(c: Pick<Candidate, "name" | "email">, q: string): 0 | 1 | 2 | null {
  if (!q) return null;
  const email = c.email.toLowerCase();
  const name = (c.name ?? "").toLowerCase();
  if (email.startsWith(q) || name.startsWith(q)) return 0;
  if (name.split(WORD_BREAK).some((w) => w.startsWith(q))) return 1;
  const local = email.split("@")[0] ?? "";
  if (local.split(LOCAL_BREAK).some((w) => w.startsWith(q))) return 1;
  return q.length >= 3 && email.includes(q) ? 2 : null;
}

function compare(a: { c: Candidate; tier: number }, b: { c: Candidate; tier: number }): number {
  return (
    a.tier - b.tier ||
    Number(!!b.c.viaGroup) - Number(!!a.c.viaGroup) ||
    Number(a.c.provenance === "other") - Number(b.c.provenance === "other") ||
    b.c.count - a.c.count ||
    b.c.last - a.c.last ||
    (a.c.name ?? "").localeCompare(b.c.name ?? "") ||
    a.c.email.localeCompare(b.c.email)
  );
}

/**
 * Merge candidates that share an address (a saved contact that was also written
 * to keeps its name and gets the sending history), keeping the strongest
 * provenance and the largest history.
 */
export function mergeCandidates(list: readonly Candidate[]): Candidate[] {
  const byEmail = new Map<string, Candidate>();
  for (const c of list) {
    const key = c.email.trim().toLowerCase();
    const known = byEmail.get(key);
    if (!known) {
      byEmail.set(key, { ...c });
      continue;
    }
    if (c.provenance === "contact" && known.provenance !== "contact") {
      known.provenance = "contact";
      if (c.name) known.name = c.name;
    } else if (!known.name && c.name) known.name = c.name;
    known.count = Math.max(known.count, c.count);
    known.last = Math.max(known.last, c.last);
    known.viaGroup = known.viaGroup || c.viaGroup;
  }
  return [...byEmail.values()];
}

/** The best `limit` of `candidates` for what was typed. */
export function rankCandidates(candidates: readonly Candidate[], query: string, limit: number): Candidate[] {
  const q = query.trim().toLowerCase();
  if (!q || limit <= 0) return [];
  const scored: { c: Candidate; tier: number }[] = [];
  for (const c of mergeCandidates(candidates)) {
    const tier = c.viaGroup ? 0 : matchTier(c, q);
    if (tier !== null) scored.push({ c, tier });
  }
  return scored
    .sort(compare)
    .slice(0, limit)
    .map((s) => s.c);
}
