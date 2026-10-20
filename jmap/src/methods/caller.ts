// What a method wrapper needs from the client.

import type { CallArgs, RequestBuilder } from "../request.js";
import type { MethodName, MethodResponse } from "../types/methods.js";

/** Options every wrapper call takes. */
export interface CallOptions {
  signal?: AbortSignal;
}

/** One-call requests and the request builder. JmapClient implements it. */
export interface MethodCaller {
  /** Send one call; resolve with its response or throw its JmapMethodError. */
  call<N extends MethodName>(name: N, args: CallArgs<N>, options?: CallOptions): Promise<MethodResponse<N>>;
  /** Start a batch. */
  request(): RequestBuilder;
}

/** `/changes` options. */
export interface ChangesOptions extends CallOptions {
  maxChanges?: number;
}
