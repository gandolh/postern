// SieveScript (RFC 9661) and Quota (RFC 9425).

import type { CallArgs } from "../request.js";
import type {
  ChangesWithPropertiesResponse,
  GetResponse,
  Id,
  QueryChangesResponse,
  QueryResponse,
  SetError,
  SetResponse,
  UploadResponse,
} from "../types/core.js";
import type { Quota, SieveScript } from "../types/sieve.js";
import type { CallOptions, ChangesOptions, MethodCaller } from "./caller.js";

/** Uploads a blob; supplied by the client so `validateSource` can upload first. */
export type Uploader = (body: string, options: { type: string; signal?: AbortSignal }) => Promise<UploadResponse>;

/** Sieve scripts: Postern's filters. */
export class SieveScriptMethods {
  readonly #c: MethodCaller;
  readonly #upload: Uploader;
  constructor(caller: MethodCaller, upload: Uploader) {
    this.#c = caller;
    this.#upload = upload;
  }

  /** `SieveScript/get`. All scripts when `ids` is omitted. Fetch the source with the blob download. */
  get(args: CallArgs<"SieveScript/get"> = {}, options?: CallOptions): Promise<GetResponse<SieveScript>> {
    return this.#c.call("SieveScript/get", args, options);
  }

  /** `SieveScript/query`. */
  query(args: CallArgs<"SieveScript/query"> = {}, options?: CallOptions): Promise<QueryResponse> {
    return this.#c.call("SieveScript/query", args, options);
  }

  /** `SieveScript/set`. Upload the source first; activate with `onSuccessActivateScript`. */
  set(args: CallArgs<"SieveScript/set">, options?: CallOptions): Promise<SetResponse<SieveScript>> {
    return this.#c.call("SieveScript/set", args, options);
  }

  /**
   * `SieveScript/validate`: null if the uploaded script is valid, else the
   * error (Stalwart's type is `invalidScript`; RFC 9661 says `invalidSieve`).
   */
  async validate(blobId: Id, options?: CallOptions): Promise<SetError | null> {
    return (await this.#c.call("SieveScript/validate", { blobId }, options)).error;
  }

  /** Upload a script's source and validate it, without storing a script. */
  async validateSource(source: string, options: CallOptions = {}): Promise<SetError | null> {
    const { blobId } = await this.#upload(source, { type: "application/sieve", signal: options.signal });
    return this.validate(blobId, options);
  }
}

/** Quotas: the storage meter. Stalwart returns an empty list when no quota is set. */
export class QuotaMethods {
  readonly #c: MethodCaller;
  constructor(caller: MethodCaller) {
    this.#c = caller;
  }

  /** `Quota/get`. All quotas when `ids` is omitted. */
  get(args: CallArgs<"Quota/get"> = {}, options?: CallOptions): Promise<GetResponse<Quota>> {
    return this.#c.call("Quota/get", args, options);
  }

  /** `Quota/changes`; `updatedProperties` is `["used"]` when only usage moved. */
  changes(sinceState: string, options: ChangesOptions = {}): Promise<ChangesWithPropertiesResponse> {
    return this.#c.call("Quota/changes", { sinceState, maxChanges: options.maxChanges }, options);
  }

  /** `Quota/query`. */
  query(args: CallArgs<"Quota/query"> = {}, options?: CallOptions): Promise<QueryResponse> {
    return this.#c.call("Quota/query", args, options);
  }

  /** `Quota/queryChanges`. */
  queryChanges(args: CallArgs<"Quota/queryChanges">, options?: CallOptions): Promise<QueryChangesResponse> {
    return this.#c.call("Quota/queryChanges", args, options);
  }
}
