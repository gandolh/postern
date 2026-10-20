// A scripted fetch for unit tests: each call is matched to the next handler
// for its method and path, and every request is recorded.

import { readFileSync } from "node:fs";
import { JmapClient, type AuthProvider, type FetchLike, type JmapClientOptions, type SessionObject } from "../../src/index.js";

export const FIXTURES = new URL("../fixtures/", import.meta.url);

export function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8")) as T;
}

/** The session Stalwart 0.16.25 returned for alice (VAPID key replaced). */
export const SESSION = fixture<SessionObject>("session.alice.json");

export interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  /** The parsed JSON body, for API posts. */
  json: unknown;
}

type Handler = (req: Recorded) => Response | Promise<Response>;

export function json(value: unknown, status = 200, contentType = "application/json; charset=utf-8"): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": contentType } });
}

export function problem(status: number, body: Record<string, unknown>): Response {
  return json(body, status, "application/problem+json");
}

/** A fetch that answers from a queue of handlers per "METHOD path" (path = URL pathname). */
export class FakeServer {
  readonly requests: Recorded[] = [];
  readonly #routes = new Map<string, Handler[]>();
  readonly #fallback = new Map<string, Handler>();

  /** Answer the next request to this route once. */
  once(route: string, handler: Handler): this {
    const list = this.#routes.get(route) ?? [];
    list.push(handler);
    this.#routes.set(route, list);
    return this;
  }

  /** Answer every request to this route (after queued ones). */
  always(route: string, handler: Handler): this {
    this.#fallback.set(route, handler);
    return this;
  }

  readonly fetch: FetchLike = async (input, init = {}) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const body = typeof init.body === "string" ? init.body : init.body === undefined ? undefined : "<binary>";
    let parsed: unknown;
    try {
      parsed = body && body !== "<binary>" ? JSON.parse(body) : undefined;
    } catch {
      parsed = undefined;
    }
    const req: Recorded = { url, method: init.method ?? "GET", headers, body, json: parsed };
    this.requests.push(req);
    if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const path = url.replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/\?.*$/, "");
    const route = `${req.method} ${path}`;
    const queued = this.#routes.get(route);
    const handler = queued?.shift() ?? this.#fallback.get(route);
    if (!handler) throw new Error(`FakeServer: no handler for ${route}`);
    return handler(req);
  };

  /** Requests to the API endpoint, parsed. */
  posts(): { using: string[]; methodCalls: [string, Record<string, unknown>, string][]; createdIds?: Record<string, string> }[] {
    return this.requests.filter((r) => r.method === "POST" && r.url.endsWith("/jmap/")).map((r) => r.json as never);
  }
}

export const BASE = "http://127.0.0.1:18080";

export const basicAuth = (value = "Basic dGVzdDp0ZXN0"): AuthProvider => ({ authorization: () => value });

/** A FakeServer that serves the recorded session, and a client on it. */
export function setup(options: Partial<JmapClientOptions> & { session?: SessionObject } = {}): { server: FakeServer; client: JmapClient } {
  const server = new FakeServer();
  server.always("GET /jmap/session", () => json(options.session ?? SESSION));
  const client = new JmapClient({ baseUrl: BASE, auth: basicAuth(), fetch: server.fetch, ...options });
  return { server, client };
}

/** Answer API posts by echoing a response per call, built by `answer`. */
export function apiAnswers(
  server: FakeServer,
  answer: (name: string, args: Record<string, unknown>, id: string) => [string, Record<string, unknown>] | [string, Record<string, unknown>][],
  sessionState = SESSION.state,
): void {
  server.always("POST /jmap/", (req) => {
    const body = req.json as { methodCalls: [string, Record<string, unknown>, string][]; createdIds?: Record<string, string> };
    const methodResponses: [string, Record<string, unknown>, string][] = [];
    for (const [name, args, id] of body.methodCalls) {
      const out = answer(name, args, id);
      const list = Array.isArray(out[0]) ? (out as [string, Record<string, unknown>][]) : [out as [string, Record<string, unknown>]];
      for (const [n, a] of list) methodResponses.push([n, a, id]);
    }
    const res: Record<string, unknown> = { methodResponses, sessionState };
    if (body.createdIds) res["createdIds"] = body.createdIds;
    return json(res);
  });
}
