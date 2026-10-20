// RFC 8621 (JMAP for Mail): Mailbox, Thread, Email, SearchSnippet and their
// method arguments.

import type {
  ChangesArgs,
  ChangesWithPropertiesResponse,
  Comparator,
  Filter,
  GetArgs,
  Id,
  QueryArgs,
  QueryChangesArgs,
  SetArgs,
  SetError,
  UTCDate,
} from "./core.js";

// ---- Mailbox (RFC 8621 §2) -------------------------------------------------

/** Mailbox roles from the IANA registry. Find system mailboxes by role, never by name. */
export type MailboxRole =
  | "inbox"
  | "archive"
  | "drafts"
  | "sent"
  | "junk"
  | "trash"
  | "important"
  | "all"
  | "flagged"
  | "subscribed"
  | (string & {});

export interface MailboxRights {
  mayReadItems: boolean;
  mayAddItems: boolean;
  mayRemoveItems: boolean;
  maySetSeen: boolean;
  maySetKeywords: boolean;
  mayCreateChild: boolean;
  mayRename: boolean;
  mayDelete: boolean;
  maySubmit: boolean;
  /** RFC 9670 sharing; Stalwart sends it. */
  mayShare?: boolean;
}

/** A mailbox. The UI calls it a label. */
export interface Mailbox {
  id: Id;
  name: string;
  parentId: Id | null;
  role: MailboxRole | null;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
  myRights: MailboxRights;
  isSubscribed: boolean;
}

export interface MailboxFilterCondition {
  parentId?: Id | null;
  name?: string;
  role?: MailboxRole | null;
  hasAnyRole?: boolean;
  isSubscribed?: boolean;
}

export type MailboxComparator = Comparator<"sortOrder" | "name">;

export type MailboxGetArgs = GetArgs<Mailbox>;
export type MailboxChangesArgs = ChangesArgs;
/** `Mailbox/changes` adds `updatedProperties` (counts-only changes). */
export type MailboxChangesResponse = ChangesWithPropertiesResponse;

export interface MailboxQueryArgs extends QueryArgs<MailboxFilterCondition, MailboxComparator> {
  sortAsTree?: boolean;
  filterAsTree?: boolean;
}

export type MailboxQueryChangesArgs = QueryChangesArgs<MailboxFilterCondition, MailboxComparator>;

/** The writable Mailbox properties. */
export type MailboxCreate = Partial<Pick<Mailbox, "name" | "parentId" | "role" | "sortOrder" | "isSubscribed">>;

export interface MailboxSetArgs extends SetArgs<Mailbox, MailboxCreate> {
  /** Destroy a mailbox's messages with it (else `mailboxHasEmail`). */
  onDestroyRemoveEmails?: boolean;
}

// ---- Thread (RFC 8621 §3) --------------------------------------------------

/** A conversation: the ids of its messages, oldest first. */
export interface Thread {
  id: Id;
  emailIds: Id[];
}

export type ThreadGetArgs = GetArgs<Thread>;

// ---- Email (RFC 8621 §4) ---------------------------------------------------

export interface EmailAddress {
  name: string | null;
  email: string;
}

export interface EmailAddressGroup {
  name: string | null;
  addresses: EmailAddress[];
}

export interface EmailHeader {
  name: string;
  value: string;
}

/** One MIME part (RFC 8621 §4.1.4). Multipart parts have `subParts` and no `partId`. */
export interface EmailBodyPart {
  partId: string | null;
  blobId: Id | null;
  size: number;
  headers?: EmailHeader[];
  name: string | null;
  type: string;
  charset: string | null;
  disposition: string | null;
  /** The Content-Id without angle brackets, for `cid:` URLs. */
  cid: string | null;
  language?: string[] | null;
  location: string | null;
  subParts?: EmailBodyPart[] | null;
}

/** The decoded text of a text part. */
export interface EmailBodyValue {
  value: string;
  isEncodingProblem: boolean;
  isTruncated: boolean;
}

/** Keywords as a set: `{ "$seen": true }`. Common: `$seen`, `$flagged`, `$draft`, `$answered`, `$junk`, `$notjunk`. */
export type Keywords = Record<string, true>;

