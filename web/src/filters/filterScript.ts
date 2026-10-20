// Postern's one Sieve script, and the rules for living with other scripts.
//
// JMAP for Sieve (RFC 9661) lets one script be active per account. Postern
// writes one script, named "postern", marked as generated on its first line.
//
//   - A script named "postern" without the marker is someone else's: Postern
//     refuses to touch it.
//   - Another active script Postern did not write keeps running: Postern's
//     script includes it (`include :personal :optional "<name>"`, after its own
//     filters) and takes over as the active one. Nothing is deactivated that
//     stops running.
//   - Stalwart keeps the vacation responder in a script named "vacation", and
//     the responder is on exactly when that script is active
//     (crates/jmap/src/vacation/set.rs and get.rs). Including it would keep
//     sending replies after the responder is switched off, and activating
//     Postern's script would switch it off. So while it is active, Postern
//     saves its script without activating it and says filters are off; the
//     person can choose to turn filters on (which turns the responder off).
//
// Every save starts from the script on the server at that moment, so a
// change made on another device in the meantime is kept.

import {
  filterProblems,
  FilterScriptParseError,
  generateSieve,
  isGenerated,
  isIncludableName,
  normalizeFilterSet,
  parseFilterScript,
  POSTERN_SCRIPT_NAME,
  emptyFilterSet,
  VACATION_SCRIPT_NAME,
  type FilterSet,
  type Id,
} from "@postern/jmap";
import type { SieveIo } from "./scriptIo";

export type FilterScriptProblem =
  /** A script named "postern" that Postern did not write. */
  | { kind: "foreign-name" }
  /** Postern's script, changed by hand so Postern can't read it. */
  | { kind: "unreadable"; message: string };

export interface ActiveScript {
  id: Id;
  name: string;
  /** Stalwart's vacation responder. */
  vacation: boolean;
}

export interface LoadedFilters {
  /** The filters, blocked senders and includes (empty when there is no script or it can't be read). */
  set: FilterSet;
  /** Postern's script, if there is one. */
  scriptId: Id | null;
  /** Postern's script is the active one: the filters run. */
  active: boolean;
  /** The active script when it is not Postern's. */
  otherActive: ActiveScript | null;
  problem: FilterScriptProblem | null;
}

/** Saving was refused before anything was written, for a reason the person can read. */
export class FilterScriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilterScriptError";
  }
}

export const FOREIGN_NAME_MESSAGE = `Your account has a filter script named "${POSTERN_SCRIPT_NAME}" that Postern didn't write. Postern won't overwrite it. Rename or delete it in the app that made it, then try again.`;
export const UNREADABLE_MESSAGE = "Postern's filter script was changed outside Postern, so Postern can't read it.";

/** Read the account's scripts and Postern's filters. */
export async function loadFilters(io: SieveIo, signal?: AbortSignal): Promise<LoadedFilters> {
  const scripts = await io.list(signal);
  const ours = scripts.find((s) => s.name === POSTERN_SCRIPT_NAME) ?? null;
  const activeScript = scripts.find((s) => s.isActive) ?? null;
  const otherActive =
    activeScript && activeScript.id !== ours?.id
      ? { id: activeScript.id, name: activeScript.name ?? "", vacation: (activeScript.name ?? "").toLowerCase() === VACATION_SCRIPT_NAME }
      : null;
  const base = { scriptId: ours?.id ?? null, active: ours !== null && ours.isActive, otherActive };
  if (!ours) return { ...base, set: emptyFilterSet(), problem: null };
  const source = await io.read(ours, signal);
  if (!isGenerated(source)) return { ...base, set: emptyFilterSet(), problem: { kind: "foreign-name" } };
  try {
    return { ...base, set: parseFilterScript(source), problem: null };
  } catch (e) {
    if (e instanceof FilterScriptParseError) return { ...base, set: emptyFilterSet(), problem: { kind: "unreadable", message: e.message } };
    throw e;
  }
}

export interface SaveOptions {
  /** Replace an unreadable Postern script (the change then starts from an empty set). */
  replaceUnreadable?: boolean;
  signal?: AbortSignal;
}

export interface SaveOutcome {
  loaded: LoadedFilters;
  /** The script was saved but not activated: the vacation responder holds the one active slot. */
  heldByVacation: boolean;
  /** A script the person wrote that Postern now runs from its own. */
  newlyIncluded: string | null;
}

/**
 * Apply `change` to the filters on the server now, check, validate with the
 * server, save and (unless the vacation responder is on) activate.
 * @throws FilterScriptError for a reason to show (nothing was written).
 */
export async function saveFilters(io: SieveIo, change: (set: FilterSet) => FilterSet, options: SaveOptions = {}): Promise<SaveOutcome> {
  const { signal } = options;
  const loaded = await loadFilters(io, signal);
  if (loaded.problem?.kind === "foreign-name") throw new FilterScriptError(FOREIGN_NAME_MESSAGE);
  if (loaded.problem?.kind === "unreadable" && !options.replaceUnreadable) throw new FilterScriptError(UNREADABLE_MESSAGE);

  const next = normalizeFilterSet(change(loaded.set));
  next.filters.forEach((f, i) => {
    const problems = filterProblems(f);
    if (problems.length > 0) throw new FilterScriptError(`Filter ${i + 1}: ${problems.join(" ")}`);
  });

  // Another script was running: keep it running, from Postern's.
  let newlyIncluded: string | null = null;
  const other = loaded.otherActive;
  if (other && !other.vacation && isIncludableName(other.name) && !next.includes.includes(other.name)) {
    next.includes.push(other.name);
    newlyIncluded = other.name;
  }
  const heldByVacation = other?.vacation === true;

  const source = generateSieve(next);
  const invalid = await io.validate(source, signal);
  if (invalid) throw new FilterScriptError(`The server refused the filters: ${invalid.description ?? invalid.type}`);
  const id = await io.save({ id: loaded.scriptId, name: POSTERN_SCRIPT_NAME, source, activate: !heldByVacation }, signal);
  return {
    loaded: {
      set: next,
      scriptId: id,
      active: !heldByVacation,
      otherActive: heldByVacation ? other : null,
      problem: null,
    },
    heldByVacation,
    newlyIncluded,
  };
}

/** Turn the filters on: make Postern's script the active one (the vacation responder goes off). */
export async function activateFilters(io: SieveIo, signal?: AbortSignal): Promise<LoadedFilters> {
  const loaded = await loadFilters(io, signal);
  if (loaded.problem) throw new FilterScriptError(loaded.problem.kind === "foreign-name" ? FOREIGN_NAME_MESSAGE : UNREADABLE_MESSAGE);
  if (loaded.scriptId === null) return loaded;
  if (loaded.otherActive && !loaded.otherActive.vacation) {
    // A hand-written script took over since: run it from Postern's, then activate.
    return (await saveFilters(io, (s) => s, { signal })).loaded;
  }
  await io.activate(loaded.scriptId, signal);
  return { ...loaded, active: true, otherActive: null };
}
