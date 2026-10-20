// A hand-written `text/event-stream` parser (WHATWG HTML §9.2.6), fed decoded
// text in chunks of any size. Lines end in CRLF, LF or CR; a chunk may split
// a line, a field, or a CRLF pair anywhere.

/** One dispatched server-sent event. */
export interface ServerSentEvent {
  /** The `event:` field, or `message` when there was none. */
  type: string;
  /** The `data:` lines joined with `\n`. */
  data: string;
  /** The last `id:` seen on the stream (it persists across events). */
  lastEventId: string;
}

export interface EventStreamHandlers {
  onEvent(event: ServerSentEvent): void;
  /** A `retry:` field: the server's reconnection delay in ms. */
  onRetry?(ms: number): void;
  /** A comment line (`: ...`), often a keep-alive. */
  onComment?(text: string): void;
}

export class EventStreamParser {
  readonly #handlers: EventStreamHandlers;
  #buffer = "";
  /** The previous chunk ended in CR; a leading LF in the next one belongs to it. */
  #pendingCR = false;
  #data: string[] = [];
  #hasData = false;
  #type = "";
  #lastEventId = "";

  constructor(handlers: EventStreamHandlers) {
    this.#handlers = handlers;
  }

  /** The last event id, for a reconnect's `Last-Event-ID`. */
  get lastEventId(): string {
    return this.#lastEventId;
  }

  /** Feed decoded text. */
  push(chunk: string): void {
    if (chunk.length === 0) return;
    let text = chunk;
    if (this.#pendingCR) {
      this.#pendingCR = false;
      if (text.startsWith("\n")) text = text.slice(1);
    }
    this.#buffer += text;

    let start = 0;
    for (let i = 0; i < this.#buffer.length; i++) {
      const c = this.#buffer.charCodeAt(i);
      if (c !== 10 && c !== 13) continue;
      const line = this.#buffer.slice(start, i);
      if (c === 13) {
        if (i + 1 === this.#buffer.length) {
          this.#pendingCR = true;
        } else if (this.#buffer.charCodeAt(i + 1) === 10) {
          i++;
        }
      }
      start = i + 1;
      this.#line(line);
    }
    this.#buffer = this.#buffer.slice(start);
  }

  /** The stream ended. An event without its closing blank line is dropped, as the spec says. */
  end(): void {
    this.#buffer = "";
    this.#pendingCR = false;
    this.#reset();
  }

  #line(line: string): void {
    if (line === "") {
      this.#dispatch();
      return;
    }
    if (line.startsWith(":")) {
      this.#handlers.onComment?.(line.slice(1).replace(/^ /, ""));
      return;
    }
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "event":
        this.#type = value;
        break;
      case "data":
        this.#data.push(value);
        this.#hasData = true;
        break;
      case "id":
        if (!value.includes("\0")) this.#lastEventId = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) this.#handlers.onRetry?.(Number(value));
        break;
      default:
        // Unknown fields are ignored.
        break;
    }
  }

  #dispatch(): void {
    if (this.#hasData) {
      this.#handlers.onEvent({ type: this.#type || "message", data: this.#data.join("\n"), lastEventId: this.#lastEventId });
    }
    this.#reset();
  }

  #reset(): void {
    this.#data = [];
    this.#hasData = false;
    this.#type = "";
  }
}
