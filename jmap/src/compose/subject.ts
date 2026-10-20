// Reply and forward subjects, Gmail's way: "Re: " and "Fwd: " are added once,
// never stacked ("Re: Re: "). Stalwart threads a reply only when its
// normalised subject matches the original's (it strips these prefixes), so a
// reply must keep the original subject after the prefix.

const REPLY = /^\s*re\s*(?:\[\d+\])?\s*:/i;
const FORWARD = /^\s*(?:fwd?|fw)\s*(?:\[\d+\])?\s*:/i;
// What mail clients put in front of a subject: Re, Fwd, Fw, and the common
// translations (Aw, Sv, Antw, Rif, Odp, Tr, Wg, Enc, Rv, Vs), with an optional
// count ("Re[2]:"), plus mailing-list tags ("[list] ").
const ANY_PREFIX = /^\s*(?:(?:re|fwd?|fw|aw|sv|antw|rif|odp|tr|wg|enc|rv|vs)\s*(?:\[\d+\])?\s*:|\[[^\]]*\])\s*/i;

/** The subject a reply carries: "Re: <subject>", unless it already starts with "Re:". */
export function replySubject(subject: string | null | undefined): string {
  const s = (subject ?? "").trim();
  if (REPLY.test(s)) return s;
  return s ? `Re: ${s}` : "Re:";
}

/** The subject a forward carries: "Fwd: <subject>", unless it already starts with "Fwd:" or "Fw:". */
export function forwardSubject(subject: string | null | undefined): string {
  const s = (subject ?? "").trim();
  if (FORWARD.test(s)) return s;
  return s ? `Fwd: ${s}` : "Fwd:";
}

/** The subject without any reply, forward or list prefixes: what threading compares. */
export function baseSubject(subject: string | null | undefined): string {
  let s = (subject ?? "").trim();
  for (;;) {
    const next = s.replace(ANY_PREFIX, "");
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, " ").trim();
}
