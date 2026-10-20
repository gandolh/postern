// RFC 9610 (JMAP for Contacts).
// A ContactCard is a JSContact Card (RFC 9553); only the commonly used parts
// are typed here, and the rest passes through as unknown.

import type { Comparator, GetArgs, Id, QueryArgs, QueryChangesArgs, SetArgs, UTCDate } from "./core.js";

export interface AddressBookRights {
  mayRead: boolean;
  mayWrite: boolean;
  mayShare: boolean;
  mayDelete: boolean;
}

export interface AddressBook {
  id: Id;
  name: string;
  description: string | null;
  sortOrder: number;
  isDefault: boolean;
  isSubscribed: boolean;
  shareWith: Record<Id, AddressBookRights> | null;
  myRights: AddressBookRights;
}

export type AddressBookCreate = Partial<Pick<AddressBook, "name" | "description" | "sortOrder" | "isSubscribed">>;
export type AddressBookGetArgs = GetArgs<AddressBook>;

export interface AddressBookSetArgs extends SetArgs<AddressBook, AddressBookCreate> {
  onDestroyRemoveContents?: boolean;
  onSuccessSetIsDefault?: Id | null;
}

/** RFC 9553 NameComponent. */
export interface NameComponent {
  kind: "title" | "given" | "given2" | "surname" | "surname2" | "credential" | "generation" | "separator" | (string & {});
  value: string;
}

export interface ContactName {
  components?: NameComponent[];
  full?: string;
  isOrdered?: boolean;
}

export interface ContactEmail {
  address: string;
  contexts?: Record<string, true>;
  pref?: number;
  label?: string;
}

export interface ContactPhone {
  number: string;
  features?: Record<string, true>;
  contexts?: Record<string, true>;
  pref?: number;
  label?: string;
}

export interface ContactMedia {
  kind: "photo" | "sound" | "logo" | (string & {});
  uri?: string;
  /** RFC 9610: servers send a blobId instead of a `data:` URI. */
  blobId?: Id;
  mediaType?: string;
}

/** A contact (or a group, when `kind` is `group`). JSContact Card plus JMAP's id and address books. */
export interface ContactCard {
  id: Id;
  addressBookIds: Record<Id, true>;
  "@type"?: "Card";
  version?: string;
  uid?: string;
  kind?: "individual" | "group" | "org" | "location" | "device" | "application" | (string & {});
  created?: UTCDate;
  updated?: UTCDate;
  name?: ContactName;
  nicknames?: Record<string, { name: string }>;
  organizations?: Record<string, { name?: string; units?: { name: string }[] }>;
  emails?: Record<string, ContactEmail>;
  phones?: Record<string, ContactPhone>;
  media?: Record<string, ContactMedia>;
  /** Group members: uid → true. */
  members?: Record<string, true>;
  notes?: Record<string, { note: string }>;
  [property: string]: unknown;
}

export interface ContactCardFilterCondition {
  inAddressBook?: Id;
  uid?: string;
  hasMember?: string;
  kind?: string;
  createdBefore?: UTCDate;
  createdAfter?: UTCDate;
  updatedBefore?: UTCDate;
  updatedAfter?: UTCDate;
  text?: string;
  name?: string;
  "name/given"?: string;
  "name/surname"?: string;
  "name/surname2"?: string;
  nickname?: string;
  organization?: string;
  email?: string;
  phone?: string;
  onlineService?: string;
  address?: string;
  note?: string;
}

export type ContactCardComparator = Comparator<"created" | "updated" | "name/given" | "name/surname" | "name/surname2">;
export type ContactCardGetArgs = GetArgs<ContactCard>;
export type ContactCardQueryArgs = QueryArgs<ContactCardFilterCondition, ContactCardComparator>;
export type ContactCardQueryChangesArgs = QueryChangesArgs<ContactCardFilterCondition, ContactCardComparator>;
export type ContactCardSetArgs = SetArgs<ContactCard, Omit<ContactCard, "id">>;
