// Identity, EmailSubmission and VacationResponse (RFC 8621 §6-8).

import { JmapProtocolError, JmapSetError } from "../errors.js";
import type { CallArgs } from "../request.js";
import type { ChangesResponse, GetResponse, QueryChangesResponse, QueryResponse, SetResponse } from "../types/core.js";
import type { EmailSubmission, Identity, VacationResponse } from "../types/submission.js";
import type { CallOptions, ChangesOptions, MethodCaller } from "./caller.js";

/** Identities: who the user can send as, with signatures. */
export class IdentityMethods {
  readonly #c: MethodCaller;
  constructor(caller: MethodCaller) {
    this.#c = caller;
  }

  /** `Identity/get`. All identities when `ids` is omitted. */
  get(args: CallArgs<"Identity/get"> = {}, options?: CallOptions): Promise<GetResponse<Identity>> {
    return this.#c.call("Identity/get", args, options);
  }

  /** `Identity/changes`. */
  changes(sinceState: string, options: ChangesOptions = {}): Promise<ChangesResponse> {
    return this.#c.call("Identity/changes", { sinceState, maxChanges: options.maxChanges }, options);
  }

  /** `Identity/set`. */
  set(args: CallArgs<"Identity/set">, options?: CallOptions): Promise<SetResponse<Identity>> {
    return this.#c.call("Identity/set", args, options);
  }
}

/** EmailSubmission: sending. */
export class EmailSubmissionMethods {
  readonly #c: MethodCaller;
  constructor(caller: MethodCaller) {
    this.#c = caller;
  }

  /** `EmailSubmission/get`. */
  get(args: CallArgs<"EmailSubmission/get"> = {}, options?: CallOptions): Promise<GetResponse<EmailSubmission>> {
    return this.#c.call("EmailSubmission/get", args, options);
  }

  /** `EmailSubmission/changes`. */
  changes(sinceState: string, options: ChangesOptions = {}): Promise<ChangesResponse> {
    return this.#c.call("EmailSubmission/changes", { sinceState, maxChanges: options.maxChanges }, options);
  }

  /** `EmailSubmission/query`. */
  query(args: CallArgs<"EmailSubmission/query"> = {}, options?: CallOptions): Promise<QueryResponse> {
    return this.#c.call("EmailSubmission/query", args, options);
  }

  /** `EmailSubmission/queryChanges`. */
  queryChanges(args: CallArgs<"EmailSubmission/queryChanges">, options?: CallOptions): Promise<QueryChangesResponse> {
    return this.#c.call("EmailSubmission/queryChanges", args, options);
  }

  /**
   * `EmailSubmission/set`. To send a draft and file it: create the submission
   * with `emailId`, and pass `onSuccessUpdateEmail: { "#sub": { "mailboxIds/<drafts>": null, "mailboxIds/<sent>": true, "keywords/$draft": null } }`.
   */
  set(args: CallArgs<"EmailSubmission/set">, options?: CallOptions): Promise<SetResponse<EmailSubmission>> {
    return this.#c.call("EmailSubmission/set", args, options);
  }
}

/** The vacation responder (a singleton). */
export class VacationResponseMethods {
  readonly #c: MethodCaller;
  constructor(caller: MethodCaller) {
    this.#c = caller;
  }

  /** The current vacation response. */
  async get(options?: CallOptions): Promise<VacationResponse> {
    const res = await this.#c.call("VacationResponse/get", { ids: ["singleton"] }, options);
    const value = res.list[0];
    if (!value) throw new JmapProtocolError("VacationResponse/get returned no singleton");
    return value;
  }

  /** Update the vacation response. @throws JmapSetError if the server rejects the patch. */
  async set(patch: Partial<Omit<VacationResponse, "id">>, options?: CallOptions): Promise<void> {
    const res = await this.#c.call("VacationResponse/set", { update: { singleton: patch } }, options);
    const error = res.notUpdated?.["singleton"];
    if (error) throw new JmapSetError("VacationResponse/set", "singleton", error);
  }
}
