// Sending a saved draft: EmailSubmission/set creates the submission, and
// onSuccessUpdateEmail files the message in Sent and drops `$draft` once the
// server has accepted it. Stalwart 0.16.25 answers at once with undoStatus
// "pending" and queues the message; delivery problems come back later as a
// "Failed to deliver message" report from MAILER-DAEMON in the Inbox
// (deliveryStatus stays "unknown"), not as a submission error.

import { escapePointer, JmapSetError, type Id, type JmapClient, type PatchObject } from "@postern/jmap";

export interface SubmitArgs {
  /** The saved draft to send. */
  emailId: Id;
  identityId: Id;
  draftsMailboxId: Id | undefined;
  sentMailboxId: Id | undefined;
}

export interface Submitted {
  submissionId: Id;
  emailId: Id;
}

/** The patch that turns a sent draft into a Sent message. */
export function sentPatch(draftsMailboxId: Id | undefined, sentMailboxId: Id | undefined): PatchObject {
  const patch: PatchObject = { "keywords/$draft": null };
  // A message must stay in a mailbox: leave Drafts only when there is a Sent to go to.
  if (sentMailboxId) {
    patch[`mailboxIds/${escapePointer(sentMailboxId)}`] = true;
    if (draftsMailboxId && draftsMailboxId !== sentMailboxId) patch[`mailboxIds/${escapePointer(draftsMailboxId)}`] = null;
  }
  return patch;
}

/** Send a saved draft. @throws JmapSetError when the server refuses the submission (the draft stays in Drafts). */
export async function submitDraft(client: JmapClient, args: SubmitArgs, signal?: AbortSignal): Promise<Submitted> {
  const res = await client.call(
    "EmailSubmission/set",
    {
      create: { send: { identityId: args.identityId, emailId: args.emailId } },
      onSuccessUpdateEmail: { "#send": sentPatch(args.draftsMailboxId, args.sentMailboxId) },
    },
    { signal },
  );
  const refused = res.notCreated?.["send"];
  if (refused) throw new JmapSetError("EmailSubmission/set", "send", refused);
  const created = res.created?.["send"];
  if (!created?.id) throw new JmapSetError("EmailSubmission/set", "send", { type: "serverFail", description: "No submission came back" });
  return { submissionId: created.id, emailId: args.emailId };
}
