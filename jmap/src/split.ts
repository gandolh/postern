// Fitting a batch into the server's limits: split big /get and /set calls by
// maxObjectsInGet / maxObjectsInSet, then cut the call list into requests of at
// most maxCallsInRequest without separating a back-reference from its target.

import { JmapLimitError } from "./errors.js";
import type { CoreCapability } from "./types/core.js";

/** A call as it goes on the wire, with the ids of the calls it back-references. */
export interface WireCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  deps: readonly string[];
}

/** How a split call's parts map back to the caller's call. */
export interface SplitPart {
  kind: "get" | "set";
  partIds: string[];
}

export interface Expansion {
  calls: WireCall[];
  /** Original call id → its parts, for calls that were split. */
  splits: Map<string, SplitPart>;
}

const SET_KEYS = new Set(["accountId", "create", "update", "destroy"]);

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function setEntryCount(args: Record<string, unknown>): number {
  const create = args["create"] as Record<string, unknown> | null | undefined;
  const update = args["update"] as Record<string, unknown> | null | undefined;
  const destroy = args["destroy"] as unknown[] | null | undefined;
  return Object.keys(create ?? {}).length + Object.keys(update ?? {}).length + (Array.isArray(destroy) ? destroy.length : 0);
}

/**
 * Split `/get` calls with more literal ids than `maxObjectsInGet`, and `/set`
 * calls with more entries than `maxObjectsInSet`, into consecutive parts.
 * Refuses (JmapLimitError) when a later call back-references the oversized
 * call, or a /set carries `ifInState` or extra arguments, since splitting would
 * change what they mean.
 */
export function expandCalls(calls: readonly WireCall[], limits: Pick<CoreCapability, "maxObjectsInGet" | "maxObjectsInSet">): Expansion {
  const referenced = new Set(calls.flatMap((c) => c.deps));
  const out: WireCall[] = [];
  const splits = new Map<string, SplitPart>();

  for (const call of calls) {
    const ids = call.args["ids"];
    if (call.name.endsWith("/get") && Array.isArray(ids) && ids.length > limits.maxObjectsInGet) {
      if (referenced.has(call.id)) {
        throw new JmapLimitError(
          "maxObjectsInGet",
          `${call.name} asks for ${ids.length} ids (limit ${limits.maxObjectsInGet}) and a later call references it; split it yourself`,
        );
      }
      const parts = chunk(ids, limits.maxObjectsInGet).map((part, i) => ({
        id: `${call.id}.${i}`,
        name: call.name,
        args: { ...call.args, ids: part },
        deps: call.deps,
      }));
      splits.set(call.id, { kind: "get", partIds: parts.map((p) => p.id) });
      out.push(...parts);
      continue;
    }

    if (call.name.endsWith("/set") && setEntryCount(call.args) > limits.maxObjectsInSet) {
      const extra = Object.keys(call.args).filter((k) => !SET_KEYS.has(k));
      if (referenced.has(call.id) || extra.length > 0) {
        throw new JmapLimitError(
          "maxObjectsInSet",
          `${call.name} has ${setEntryCount(call.args)} entries (limit ${limits.maxObjectsInSet}) and cannot be split` +
            (extra.length ? ` because of ${extra.join(", ")}` : " because a later call references it"),
        );
      }
      // RFC 8620 §5.3 applies creates, then updates, then destroys; the parts keep that order.
      type Entry = ["create" | "update", string, unknown] | ["destroy", string];
      const entries: Entry[] = [
        ...Object.entries((call.args["create"] ?? {}) as Record<string, unknown>).map(([k, v]): Entry => ["create", k, v]),
        ...Object.entries((call.args["update"] ?? {}) as Record<string, unknown>).map(([k, v]): Entry => ["update", k, v]),
        ...((call.args["destroy"] ?? []) as string[]).map((id): Entry => ["destroy", id]),
      ];
      const parts = chunk(entries, limits.maxObjectsInSet).map((part, i) => {
        const args: Record<string, unknown> = { accountId: call.args["accountId"] };
        for (const entry of part) {
          if (entry[0] === "destroy") ((args["destroy"] ??= []) as string[]).push(entry[1]);
          else ((args[entry[0]] ??= {}) as Record<string, unknown>)[entry[1]] = entry[2];
        }
        return { id: `${call.id}.${i}`, name: call.name, args, deps: call.deps };
      });
      splits.set(call.id, { kind: "set", partIds: parts.map((p) => p.id) });
      out.push(...parts);
      continue;
    }

    out.push(call);
  }
  return { calls: out, splits };
}

