// The push reader: reads the event-source stream with fetch() (so it can send
// Authorization, which the browser's EventSource cannot), emits StateChange
// events, reconnects with backoff and jitter, and falls back to polling the
// type states when the stream keeps failing.
//
// Status: connecting → open → (stream ends or stalls) reconnecting → open ...
// After `fallbackAfter` failed attempts in a row: polling, retrying the stream
// every `streamRetryMs`. A 401 the auth provider cannot fix, or a 4xx, ends
// it: closed, with `lastError` set. `stop()` or the signal end it too.

import { JmapHttpError, JmapProtocolError, JmapUnauthorizedError, isAbortError } from "../errors.js";
import { httpError } from "../http.js";
import type { EventSourceParams } from "../session.js";
import type { StateChange, TypeState } from "../types/push.js";
import { backoffDelay, DEFAULT_BACKOFF, type BackoffOptions } from "./backoff.js";
import { EventStreamParser, type ServerSentEvent } from "./event-stream.js";

export type PushStatus = "connecting" | "open" | "reconnecting" | "polling" | "closed";

/** What the reader needs: the stream, and a way to read current states. The client supplies it. */
export interface PushSource {
  /** Open the event stream; resolve with the response whatever its status. */
  open(params: EventSourceParams, signal: AbortSignal): Promise<Response>;
  /** The current state of each type, as a StateChange (for polling). */
  poll(types: readonly string[], signal: AbortSignal): Promise<StateChange>;
}

export interface PushReaderOptions {
  /** Types to watch (default Email, Mailbox, Thread, EmailDelivery), or `*`. */
  types?: readonly string[] | "*";
  /** Requested ping interval in seconds (default 30; Stalwart never pings more often than every 30 s). */
  ping?: number;
  /** `stream` (default): the event stream, polling only as a fallback. `poll`: poll only. */
  mode?: "stream" | "poll";
  /** Failed stream attempts in a row before falling back to polling (default 4). */
  fallbackAfter?: number;
  /** Poll interval (default 30 s). */
  pollIntervalMs?: number;
  /** While polling as a fallback, try the stream again this often (default 5 min). */
  streamRetryMs?: number;
  /** Treat the stream as dead after this long without a byte. Default: twice the ping interval plus 10 s. */
  stallTimeoutMs?: number;
  /** After a reconnect, poll once so changes made while disconnected are not missed (default true). */
  resyncOnReconnect?: boolean;
  backoff?: Partial<BackoffOptions>;
  /** Aborting it stops the reader. */
  signal?: AbortSignal;
}

export const DEFAULT_PUSH_TYPES: readonly string[] = ["Email", "Mailbox", "Thread", "EmailDelivery"];

/** Types that have a `/get` whose `state` can be polled. EmailDelivery is push-only. */
const POLLABLE = new Set([
  "Email",
  "Mailbox",
  "Thread",
  "Identity",
  "EmailSubmission",
  "VacationResponse",
  "SieveScript",
  "Quota",
  "AddressBook",
  "ContactCard",
]);

/** Stalwart raises any ping below this to it (seen 2026-10-20: `event: ping` with `{"interval": 30}`). */
const SERVER_MIN_PING_S = 30;

type Listener<T> = (value: T) => void;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/** Errors that end the reader instead of being retried. */
function isFatal(err: unknown): boolean {
  if (err instanceof JmapUnauthorizedError) return true;
  if (err instanceof JmapHttpError) return err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
  return false;
}

/** Reads JMAP push over a fetch-streamed event source, with reconnects and a polling fallback. */
export class PushReader {
  readonly #source: PushSource;
  readonly #types: readonly string[] | "*";
  readonly #ping: number;
  readonly #mode: "stream" | "poll";
  readonly #fallbackAfter: number;
  readonly #pollIntervalMs: number;
  readonly #streamRetryMs: number;
  readonly #stallOverride: number | undefined;
  readonly #resync: boolean;
  readonly #backoff: BackoffOptions;
  readonly #controller = new AbortController();

  #status: PushStatus = "closed";
  #lastError: unknown;
  #started = false;
  #done: Promise<void> = Promise.resolve();
  #retryMs: number | undefined;
  #stallMs: number | undefined;
  /** accountId → type → the last state seen, from the stream or a poll. */
  #known = new Map<string, TypeState>();

