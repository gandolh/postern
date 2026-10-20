import { describe, expect, it } from "vitest";
import { EventStreamParser, type ServerSentEvent } from "../../src/index.js";

function parse(chunks: string[]): { events: ServerSentEvent[]; comments: string[]; retries: number[] } {
  const events: ServerSentEvent[] = [];
  const comments: string[] = [];
  const retries: number[] = [];
  const parser = new EventStreamParser({
    onEvent: (e) => events.push(e),
    onComment: (c) => comments.push(c),
    onRetry: (ms) => retries.push(ms),
  });
  for (const chunk of chunks) parser.push(chunk);
  parser.end();
  return { events, comments, retries };
}

/** Every way of cutting a string in two. */
function allSplits(text: string): string[][] {
  return Array.from({ length: text.length + 1 }, (_, i) => [text.slice(0, i), text.slice(i)]);
}

// Recorded from Stalwart 0.16.25 on 2026-10-20: one chunk per event.
const STATE = 'event: state\ndata: {"@type":"StateChange","changed":{"b":{"Email":"srila"}}}\n\n';
const PING = 'event: ping\ndata: {"interval": 30}\n\n';

describe("EventStreamParser", () => {
  it("parses Stalwart's state and ping events", () => {
    const { events } = parse([STATE, PING]);
    expect(events).toEqual([
      { type: "state", data: '{"@type":"StateChange","changed":{"b":{"Email":"srila"}}}', lastEventId: "" },
      { type: "ping", data: '{"interval": 30}', lastEventId: "" },
    ]);
  });

  it("gives the same events however the stream is chunked", () => {
    const text = STATE + ": keep-alive\n" + PING;
    const expected = parse([text]).events;
    for (const split of allSplits(text)) expect(parse(split).events).toEqual(expected);
    expect(parse([...text]).events).toEqual(expected);
  });

  it("joins multi-line data with newlines", () => {
    const { events } = parse(["data: one\ndata: two\ndata:\ndata:three\n\n"]);
    expect(events[0]?.data).toBe("one\ntwo\n\nthree");
    expect(events[0]?.type).toBe("message");
  });

  it("accepts CRLF, CR and LF line endings, mixed, and CRLF split across chunks", () => {
    const crlf = "event: state\r\ndata: a\r\n\r\n";
    const cr = "event: state\rdata: a\r\r";
    const mixed = "event: state\r\ndata: a\n\r";
    for (const text of [crlf, cr, mixed]) {
      for (const split of allSplits(text)) {
        expect(parse(split).events).toEqual([{ type: "state", data: "a", lastEventId: "" }]);
      }
    }
    // A CR at a chunk end and the LF at the next chunk's start are one line ending, not two.
    expect(parse(["data: a\r", "\ndata: b\r", "\n\r", "\n"]).events).toEqual([{ type: "message", data: "a\nb", lastEventId: "" }]);
  });

  it("reports comments and ignores them as events", () => {
    const { events, comments } = parse([": ping\n:\n\n", "data: x\n\n"]);
    expect(comments).toEqual(["ping", ""]);
    expect(events.map((e) => e.data)).toEqual(["x"]);
  });

  it("keeps the last id across events, and ignores ids with NUL", () => {
    const { events } = parse(["id: 7\ndata: a\n\n", "data: b\n\n", "id: x\0y\ndata: c\n\n", "id\ndata: d\n\n"]);
    expect(events.map((e) => e.lastEventId)).toEqual(["7", "7", "7", ""]);
  });

  it("reports numeric retry values only", () => {
    expect(parse(["retry: 2500\n", "retry: soon\n", "retry: 10x\n\n"]).retries).toEqual([2500]);
  });

  it("drops an event with no closing blank line at end of stream", () => {
    expect(parse(["data: complete\n\n", "data: partial\n"]).events.map((e) => e.data)).toEqual(["complete"]);
  });

  it("does not dispatch an event with no data lines", () => {
    expect(parse(["event: state\n\n", "event: ping\n\n"]).events).toEqual([]);
  });

  it("handles a field with no colon and unknown fields", () => {
    const { events } = parse(["data\nfoo: bar\n\n"]);
    expect(events).toEqual([{ type: "message", data: "", lastEventId: "" }]);
  });

  it("strips only one leading space from a value", () => {
    expect(parse(["data:  two spaces\n\n"]).events[0]?.data).toBe(" two spaces");
  });

  it("resets the event type after each dispatch", () => {
    const { events } = parse(["event: state\ndata: a\n\ndata: b\n\n"]);
    expect(events.map((e) => e.type)).toEqual(["state", "message"]);
  });
});
