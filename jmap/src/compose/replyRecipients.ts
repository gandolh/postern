// Who a reply or reply-all goes to, as Gmail decides it.
//
//   Reply      the original's Reply-To, else its From.
//   Reply all  that, plus the original's other To recipients; its Cc stay Cc.
//   Your own message (sent from any of your addresses): reply goes to its To
//   recipients again, reply-all also keeps its Cc and Bcc.
//
// Your own addresses (every identity) are left out, unless leaving them out
// would leave nobody (a note to yourself). Repeats are dropped, case-insensitive,
// and an address in To is not repeated in Cc.

import type { Email, EmailAddress } from "../types/mail.js";
import { addressKey, dedupeAddresses } from "./address.js";

export type ReplyMode = "reply" | "replyAll";

/** The parts of the original that decide the recipients. */
export type ReplySource = Pick<Email, "from" | "to" | "cc" | "replyTo"> & Partial<Pick<Email, "bcc">>;

export interface ReplyRecipients {
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
}

/**
 * The recipients of a reply to `original`. `me` is every address the user
 * sends as (their identities' emails and the account name).
 */
export function replyRecipients(original: ReplySource, mode: ReplyMode, me: Iterable<string>): ReplyRecipients {
  const mine = new Set([...me].map(addressKey));
  const isMine = (a: EmailAddress) => mine.has(addressKey(a.email));
  const from = original.from ?? [];
  const to = original.to ?? [];
  const cc = original.cc ?? [];
  const fromMe = from.length > 0 && from.every(isMine);

  let nextTo: EmailAddress[];
  let nextCc: EmailAddress[] = [];
  let nextBcc: EmailAddress[] = [];
  if (fromMe) {
    // Following up on your own message: the same people again.
    nextTo = to.length ? [...to] : cc.length ? [...cc] : [...from];
    if (mode === "replyAll") {
      nextCc = to.length ? [...cc] : [];
      nextBcc = [...(original.bcc ?? [])];
    }
  } else {
    const primary = original.replyTo?.length ? original.replyTo : from;
    nextTo = [...primary];
    if (mode === "replyAll") {
      nextTo.push(...to);
      nextCc = [...cc];
    }
  }

  // Leave yourself out, unless that leaves nobody to write to.
  const withoutMe = (list: EmailAddress[]) => list.filter((a) => !isMine(a));
  let finalTo = dedupeAddresses(withoutMe(nextTo));
  let finalCc = dedupeAddresses(withoutMe(nextCc), finalTo.map((a) => a.email));
  const finalBcc = dedupeAddresses(withoutMe(nextBcc), [...finalTo, ...finalCc].map((a) => a.email));
  if (finalTo.length === 0 && finalCc.length > 0) {
    finalTo = finalCc;
    finalCc = [];
  }
  if (finalTo.length === 0 && finalBcc.length === 0) finalTo = dedupeAddresses(nextTo);
  return { to: finalTo, cc: finalCc, bcc: finalBcc };
}

/**
 * The identity a reply is sent from: the first of the user's addresses the
 * original was sent to (To, Cc, Bcc, then Delivered-To order), else null (use
 * the default identity).
 */
export function replyIdentityEmail(original: Partial<Pick<Email, "to" | "cc" | "bcc">>, mine: readonly string[]): string | null {
  const keys = new Map(mine.map((m) => [addressKey(m), m]));
  for (const a of [...(original.to ?? []), ...(original.cc ?? []), ...(original.bcc ?? [])]) {
    const hit = keys.get(addressKey(a.email));
    if (hit) return hit;
  }
  return null;
}
