// Every method the client knows, with its argument and response types. The
// request builder is typed from this map.

import type {
  AddressBook,
  AddressBookGetArgs,
  AddressBookSetArgs,
  ContactCard,
  ContactCardGetArgs,
  ContactCardQueryArgs,
  ContactCardQueryChangesArgs,
  ContactCardSetArgs,
} from "./contacts.js";
import type {
  ChangesArgs,
  ChangesResponse,
  ChangesWithPropertiesResponse,
  GetArgs,
  GetResponse,
  Id,
  QueryChangesResponse,
  QueryResponse,
  SetResponse,
} from "./core.js";
import type {
  Email,
  EmailChangesArgs,
  EmailGetArgs,
  EmailImportArgs,
  EmailImportResponse,
  EmailQueryArgs,
  EmailQueryChangesArgs,
  EmailSetArgs,
  Mailbox,
  MailboxChangesArgs,
  MailboxChangesResponse,
  MailboxGetArgs,
  MailboxQueryArgs,
  MailboxQueryChangesArgs,
  MailboxSetArgs,
  SearchSnippetGetArgs,
  SearchSnippetGetResponse,
  Thread,
  ThreadGetArgs,
} from "./mail.js";
import type { PushSubscription, PushSubscriptionCreate } from "./push.js";
import type {
  Quota,
  QuotaGetArgs,
  QuotaQueryArgs,
  QuotaQueryChangesArgs,
  SieveScript,
  SieveScriptGetArgs,
  SieveScriptQueryArgs,
  SieveScriptSetArgs,
  SieveScriptValidateArgs,
  SieveScriptValidateResponse,
} from "./sieve.js";
import type {
  EmailSubmission,
  EmailSubmissionGetArgs,
  EmailSubmissionQueryArgs,
  EmailSubmissionQueryChangesArgs,
  EmailSubmissionSetArgs,
  Identity,
  IdentitySetArgs,
  VacationResponse,
  VacationResponseGetArgs,
  VacationResponseSetArgs,
} from "./submission.js";

interface M<A, R> {
  args: A;
  response: R;
}

/** PushSubscription/get and /set take no accountId (RFC 8620 §7.2). */
export interface PushSubscriptionGetArgs {
  ids?: Id[] | null;
  properties?: (keyof PushSubscription)[] | null;
}

export interface PushSubscriptionSetArgs {
  create?: Record<Id, PushSubscriptionCreate> | null;
  update?: Record<Id, Partial<Pick<PushSubscription, "verificationCode" | "expires" | "types">>> | null;
  destroy?: Id[] | null;
}

/** Stalwart echoes an accountId and omits `state` here. */
export interface PushSubscriptionGetResponse {
  accountId?: Id;
  list: PushSubscription[];
  notFound: Id[] | null;
}

export type PushSubscriptionSetResponse = Omit<SetResponse<PushSubscription>, "accountId" | "oldState" | "newState"> & {
  oldState?: string | null;
  newState?: string | null;
};

/** The method registry: name → arguments and response. */
export interface MethodMap {
  "Core/echo": M<Record<string, unknown>, Record<string, unknown>>;

  "Mailbox/get": M<MailboxGetArgs, GetResponse<Mailbox>>;
  "Mailbox/changes": M<MailboxChangesArgs, MailboxChangesResponse>;
  "Mailbox/query": M<MailboxQueryArgs, QueryResponse>;
  "Mailbox/queryChanges": M<MailboxQueryChangesArgs, QueryChangesResponse>;
  "Mailbox/set": M<MailboxSetArgs, SetResponse<Mailbox>>;

  "Thread/get": M<ThreadGetArgs, GetResponse<Thread>>;
  "Thread/changes": M<ChangesArgs, ChangesResponse>;

  "Email/get": M<EmailGetArgs, GetResponse<Email>>;
  "Email/changes": M<EmailChangesArgs, ChangesResponse>;
  "Email/query": M<EmailQueryArgs, QueryResponse>;
  "Email/queryChanges": M<EmailQueryChangesArgs, QueryChangesResponse>;
  "Email/set": M<EmailSetArgs, SetResponse<Email>>;
  "Email/import": M<EmailImportArgs, EmailImportResponse>;

  "SearchSnippet/get": M<SearchSnippetGetArgs, SearchSnippetGetResponse>;

  "Identity/get": M<GetArgs<Identity>, GetResponse<Identity>>;
  "Identity/changes": M<ChangesArgs, ChangesResponse>;
  "Identity/set": M<IdentitySetArgs, SetResponse<Identity>>;

  "EmailSubmission/get": M<EmailSubmissionGetArgs, GetResponse<EmailSubmission>>;
  "EmailSubmission/changes": M<ChangesArgs, ChangesResponse>;
  "EmailSubmission/query": M<EmailSubmissionQueryArgs, QueryResponse>;
  "EmailSubmission/queryChanges": M<EmailSubmissionQueryChangesArgs, QueryChangesResponse>;
  "EmailSubmission/set": M<EmailSubmissionSetArgs, SetResponse<EmailSubmission>>;

  "VacationResponse/get": M<VacationResponseGetArgs, GetResponse<VacationResponse>>;
  "VacationResponse/set": M<VacationResponseSetArgs, SetResponse<VacationResponse>>;

  "SieveScript/get": M<SieveScriptGetArgs, GetResponse<SieveScript>>;
  "SieveScript/query": M<SieveScriptQueryArgs, QueryResponse>;
  "SieveScript/set": M<SieveScriptSetArgs, SetResponse<SieveScript>>;
  "SieveScript/validate": M<SieveScriptValidateArgs, SieveScriptValidateResponse>;

  "Quota/get": M<QuotaGetArgs, GetResponse<Quota>>;
  "Quota/changes": M<ChangesArgs, ChangesWithPropertiesResponse>;
  "Quota/query": M<QuotaQueryArgs, QueryResponse>;
  "Quota/queryChanges": M<QuotaQueryChangesArgs, QueryChangesResponse>;

  "PushSubscription/get": M<PushSubscriptionGetArgs, PushSubscriptionGetResponse>;
  "PushSubscription/set": M<PushSubscriptionSetArgs, PushSubscriptionSetResponse>;

  "AddressBook/get": M<AddressBookGetArgs, GetResponse<AddressBook>>;
  "AddressBook/changes": M<ChangesArgs, ChangesResponse>;
  "AddressBook/set": M<AddressBookSetArgs, SetResponse<AddressBook>>;

  "ContactCard/get": M<ContactCardGetArgs, GetResponse<ContactCard>>;
  "ContactCard/changes": M<ChangesArgs, ChangesResponse>;
  "ContactCard/query": M<ContactCardQueryArgs, QueryResponse>;
  "ContactCard/queryChanges": M<ContactCardQueryChangesArgs, QueryChangesResponse>;
  "ContactCard/set": M<ContactCardSetArgs, SetResponse<ContactCard>>;
}

export type MethodName = keyof MethodMap;
export type MethodArgs<N extends MethodName> = MethodMap[N]["args"];
export type MethodResponse<N extends MethodName> = MethodMap[N]["response"];