/**
 * Cut the calls into consecutive requests of at most `maxCalls`, in order. A
 * cut is only made where no later call back-references an earlier one across
 * it. A run of linked calls longer than `maxCalls` is an error.
 */
export function partitionCalls(calls: readonly WireCall[], maxCalls: number): WireCall[][] {
  const index = new Map(calls.map((c, i) => [c.id, i]));
  const lastUse = calls.map((_, i) => i);
  calls.forEach((call, j) => {
    for (const dep of call.deps) {
      const i = index.get(dep);
      if (i !== undefined) lastUse[i] = Math.max(lastUse[i] ?? i, j);
    }
  });

  // Minimal segments: [start, p] where nothing before p is used after p.
  const segments: WireCall[][] = [];
  let start = 0;
  let furthest = -1;
  for (let p = 0; p < calls.length; p++) {
    furthest = Math.max(furthest, lastUse[p] ?? p);
    if (furthest === p) {
      segments.push(calls.slice(start, p + 1));
      start = p + 1;
    }
  }

  const requests: WireCall[][] = [];
  let current: WireCall[] = [];
  for (const segment of segments) {
    if (segment.length > maxCalls) {
      throw new JmapLimitError(
        "maxCallsInRequest",
        `${segment.length} calls are linked by back-references (${segment.map((c) => c.name).join(", ")}), more than the server's maxCallsInRequest of ${maxCalls}`,
      );
    }
    if (current.length + segment.length > maxCalls) {
      requests.push(current);
      current = [];
    }
    current.push(...segment);
  }
  if (current.length > 0) requests.push(current);
  return requests;
}

function mergeMaps(parts: Record<string, unknown>[], key: string): Record<string, unknown> | null {
  let out: Record<string, unknown> | null = null;
  for (const part of parts) {
    const value = part[key] as Record<string, unknown> | null | undefined;
    if (value) out = { ...(out ?? {}), ...value };
  }
  return out;
}

function concat(parts: Record<string, unknown>[], key: string): unknown[] | null {
  let out: unknown[] | null = null;
  for (const part of parts) {
    const value = part[key];
    if (Array.isArray(value)) out = [...(out ?? []), ...value];
  }
  return out;
}

/** Join the responses of a split /get: lists and notFound concatenated, the last state. */
export function mergeGetResponses(parts: Record<string, unknown>[]): Record<string, unknown> {
  const last = parts[parts.length - 1] ?? {};
  return { ...parts[0], list: concat(parts, "list") ?? [], notFound: concat(parts, "notFound") ?? [], state: last["state"] };
}

/** Join the responses of a split /set: maps merged, oldState from the first part, newState from the last. */
export function mergeSetResponses(parts: Record<string, unknown>[]): Record<string, unknown> {
  const first = parts[0] ?? {};
  const last = parts[parts.length - 1] ?? {};
  return {
    ...first,
    oldState: first["oldState"] ?? null,
    newState: last["newState"],
    created: mergeMaps(parts, "created"),
    updated: mergeMaps(parts, "updated"),
    destroyed: concat(parts, "destroyed"),
    notCreated: mergeMaps(parts, "notCreated"),
    notUpdated: mergeMaps(parts, "notUpdated"),
    notDestroyed: mergeMaps(parts, "notDestroyed"),
  };
}