  readonly #onState = new Set<Listener<StateChange>>();
  readonly #onStatus = new Set<Listener<PushStatus>>();
  readonly #onError = new Set<Listener<unknown>>();

  constructor(source: PushSource, options: PushReaderOptions = {}) {
    this.#source = source;
    this.#types = options.types ?? DEFAULT_PUSH_TYPES;
    this.#ping = Math.max(0, Math.floor(options.ping ?? SERVER_MIN_PING_S));
    this.#mode = options.mode ?? "stream";
    this.#fallbackAfter = Math.max(1, options.fallbackAfter ?? 4);
    this.#pollIntervalMs = options.pollIntervalMs ?? 30_000;
    this.#streamRetryMs = options.streamRetryMs ?? 300_000;
    this.#stallOverride = options.stallTimeoutMs;
    this.#resync = options.resyncOnReconnect ?? true;
    this.#backoff = { ...DEFAULT_BACKOFF, ...options.backoff };
    const external = options.signal;
    if (external) {
      if (external.aborted) this.#controller.abort();
      else external.addEventListener("abort", () => this.#controller.abort(), { once: true });
    }
  }

  /** connecting, open, reconnecting, polling or closed (also before `start()`). */
  get status(): PushStatus {
    return this.#status;
  }

  /** The error that closed the reader, or the last failed attempt's. */
  get lastError(): unknown {
    return this.#lastError;
  }

  /** Called for every StateChange: from the stream, or synthesised from a poll (only the types whose state moved). */
  onStateChange(listener: Listener<StateChange>): () => void {
    this.#onState.add(listener);
    return () => this.#onState.delete(listener);
  }

  /** Called on every status change. */
  onStatus(listener: Listener<PushStatus>): () => void {
    this.#onStatus.add(listener);
    return () => this.#onStatus.delete(listener);
  }

  /** Called for each failed attempt (retried) and for the error that closes the reader. */
  onError(listener: Listener<unknown>): () => void {
    this.#onError.add(listener);
    return () => this.#onError.delete(listener);
  }

  /** Start reading. A reader runs once; make a new one to start over. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    if (this.#controller.signal.aborted) return;
    this.#done = this.#run(this.#controller.signal);
  }

  /** Stop, and resolve once the reader is closed. */
  stop(): Promise<void> {
    this.#controller.abort();
    return this.#done;
  }

  // ---- the loop ------------------------------------------------------------

  async #run(signal: AbortSignal): Promise<void> {
    let failures = 0;
    let everOpened = false;
    try {
      while (!signal.aborted) {
        if (this.#mode === "poll" || failures >= this.#fallbackAfter) {
          await this.#pollPhase(signal, this.#mode === "poll" ? Infinity : this.#streamRetryMs);
          if (signal.aborted) break;
        }
        this.#setStatus(everOpened || failures > 0 ? "reconnecting" : "connecting");
        const opened = await this.#connect(signal, everOpened);
        if (signal.aborted) break;
        if (opened) {
          everOpened = true;
          failures = 0;
        }
        failures++;
        if (failures >= this.#fallbackAfter) continue;
        this.#setStatus("reconnecting");
        await sleep(backoffDelay(failures - 1, { ...this.#backoff, initialMs: this.#retryMs ?? this.#backoff.initialMs }), signal);
      }
    } catch (err) {
      if (!isAbortError(err)) {
        this.#lastError = err;
        this.#emit(this.#onError, err);
      }
    } finally {
      this.#setStatus("closed");
    }
  }

  /** One stream connection. Resolves true if it opened (and has since ended), false if it never did. Throws fatal errors. */
  async #connect(signal: AbortSignal, isReconnect: boolean): Promise<boolean> {
    const conn = new AbortController();
    const abort = (): void => conn.abort();
    signal.addEventListener("abort", abort, { once: true });
    let opened = false;
    try {
      const res = await this.#source.open({ types: this.#types, closeafter: "no", ping: this.#ping }, conn.signal);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw httpError(res.status, res.statusText, text, res.headers.get("content-type"));
      }
      const type = res.headers.get("content-type") ?? "";
      if (!/^text\/event-stream/i.test(type) || !res.body) {
        await res.body?.cancel().catch(() => undefined);
        throw new JmapProtocolError(`Event source answered ${type || "no content type"}, not text/event-stream`);
      }
      opened = true;
      this.#setStatus("open");
      if (isReconnect && this.#resync) void this.#pollOnce(conn.signal);
      await this.#read(res.body, conn);
      return true;
    } catch (err) {
      if (signal.aborted) return opened;
      if (isFatal(err)) throw err;
      if (!isAbortError(err)) {
        this.#lastError = err;
        this.#emit(this.#onError, err);
      }
      return opened;
    } finally {
      signal.removeEventListener("abort", abort);
      conn.abort();
    }
  }

  async #read(body: ReadableStream<Uint8Array>, conn: AbortController): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = new EventStreamParser({
      onEvent: (event) => this.#handle(event),
      onRetry: (ms) => {
        this.#retryMs = ms;
      },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kick = (): void => {
      clearTimeout(timer);
      const ms = this.#stallTimeout();
      if (ms !== undefined) timer = setTimeout(() => conn.abort(), ms);
    };
    kick();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
        kick();
      }
      parser.push(decoder.decode());
      parser.end();
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
  }

  #stallTimeout(): number | undefined {
    if (this.#stallOverride !== undefined) return this.#stallOverride;
    if (this.#stallMs !== undefined) return this.#stallMs;
    if (this.#ping === 0) return undefined;
    return Math.max(this.#ping, SERVER_MIN_PING_S) * 2_000 + 10_000;
  }

  #handle(event: ServerSentEvent): void {
    let data: unknown;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (event.type === "ping") {
      const interval = (data as { interval?: unknown })?.interval;
      if (typeof interval === "number" && interval > 0) this.#stallMs = interval * 2_000 + 10_000;
      return;
    }
    const change = data as Partial<StateChange> | null;
    if (change?.["@type"] !== "StateChange" || typeof change.changed !== "object" || change.changed === null) return;
    for (const [accountId, states] of Object.entries(change.changed)) {
      this.#known.set(accountId, { ...this.#known.get(accountId), ...states });
    }
    this.#emit(this.#onState, change as StateChange);
  }

  // ---- polling -------------------------------------------------------------

  #pollTypes(): string[] {
    if (this.#types === "*") return ["Email", "Mailbox", "Thread"];
    return this.#types.filter((t) => POLLABLE.has(t));
  }

  /** Poll until `untilMs` has passed (then return so the stream is retried), or forever. */
  async #pollPhase(signal: AbortSignal, untilMs: number): Promise<void> {
    this.#setStatus("polling");
    let elapsed = 0;
    for (;;) {
      await this.#pollOnce(signal, true);
      if (signal.aborted || elapsed >= untilMs) return;
      await sleep(this.#pollIntervalMs, signal);
      elapsed += this.#pollIntervalMs;
      if (signal.aborted || elapsed >= untilMs) return;
    }
  }

  /** Poll the states once and emit what moved. Fatal errors are rethrown only when `rethrowFatal`. */
  async #pollOnce(signal: AbortSignal, rethrowFatal = false): Promise<void> {
    const types = this.#pollTypes();
    if (types.length === 0) return;
    try {
      const polled = await this.#source.poll(types, signal);
      const changed: Record<string, TypeState> = {};
      for (const [accountId, states] of Object.entries(polled.changed)) {
        const known = this.#known.get(accountId) ?? {};
        const moved: TypeState = {};
        for (const [type, state] of Object.entries(states)) if (known[type] !== state) moved[type] = state;
        if (Object.keys(moved).length > 0) {
          changed[accountId] = moved;
          this.#known.set(accountId, { ...known, ...moved });
        }
      }
      if (Object.keys(changed).length > 0 && !signal.aborted) this.#emit(this.#onState, { "@type": "StateChange", changed });
    } catch (err) {
      if (signal.aborted || isAbortError(err)) return;
      if (rethrowFatal && isFatal(err)) throw err;
      this.#lastError = err;
      this.#emit(this.#onError, err);
    }
  }

  // ---- plumbing ------------------------------------------------------------

  #setStatus(status: PushStatus): void {
    if (status === this.#status) return;
    this.#status = status;
    this.#emit(this.#onStatus, status);
  }

  #emit<T>(listeners: Set<Listener<T>>, value: T): void {
    for (const listener of [...listeners]) {
      try {
        listener(value);
      } catch {
        // A listener's failure must not break the reader.
      }
    }
  }
}
