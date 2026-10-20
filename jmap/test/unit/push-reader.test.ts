import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JmapUnauthorizedError,
  PushReader,
  type EventSourceParams,
  type PushReaderOptions,
  type PushSource,
  type PushStatus,
  type StateChange,
} from "../../src/index.js";

// Recorded from Stalwart 0.16.25 on 2026-10-20.
const STATE = 'event: state\ndata: {"@type":"StateChange","changed":{"b":{"Email":"srila"}}}\n\n';
const PING = 'event: ping\ndata: {"interval": 30}\n\n';

class FakeStream {
  controller!: ReadableStreamDefaultController<Uint8Array>;
  readonly stream: ReadableStream<Uint8Array>;
  readonly signal: AbortSignal;

  constructor(signal: AbortSignal) {
    this.signal = signal;
    this.stream = new ReadableStream<Uint8Array>({ start: (c) => void (this.controller = c) });
    signal.addEventListener("abort", () => {
      try {
        this.controller.error(new DOMException("aborted", "AbortError"));
      } catch {
        // Already closed.
      }
    });
  }

  send(text: string): void {
    this.controller.enqueue(new TextEncoder().encode(text));
  }

  close(): void {
    this.controller.close();
  }
}

type Step = "stream" | number | Error;

class FakeSource implements PushSource {
  readonly script: Step[] = [];
  readonly streams: FakeStream[] = [];
  readonly opens: EventSourceParams[] = [];
  readonly polls: (StateChange | Error)[] = [];
  pollCount = 0;
  lastPoll: StateChange = { "@type": "StateChange", changed: { b: { Email: "e0", Mailbox: "m0", Thread: "t0" } } };

