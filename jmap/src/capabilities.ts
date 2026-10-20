// Capability URNs, and which capability each method needs in `using`.

/** The capability URNs this client uses. */
export const Capability = {
  Core: "urn:ietf:params:jmap:core",
  Mail: "urn:ietf:params:jmap:mail",
  Submission: "urn:ietf:params:jmap:submission",
  VacationResponse: "urn:ietf:params:jmap:vacationresponse",
  Sieve: "urn:ietf:params:jmap:sieve",
  Quota: "urn:ietf:params:jmap:quota",
  Contacts: "urn:ietf:params:jmap:contacts",
  Blob: "urn:ietf:params:jmap:blob",
  WebPushVapid: "urn:ietf:params:jmap:webpush-vapid",
  WebSocket: "urn:ietf:params:jmap:websocket",
} as const;

export type CapabilityUrn = (typeof Capability)[keyof typeof Capability];

const BY_TYPE: Record<string, string> = {
  Core: Capability.Core,
  PushSubscription: Capability.Core,
  Mailbox: Capability.Mail,
  Thread: Capability.Mail,
  Email: Capability.Mail,
  SearchSnippet: Capability.Mail,
  Identity: Capability.Submission,
  EmailSubmission: Capability.Submission,
  VacationResponse: Capability.VacationResponse,
  SieveScript: Capability.Sieve,
  Quota: Capability.Quota,
  AddressBook: Capability.Contacts,
  ContactCard: Capability.Contacts,
  Blob: Capability.Blob,
};

/**
 * The capability a method belongs to, from its type prefix (`Email/get` →
 * mail). Unknown types return undefined; pass their capability to the request
 * builder's `using()` yourself.
 */
export function capabilityOf(method: string): string | undefined {
  const type = method.slice(0, method.indexOf("/"));
  return BY_TYPE[type];
}

/** The type part of a method name: `Email/get` → `Email`. */
export function typeOf(method: string): string {
  const slash = method.indexOf("/");
  return slash < 0 ? method : method.slice(0, slash);
}

/** Types that carry no accountId (PushSubscription, Core/echo). */
export function takesAccountId(method: string): boolean {
  const type = typeOf(method);
  return type !== "PushSubscription" && type !== "Core";
}
