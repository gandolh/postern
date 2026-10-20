// RFC 8621 §6-8: Identity, EmailSubmission and VacationResponse.

import type { Comparator, GetArgs, Id, PatchObject, QueryArgs, QueryChangesArgs, SetArgs, UTCDate } from "./core.js";
import type { EmailAddress } from "./mail.js";

// ---- Identity (RFC 8621 §6) ------------------------------------------------

/** An address the user can send as, with its signatures. */
export interface Identity {
  id: Id;
  name: string;
  email: string;
  replyTo: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
  textSignature: string;
  htmlSignature: string;
  mayDelete: boolean;
}

export type IdentityCreate = Partial<Omit<Identity, "id" | "mayDelete">> & { email: string };
export type IdentitySetArgs = SetArgs<Identity, IdentityCreate>;

// ---- EmailSubmission (RFC 8621 §7) -----------------------------------------

/** An SMTP address with optional ESMTP parameters. */
export interface SubmissionAddress {
  email: string;
  parameters: Record<string, string | null> | null;
}

export interface Envelope {
  mailFrom: SubmissionAddress;
  rcptTo: SubmissionAddress[];
}

export interface DeliveryStatus {
  smtpReply: string;
  delivered: "queued" | "yes" | "no" | "unknown";
  displayed: "unknown" | "yes";
}

export type UndoStatus = "pending" | "final" | "canceled";

export interface EmailSubmission {
  id: Id;
  identityId: Id;
  emailId: Id;
  threadId: Id;
  envelope: Envelope | null;
  sendAt: UTCDate;
  undoStatus: UndoStatus;
  deliveryStatus: Record<string, DeliveryStatus> | null;
  dsnBlobIds: Id[];
  mdnBlobIds: Id[];
}

export interface EmailSubmissionCreate {
  identityId: Id;
  /** An Email id, or `#creationId` of an Email created earlier in the request. */
  emailId: Id;
  envelope?: Envelope | null;
  /** Stalwart advertises FUTURERELEASE; see the scheduled-send todo. */
  sendAt?: UTCDate;
}

export interface EmailSubmissionSetArgs extends SetArgs<EmailSubmission, EmailSubmissionCreate> {
  /** Patch the Email when its submission succeeds: key is the submission id or `#creationId`. */
  onSuccessUpdateEmail?: Record<Id, PatchObject> | null;
  /** Destroy the Email when its submission succeeds. */
  onSuccessDestroyEmail?: Id[] | null;
}

export interface EmailSubmissionFilterCondition {
  identityIds?: Id[];
  emailIds?: Id[];
  threadIds?: Id[];
  undoStatus?: UndoStatus;
  before?: UTCDate;
  after?: UTCDate;
}

export type EmailSubmissionComparator = Comparator<"emailId" | "threadId" | "sentAt">;
export type EmailSubmissionGetArgs = GetArgs<EmailSubmission>;
export type EmailSubmissionQueryArgs = QueryArgs<EmailSubmissionFilterCondition, EmailSubmissionComparator>;
export type EmailSubmissionQueryChangesArgs = QueryChangesArgs<
  EmailSubmissionFilterCondition,
  EmailSubmissionComparator
>;

// ---- VacationResponse (RFC 8621 §8) ----------------------------------------

/** The vacation responder. There is exactly one, with id `singleton`. */
export interface VacationResponse {
  id: "singleton";
  isEnabled: boolean;
  fromDate: UTCDate | null;
  toDate: UTCDate | null;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
}

export type VacationResponseGetArgs = GetArgs<VacationResponse>;
export type VacationResponseSetArgs = SetArgs<VacationResponse, never>;
