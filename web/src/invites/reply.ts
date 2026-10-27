// Answering an invite (brief 25): Postern sends the iMIP REPLY itself (RFC
// 6047). Stalwart 0.16.25 does nothing with an incoming REQUEST (no event in
// the calendar, nothing added to the message), and its /calendar/rsvp page
// only answers the links in invitations Stalwart sent (checked 2026-10-27).
// Postern writes nothing to a JMAP calendar.
//
// The reply goes from the identity the invite named, to the organiser, as a
// multipart/alternative of a short text and the text/calendar REPLY, and is
// filed in Sent like any send. The answer is kept on the invite message as a
// keyword, so every device shows it.

import { escapePointer, JmapSetError, type EmailBodyPart, type Id, type Identity, type JmapClient } from "@postern/jmap";
import { submitDraft } from "../send/submit";
import { buildReply, type Invite, type Person } from "./ics";

export type Answer = "ACCEPTED" | "DECLINED" | "TENTATIVE";

/** The answer, on the invite message. */
export const ANSWER_KEYWORDS: Readonly<Record<Answer, string>> = {
  ACCEPTED: "$rsvp-accepted",
  DECLINED: "$rsvp-declined",
  TENTATIVE: "$rsvp-tentative",
};

const VERB: Record<Answer, { subject: string; text: string }> = {
  ACCEPTED: { subject: "Accepted", text: "has accepted" },
  DECLINED: { subject: "Declined", text: "has declined" },
  TENTATIVE: { subject: "Tentative", text: "might attend" },
};

/** The answer kept on the message, if any. */
export function answerOf(keywords: Readonly<Record<string, true>>): Answer | null {
  for (const [answer, keyword] of Object.entries(ANSWER_KEYWORDS) as [Answer, string][]) if (keywords[keyword]) return answer;
  return null;
}

/** The attendee line that is me, and the identity to answer from: its address exactly. */
export function myAttendance(invite: Invite, identities: readonly Pick<Identity, "id" | "email" | "name">[]): { me: Person & { partstat: string }; identity: Pick<Identity, "id" | "email" | "name"> } | null {
  for (const a of invite.attendees) {
    const identity = identities.find((i) => i.email.toLowerCase() === a.email.toLowerCase());
    if (identity) return { me: a, identity };
  }
  return null;
}

export interface ReplyArgs {
  invite: Invite;
  /** The invite message: the answer is kept on it, and the reply refers to it. */
  messageId: Id;
  messageIdHeader: string[] | null;
  identity: Pick<Identity, "id" | "email" | "name">;
  /** The attendee as the invite names them. */
  me: Person;
  answer: Answer;
  draftsMailboxId: Id | undefined;
  sentMailboxId: Id | undefined;
  now?: Date;
}

export async function sendInviteReply(client: JmapClient, args: ReplyArgs): Promise<void> {
  const { invite, identity, answer } = args;
  const organizer = invite.organizer;
  if (!organizer) throw new JmapSetError("Email/set", "reply", { type: "invalidProperties", description: "The invite names no organiser" });
  const ics = buildReply(invite, { email: args.me.email, name: identity.name || args.me.name }, answer, args.now ?? new Date());
  const who = identity.name || identity.email;
  const title = invite.summary || "the event";
  const mailboxIds: Record<Id, true> = args.draftsMailboxId ? { [args.draftsMailboxId]: true } : args.sentMailboxId ? { [args.sentMailboxId]: true } : {};
  const res = await client.call("Email/set", {
    create: {
      reply: {
        mailboxIds,
        keywords: { $draft: true, $seen: true },
        from: [{ name: identity.name || null, email: identity.email }],
        to: [{ name: organizer.name, email: organizer.email }],
        subject: `${VERB[answer].subject}: ${title}`,
        ...(args.messageIdHeader?.length ? { inReplyTo: args.messageIdHeader, references: args.messageIdHeader } : {}),
        bodyStructure: {
          type: "multipart/alternative",
          // Stalwart takes the method parameter through the part's Content-Type header.
          subParts: [
            { partId: "text", type: "text/plain" },
            { partId: "ics", type: "text/calendar", "header:Content-Type": " text/calendar; charset=utf-8; method=REPLY" },
          ] as unknown as EmailBodyPart[],
        },
        bodyValues: { text: { value: `${who} ${VERB[answer].text} ${title}.` }, ics: { value: ics } },
      },
    },
  });
  const created = res.created?.["reply"];
  if (!created?.id) throw new JmapSetError("Email/set", "reply", res.notCreated?.["reply"] ?? { type: "serverFail" });
  await submitDraft(client, { emailId: created.id, identityId: identity.id, draftsMailboxId: args.draftsMailboxId, sentMailboxId: args.sentMailboxId });
  const keywords: Record<string, boolean | null> = {};
  for (const [a, k] of Object.entries(ANSWER_KEYWORDS)) keywords[`keywords/${escapePointer(k)}`] = a === answer ? true : null;
  await client.call("Email/set", { update: { [args.messageId]: keywords } });
}