  async open(params: EventSourceParams, signal: AbortSignal): Promise<Response> {
    this.opens.push(params);
    const step = this.script.shift() ?? "stream";
    if (step instanceof Error) throw step;
    if (typeof step === "number") return new Response("{}", { status: step, headers: { "content-type": "application/problem+json" } });
    const s = new FakeStream(signal);
    this.streams.push(s);
    return new Response(s.stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  }

  async poll(_types: readonly string[], _signal: AbortSignal): Promise<StateChange> {
    this.pollCount++;
    const next = this.polls.shift();
    if (next instanceof Error) throw next;
    if (next) this.lastPoll = next;
    return this.lastPoll;
  }

  get current(): FakeStream {
    const s = this.streams[this.streams.length - 1];
    if (!s) throw new Error("no stream open");
    return s;
  }
}

function change(states: Record<string, string>): StateChange {
  return { "@type": "StateChange", changed: { b: states } };
}

const tick = (ms = 0): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

function startReader(source: FakeSource, options: PushReaderOptions = {}) {
  const reader = new PushReader(source, { backoff: { random: () => 0 }, ...options });
  const statuses: PushStatus[] = [];
  const changes: StateChange[] = [];
  const errors: unknown[] = [];
  reader.onStatus((s) => statuses.push(s));
  reader.onStateChange((c) => changes.push(c));
  reader.onError((e) => errors.push(e));
  reader.start();
  return { reader, statuses, changes, errors };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PushReader on the stream", () => {
  it("opens with closeafter=no and the requested types, and emits StateChange events", async () => {
    const source = new FakeSource();
    const { reader, statuses, changes } = startReader(source);
    await tick();
    expect(statuses).toEqual(["connecting", "open"]);
    expect(source.opens[0]).toEqual({ types: ["Email", "Mailbox", "Thread", "EmailDelivery"], closeafter: "no", ping: 30 });

    source.current.send(STATE.slice(0, 20));
    source.current.send(STATE.slice(20) + PING);
    await tick();
    expect(changes).toEqual([change({ Email: "srila" })]);
    await reader.stop();
    expect(reader.status).toBe("closed");
  });

  it("reconnects with exponential backoff after the stream ends or fails", async () => {
    const source = new FakeSource();
    source.script.push("stream", 503, 503, "stream");
    const { statuses } = startReader(source, { fallbackAfter: 10 });
    await tick();
    source.current.close();
    await tick();
    expect(statuses.at(-1)).toBe("reconnecting");

    // Delays with no jitter: 1 s, 2 s, 4 s.
    await tick(999);
    expect(source.opens).toHaveLength(1);
    await tick(1);
    expect(source.opens).toHaveLength(2); // 503
    await tick(1999);
    expect(source.opens).toHaveLength(2);
    await tick(1);
    expect(source.opens).toHaveLength(3); // 503
    await tick(3999);
    expect(source.opens).toHaveLength(3);
    await tick(1);
    expect(source.opens).toHaveLength(4);
    expect(statuses.at(-1)).toBe("open");
  });

  it("applies jitter within [base × (1 − jitter), base]", async () => {
    const source = new FakeSource();
    source.script.push(503);
    startReader(source, { backoff: { random: () => 1, jitter: 0.5 } });
    await tick();
    await tick(499);
    expect(source.opens).toHaveLength(1);
    await tick(1);
    expect(source.opens).toHaveLength(2);
  });

  it("uses the server's retry: as the first delay", async () => {
    const source = new FakeSource();
    startReader(source);
    await tick();
    source.current.send("retry: 5000\n\n");
    source.current.close();
    await tick(4999);
    expect(source.opens).toHaveLength(1);
    await tick(1);
    expect(source.opens).toHaveLength(2);
  });

  it("polls once after a reconnect so changes made while disconnected are not lost", async () => {
    const source = new FakeSource();
    const { changes } = startReader(source);
    await tick();
    source.current.send(STATE);
    await tick();
    source.current.close();
    source.polls.push(change({ Email: "srila", Mailbox: "m9", Thread: "t0" }));
    await tick(1000);
    expect(source.pollCount).toBe(1);
    // Email was already known from the stream; only what moved is emitted.
    expect(changes.at(-1)).toEqual(change({ Mailbox: "m9", Thread: "t0" }));
  });

  it("treats a silent stream as dead after twice the ping interval plus 10 s", async () => {
    const source = new FakeSource();
    const { statuses } = startReader(source);
    await tick();
    await tick(69_999);
    expect(statuses.at(-1)).toBe("open");
    await tick(1);
    expect(source.streams[0]?.signal.aborted).toBe(true);
    expect(statuses.at(-1)).toBe("reconnecting");
  });

  it("stretches the stall timeout to the interval the server announces in its ping", async () => {
    const source = new FakeSource();
    const { statuses } = startReader(source, { ping: 10 });
    await tick();
    source.current.send('event: ping\ndata: {"interval": 60}\n\n');
    await tick(129_999);
    expect(statuses.at(-1)).toBe("open");
    expect(source.opens).toHaveLength(1);
    await tick(1);
    expect(statuses.at(-1)).toBe("reconnecting");
  });
});

