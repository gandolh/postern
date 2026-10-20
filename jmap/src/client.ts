// JmapClient: the session, the request builder, the method wrappers, blobs
// and push, over one injected auth provider.

import { BlobMethods, fetchUploadTransport, type UploadTransport } from "./blob.js";
import { JmapError, JmapProtocolError, isAbortError } from "./errors.js";
import { assertOk, authorizedFetch, type AuthProvider, type FetchLike } from "./http.js";
import { Limiter } from "./limiter.js";
import type { CallOptions, MethodCaller } from "./methods/caller.js";
import { AddressBookMethods, ContactCardMethods } from "./methods/contacts.js";
import { EmailMethods, SearchSnippetMethods } from "./methods/email.js";
import { MailboxMethods, ThreadMethods } from "./methods/mailbox.js";
import { PushSubscriptionMethods } from "./methods/push-subscription.js";
import { QuotaMethods, SieveScriptMethods } from "./methods/sieve.js";
import { EmailSubmissionMethods, IdentityMethods, VacationResponseMethods } from "./methods/submission.js";
import { PushReader, type PushReaderOptions, type PushSource } from "./push/reader.js";
import { RequestBuilder, type CallArgs, type RequestExecutor } from "./request.js";
import { Session } from "./session.js";
import type { JmapRequestBody, JmapResponseBody, SessionObject } from "./types/core.js";
import type { MethodName, MethodResponse } from "./types/methods.js";
import type { TypeState } from "./types/push.js";
import { normalizeBase } from "./url.js";

export interface JmapClientOptions {
  /**
   * Where Stalwart is reached: `/webmail-api` in the browser (same origin,
   * through Vite's proxy or Caddy), `http://127.0.0.1:18080` in Node tests.
   * The session is `GET {baseUrl}/jmap/session`; its URLs are rebased here.
   */
  baseUrl: string;
  /** Supplies the Authorization header per request, and handles 401s. */
  auth: AuthProvider;
  /** Defaults to the global fetch. */
  fetch?: FetchLike;
  /** Defaults to a fetch-based transport (progress 0 → 100%). Pass an XHR one for real progress. */
  uploadTransport?: UploadTransport;
}

/**
 * A JMAP client for one signed-in user.
 *
 * ```ts
 * const client = new JmapClient({ baseUrl: "/webmail-api", auth });
 * await client.connect();
 * const labels = await client.mailbox.all();
 * ```
 */
export class JmapClient implements MethodCaller, RequestExecutor {
  readonly baseUrl: string;
  readonly auth: AuthProvider;
  readonly #fetch: FetchLike;
  #session: Session | undefined;
  #stale = false;
  #loading: Promise<Session> | undefined;
  readonly #requests = new Limiter(4);
  readonly #uploads = new Limiter(4);

  /** Mailboxes (labels). */
  readonly mailbox: MailboxMethods;
  /** Threads (conversations). */
  readonly thread: ThreadMethods;
  /** Emails (messages). */
  readonly email: EmailMethods;
  readonly searchSnippet: SearchSnippetMethods;
  readonly identity: IdentityMethods;
  readonly emailSubmission: EmailSubmissionMethods;
  readonly vacationResponse: VacationResponseMethods;
  readonly sieveScript: SieveScriptMethods;
  readonly quota: QuotaMethods;
  readonly pushSubscription: PushSubscriptionMethods;
  /** AddressBook methods (JMAP Contacts). */
  readonly addressBook: AddressBookMethods;
  /** ContactCard methods (JMAP Contacts); `../contacts/` builds on them. */
  readonly contactCard: ContactCardMethods;
  /** Upload, download, `cid:` URLs. */
  readonly blob: BlobMethods;

