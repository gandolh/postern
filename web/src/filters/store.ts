// The filters of the signed-in account, shared by the settings page, the
// conversation view's Block menu and "Filter messages like these": loaded
// once per client, refreshed after every save. Saves run one at a time.
//
//   const filters = useFilters();          // snapshot; loads on first use
//   await filters.store.save((set) => withBlocked(set, "bob@x.test"));

import { isAbortError, type FilterSet, type JmapClient } from "@postern/jmap";
import { useEffect, useSyncExternalStore } from "react";
import { useJmap } from "../auth";
import { activateFilters, loadFilters, saveFilters, type LoadedFilters, type SaveOptions, type SaveOutcome } from "./filterScript";
import { jmapSieveIo, type SieveIo } from "./scriptIo";

export interface FiltersSnapshot {
  status: "idle" | "loading" | "ready" | "error";
  loaded: LoadedFilters | null;
  error: string | null;
  /** A save is running. */
  saving: boolean;
}

const IDLE: FiltersSnapshot = { status: "idle", loaded: null, error: null, saving: false };

export class FiltersStore {
  readonly #io: SieveIo;
  #snapshot: FiltersSnapshot = IDLE;
  readonly #listeners = new Set<() => void>();
  #loading: Promise<void> | null = null;
  /** The tail of the save queue. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(io: SieveIo) {
    this.#io = io;
  }

  getSnapshot = (): FiltersSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #set(patch: Partial<FiltersSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const l of this.#listeners) l();
  }

  /** Load once (or again with `force`). Never rejects: errors land in the snapshot. */
  load(force = false): Promise<void> {
    if (this.#loading) return this.#loading;
    if (!force && this.#snapshot.status === "ready") return Promise.resolve();
    if (this.#snapshot.status !== "ready") this.#set({ status: "loading", error: null });
    this.#loading = loadFilters(this.#io)
      .then(
        (loaded) => this.#set({ status: "ready", loaded, error: null }),
        (e: unknown) => {
          if (isAbortError(e)) return;
          this.#set({ status: this.#snapshot.loaded ? "ready" : "error", error: e instanceof Error ? e.message : "unknown error" });
        },
      )
      .finally(() => {
        this.#loading = null;
      });
    return this.#loading;
  }

  #run<T>(work: () => Promise<T>, after: (result: T) => LoadedFilters): Promise<T> {
    const run = this.#queue.then(async () => {
      this.#set({ saving: true });
      try {
        const result = await work();
        this.#set({ status: "ready", loaded: after(result), error: null });
        return result;
      } finally {
        this.#set({ saving: false });
      }
    });
    this.#queue = run.catch(() => undefined);
    return run;
  }

  /** Change the filters (applied to the server's current set) and save. Rejects with FilterScriptError or a JMAP error. */
  save(change: (set: FilterSet) => FilterSet, options: Omit<SaveOptions, "signal"> = {}): Promise<SaveOutcome> {
    return this.#run(
      () => saveFilters(this.#io, change, options),
      (outcome) => outcome.loaded,
    );
  }

  /** Make Postern's script the active one (turns Stalwart's vacation responder off). */
  turnOn(): Promise<LoadedFilters> {
    return this.#run(
      () => activateFilters(this.#io),
      (loaded) => loaded,
    );
  }
}

const stores = new WeakMap<JmapClient, FiltersStore>();

/** The filters store of a client (one per signed-in session). */
export function filtersStoreFor(client: JmapClient): FiltersStore {
  let store = stores.get(client);
  if (!store) {
    store = new FiltersStore(jmapSieveIo(client));
    stores.set(client, store);
  }
  return store;
}

/** Tests: use this store for this client. */
export function provideFiltersStore(client: JmapClient, store: FiltersStore): void {
  stores.set(client, store);
}

/** The account's filters; loads them on first use. */
export function useFilters(): FiltersSnapshot & { store: FiltersStore } {
  const client = useJmap();
  const store = filtersStoreFor(client);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    void store.load();
  }, [store]);
  return { ...snapshot, store };
}