describe("PushReader polling fallback", () => {
  it("falls back to polling after repeated failures and emits only the types that moved", async () => {
    const source = new FakeSource();
    source.script.push(503, 503, 503);
    source.polls.push(change({ Email: "e1", Mailbox: "m1", Thread: "t1" }), change({ Email: "e2", Mailbox: "m1", Thread: "t1" }));
    const { statuses, changes } = startReader(source, { fallbackAfter: 3, pollIntervalMs: 30_000 });
    await tick();
    await tick(1000);
    await tick(2000);
    expect(source.opens).toHaveLength(3);
    expect(statuses.at(-1)).toBe("polling");
    expect(changes).toEqual([change({ Email: "e1", Mailbox: "m1", Thread: "t1" })]);

    await tick(30_000);
    expect(changes.at(-1)).toEqual(change({ Email: "e2" }));
    await tick(30_000);
    expect(changes).toHaveLength(2);
    expect(source.pollCount).toBe(3);
  });

  it("retries the stream every streamRetryMs while polling, and returns to open", async () => {
    const source = new FakeSource();
    source.script.push(503, 503, "stream");
    const { statuses } = startReader(source, { fallbackAfter: 2, pollIntervalMs: 1000, streamRetryMs: 3000 });
    await tick();
    await tick(1000);
    expect(statuses.at(-1)).toBe("polling");
    await tick(2999);
    expect(source.opens).toHaveLength(2);
    await tick(1);
    expect(source.opens).toHaveLength(3);
    expect(statuses.at(-1)).toBe("open");
  });

  it("goes straight back to polling when the retried stream fails", async () => {
    const source = new FakeSource();
    source.script.push(503, 503, 503);
    const { statuses } = startReader(source, { fallbackAfter: 2, pollIntervalMs: 1000, streamRetryMs: 1000 });
    await tick();
    await tick(1000);
    await tick(1000);
    expect(source.opens).toHaveLength(3);
    expect(statuses.at(-1)).toBe("polling");
  });

  it("polls only, in poll mode, skipping push-only types", async () => {
    const source = new FakeSource();
    const pollSpy = vi.spyOn(source, "poll");
    const { statuses } = startReader(source, { mode: "poll", pollIntervalMs: 1000 });
    await tick();
    await tick(5000);
    expect(source.opens).toHaveLength(0);
    expect(statuses).toEqual(["polling"]);
    expect(pollSpy).toHaveBeenCalledTimes(6);
    expect(pollSpy.mock.calls[0]?.[0]).toEqual(["Email", "Mailbox", "Thread"]);
  });

  it("keeps polling through a failed poll", async () => {
    const source = new FakeSource();
    source.polls.push(new Error("offline"));
    const { errors, changes } = startReader(source, { mode: "poll", pollIntervalMs: 1000 });
    await tick();
    expect(errors).toHaveLength(1);
    await tick(1000);
    expect(changes).toHaveLength(1);
  });
});

describe("PushReader ending", () => {
  it("closes on a 401 the auth provider could not fix", async () => {
    const source = new FakeSource();
    source.script.push(new JmapUnauthorizedError());
    const { reader, statuses, errors } = startReader(source);
    await tick();
    await tick(60_000);
    expect(statuses).toEqual(["connecting", "closed"]);
    expect(reader.lastError).toBeInstanceOf(JmapUnauthorizedError);
    expect(errors).toHaveLength(1);
    expect(source.opens).toHaveLength(1);
  });

  it("closes on a 400 (Stalwart's answer to an unknown type), retries a 5xx", async () => {
    const bad = new FakeSource();
    bad.script.push(400);
    const a = startReader(bad);
    await tick();
    expect(a.reader.status).toBe("closed");

    const flaky = new FakeSource();
    flaky.script.push(503);
    const b = startReader(flaky);
    await tick();
    expect(b.reader.status).toBe("reconnecting");
    await b.reader.stop();
  });

  it("stops when its AbortSignal aborts, closing the connection", async () => {
    const source = new FakeSource();
    const controller = new AbortController();
    const { reader, statuses } = startReader(source, { signal: controller.signal });
    await tick();
    controller.abort();
    await tick();
    expect(statuses).toEqual(["connecting", "open", "closed"]);
    expect(source.current.signal.aborted).toBe(true);
    expect(reader.status).toBe("closed");
  });

  it("does not start with an aborted signal", async () => {
    const source = new FakeSource();
    const controller = new AbortController();
    controller.abort();
    startReader(source, { signal: controller.signal });
    await tick(10_000);
    expect(source.opens).toHaveLength(0);
  });

  it("stops while waiting to reconnect", async () => {
    const source = new FakeSource();
    source.script.push(503);
    const { reader } = startReader(source);
    await tick();
    const stopped = reader.stop();
    await tick();
    await stopped;
    expect(reader.status).toBe("closed");
    await tick(60_000);
    expect(source.opens).toHaveLength(1);
  });
});
