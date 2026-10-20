// AddressBook and ContactCard (RFC 9610). Typed stubs, unused until brief 15.

import type { CallArgs } from "../request.js";
import type { ChangesResponse, GetResponse, QueryChangesResponse, QueryResponse, SetResponse } from "../types/core.js";
import type { AddressBook, ContactCard } from "../types/contacts.js";
import type { CallOptions, ChangesOptions, MethodCaller } from "./caller.js";

export class AddressBookMethods {
  readonly #c: MethodCaller;
  constructor(caller: MethodCaller) {
    this.#c = caller;
  }

  /** `AddressBook/get`. */
  get(args: CallArgs<"AddressBook/get"> = {}, options?: CallOptions): Promise<GetResponse<AddressBook>> {
    return this.#c.call("AddressBook/get", args, options);
  }

  /** `AddressBook/changes`. */
  changes(sinceState: string, options: ChangesOptions = {}): Promise<ChangesResponse> {
    return this.#c.call("AddressBook/changes", { sinceState, maxChanges: options.maxChanges }, options);
  }

  /** `AddressBook/set`. */
  set(args: CallArgs<"AddressBook/set">, options?: CallOptions): Promise<SetResponse<AddressBook>> {
    return this.#c.call("AddressBook/set", args, options);
  }
}

export class ContactCardMethods {
  readonly #c: MethodCaller;
  constructor(caller: MethodCaller) {
    this.#c = caller;
  }

  /** `ContactCard/get`. */
  get(args: CallArgs<"ContactCard/get"> = {}, options?: CallOptions): Promise<GetResponse<ContactCard>> {
    return this.#c.call("ContactCard/get", args, options);
  }

  /** `ContactCard/changes`. */
  changes(sinceState: string, options: ChangesOptions = {}): Promise<ChangesResponse> {
    return this.#c.call("ContactCard/changes", { sinceState, maxChanges: options.maxChanges }, options);
  }

  /** `ContactCard/query`. */
  query(args: CallArgs<"ContactCard/query"> = {}, options?: CallOptions): Promise<QueryResponse> {
    return this.#c.call("ContactCard/query", args, options);
  }

  /** `ContactCard/queryChanges`. */
  queryChanges(args: CallArgs<"ContactCard/queryChanges">, options?: CallOptions): Promise<QueryChangesResponse> {
    return this.#c.call("ContactCard/queryChanges", args, options);
  }

  /** `ContactCard/set`. */
  set(args: CallArgs<"ContactCard/set">, options?: CallOptions): Promise<SetResponse<ContactCard>> {
    return this.#c.call("ContactCard/set", args, options);
  }
}