  constructor(options: JmapClientOptions) {
    this.baseUrl = normalizeBase(options.baseUrl);
    this.auth = options.auth;
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.mailbox = new MailboxMethods(this);
    this.thread = new ThreadMethods(this);
    this.email = new EmailMethods(this);
    this.searchSnippet = new SearchSnippetMethods(this);
    this.identity = new IdentityMethods(this);
    this.emailSubmission = new EmailSubmissionMethods(this);
    this.vacationResponse = new VacationResponseMethods(this);
    this.quota = new QuotaMethods(this);
    this.pushSubscription = new PushSubscriptionMethods(this);
    this.addressBook = new AddressBookMethods(this);
    this.contactCard = new ContactCardMethods(this);
    this.blob = new BlobMethods({
      ensureSession: (signal) => this.ensureSession(signal),
      currentSession: () => this.session,
      auth: this.auth,
      fetch: this.#fetch,
      transport: options.uploadTransport ?? fetchUploadTransport(this.#fetch),
      uploads: this.#uploads,
    });
    this.sieveScript = new SieveScriptMethods(this, (body, o) => this.blob.upload(body, o));
  }

  /** The loaded session. @throws JmapError before `connect()`. */
  get session(): Session {
    if (!this.#session) throw new JmapError("No session yet: await client.connect() first");
    return this.#session;
  }

  /** Whether a session has been loaded. */
  get hasSession(): boolean {
    return this.#session !== undefined;
  }

  /** The primary mail account id. @throws JmapError before `connect()`. */
  get accountId(): string {
    return this.session.accountId;
  }

  /**
   * Fetch the session (again). Concurrent calls share one request.
   * @throws JmapUnauthorizedError, JmapNoAccountError (signed out), JmapNetworkError, JmapHttpError
   */
  connect(options: CallOptions = {}): Promise<Session> {
    this.#loading ??= this.#loadSession(options.signal).finally(() => {
      this.#loading = undefined;
    });
    return this.#loading;
  }

  /** The session, fetched if there is none or the server reported a new session state. */
  async ensureSession(signal?: AbortSignal): Promise<Session> {
    if (this.#session && !this.#stale) return this.#session;
    return this.connect({ signal });
  }

  async #loadSession(signal?: AbortSignal): Promise<Session> {
    const res = await authorizedFetch(this.#fetch, this.auth, `${this.baseUrl}/jmap/session`, {
      headers: { accept: "application/json" },
      signal,
    });
    await assertOk(res);
    let raw: SessionObject;
    try {
      raw = (await res.json()) as SessionObject;
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new JmapProtocolError("Session response is not JSON", { cause: err });
    }
    const session = new Session(raw, this.baseUrl);
    this.#session = session;
    this.#stale = false;
    this.#requests.max = session.limits.maxConcurrentRequests;
    this.#uploads.max = session.limits.maxConcurrentUpload;
    return session;
  }

  /** Start a batch of calls. */
  request(): RequestBuilder {
    return new RequestBuilder(this);
  }

  /** One call in its own request. @throws JmapMethodError if the method fails. */
  async call<N extends MethodName>(name: N, args: CallArgs<N>, options: CallOptions = {}): Promise<MethodResponse<N>> {
    const r = this.request();
    const handle = r.call(name, args);
    const res = await r.send(options);
    return res.get(handle);
  }

  /** @internal The request builder's POST. Stays within maxConcurrentRequests. */
  async post(session: Session, body: JmapRequestBody, signal?: AbortSignal): Promise<JmapResponseBody> {
    return this.#requests.run(async () => {
      const res = await authorizedFetch(this.#fetch, this.auth, session.apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      await assertOk(res);
      let json: JmapResponseBody;
      try {
        json = (await res.json()) as JmapResponseBody;
      } catch (err) {
        if (isAbortError(err)) throw err;
        throw new JmapProtocolError("API response is not JSON", { cause: err });
      }
      if (typeof json.sessionState === "string" && this.#session && json.sessionState !== this.#session.state) {
        this.#stale = true;
      }
      return json;
    });
  }

  /** An authorized fetch against this server (Authorization added, 401 hook run). Non-2xx responses are returned as is. */
  fetch(url: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
    return authorizedFetch(this.#fetch, this.auth, url, init);
  }

  /** A push reader on this client's event source. Attach listeners, then `start()`. */
  push(options: PushReaderOptions = {}): PushReader {
    return new PushReader(this.#pushSource(), options);
  }

  #pushSource(): PushSource {
    return {
      open: async (params, signal) => {
        const session = await this.ensureSession(signal);
        return authorizedFetch(this.#fetch, this.auth, session.eventSourceUrlFor(params), {
          headers: { accept: "text/event-stream" },
          signal,
        });
      },
      poll: async (types, signal) => {
        const r = this.request();
        const handles = types.map((type) => r.callRaw(`${type}/get`, { ids: [] }));
        const res = await r.send({ signal });
        const states: TypeState = {};
        handles.forEach((handle, i) => {
          const type = types[i];
          if (!type || res.error(handle)) return;
          const state = res.get(handle)["state"];
          if (typeof state === "string") states[type] = state;
        });
        return { "@type": "StateChange", changed: { [this.session.accountId]: states } };
      },
    };
  }
}