/** A message. All properties come back only when asked for (`properties`). */
export interface Email {
  id: Id;
  blobId: Id;
  threadId: Id;
  mailboxIds: Record<Id, true>;
  keywords: Keywords;
  size: number;
  receivedAt: UTCDate;
  messageId: string[] | null;
  inReplyTo: string[] | null;
  references: string[] | null;
  sender: EmailAddress[] | null;
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  cc: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
  replyTo: EmailAddress[] | null;
  subject: string | null;
  sentAt: string | null;
  headers: EmailHeader[];
  bodyStructure: EmailBodyPart;
  bodyValues: Record<string, EmailBodyValue>;
  textBody: EmailBodyPart[];
  htmlBody: EmailBodyPart[];
  attachments: EmailBodyPart[];
  hasAttachment: boolean;
  preview: string;
}

/** Email property names, including `header:Name:asForm` forms. */
export type EmailProperty = keyof Email | `header:${string}`;

export type EmailBodyPartProperty = keyof EmailBodyPart | `header:${string}`;

export interface EmailGetArgs {
  accountId: Id;
  ids?: Id[] | null;
  properties?: EmailProperty[] | null;
  bodyProperties?: EmailBodyPartProperty[];
  fetchTextBodyValues?: boolean;
  fetchHTMLBodyValues?: boolean;
  fetchAllBodyValues?: boolean;
  /** Truncate each body value to this many UTF-8 bytes (0 = no limit). */
  maxBodyValueBytes?: number;
}

export interface EmailFilterCondition {
  inMailbox?: Id;
  inMailboxOtherThan?: Id[];
  before?: UTCDate;
  after?: UTCDate;
  minSize?: number;
  maxSize?: number;
  allInThreadHaveKeyword?: string;
  someInThreadHaveKeyword?: string;
  noneInThreadHaveKeyword?: string;
  hasKeyword?: string;
  notKeyword?: string;
  hasAttachment?: boolean;
  text?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  /** Does nothing on Stalwart 0.16: header conditions match no message. */
  header?: [name: string] | [name: string, value: string];
}

export type EmailFilter = Filter<EmailFilterCondition>;

export interface EmailComparator
  extends Comparator<
    | "receivedAt"
    | "size"
    | "from"
    | "to"
    | "subject"
    | "sentAt"
    | "hasKeyword"
    | "allInThreadHaveKeyword"
    | "someInThreadHaveKeyword"
  > {
  /** Required with the keyword sorts. */
  keyword?: string;
}

export interface EmailQueryArgs extends QueryArgs<EmailFilterCondition, EmailComparator> {
  /** One message per conversation: the conversation list. */
  collapseThreads?: boolean;
}

export interface EmailQueryChangesArgs extends QueryChangesArgs<EmailFilterCondition, EmailComparator> {
  collapseThreads?: boolean;
}

export type EmailChangesArgs = ChangesArgs;

/** The properties an Email can be created with (a draft). */
export type EmailCreate = Partial<
  Pick<
    Email,
    | "mailboxIds"
    | "keywords"
    | "receivedAt"
    | "messageId"
    | "inReplyTo"
    | "references"
    | "sender"
    | "from"
    | "to"
    | "cc"
    | "bcc"
    | "replyTo"
    | "subject"
    | "sentAt"
    | "headers"
    | "textBody"
    | "htmlBody"
    | "attachments"
  >
> & {
  bodyStructure?: Partial<EmailBodyPart>;
  bodyValues?: Record<string, Partial<EmailBodyValue> & { value: string }>;
  [header: `header:${string}`]: unknown;
};

export type EmailSetArgs = SetArgs<Email, EmailCreate>;

export interface EmailImport {
  blobId: Id;
  mailboxIds: Record<Id, true>;
  keywords?: Keywords;
  receivedAt?: UTCDate;
}

export interface EmailImportArgs {
  accountId: Id;
  ifInState?: string | null;
  emails: Record<Id, EmailImport>;
}

export interface EmailImportResponse {
  accountId: Id;
  oldState: string | null;
  newState: string;
  created: Record<Id, Pick<Email, "id" | "blobId" | "threadId" | "size">> | null;
  notCreated: Record<Id, SetError> | null;
}

// ---- SearchSnippet (RFC 8621 §5) -------------------------------------------

/** Highlighted search excerpts. `subject` and `preview` are HTML with `<mark>`. */
export interface SearchSnippet {
  emailId: Id;
  subject: string | null;
  preview: string | null;
}

export interface SearchSnippetGetArgs {
  accountId: Id;
  filter?: EmailFilter | null;
  emailIds: Id[];
}

export interface SearchSnippetGetResponse {
  accountId: Id;
  list: SearchSnippet[];
  /** Stalwart sends `null` here. */
  notFound: Id[] | null;
}
