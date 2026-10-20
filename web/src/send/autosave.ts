// Autosave: a few seconds after typing stops, save the draft; one save at a
// time; changes made during a save are saved after it. `flush()` saves now
// (closing the window, sending) and resolves once the latest state is on the
// server.
//
//   const saver = new Autosaver(() => saveTheDraft(), { onStatus: (s) => ... });
//   saver.touch();          on every change
//   await saver.flush();    before close or send; rejects if that save failed

/** idle: nothing to save yet. dirty: changes not saved. saving. saved. error: the last save failed (still dirty). */
export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/** Gmail saves a moment after you stop typing. */
export const AUTOSAVE_DELAY_MS = 2500;
/** After a failed save, try again this much later even without new typing. */
export const AUTOSAVE_RETRY_MS = 15_000;

export interface AutosaverOptions {
  delayMs?: number;
  retryMs?: number;
  onStatus?: (status: SaveStatus, error: unknown) => void;
  /** Whether there is anything worth saving now (an empty new message is not). */
  shouldSave?: () => boolean;
}

export class Autosaver {
  readonly #save: () => Promise<void>;
  readonly #delay: number;
  readonly #retry: number;
  readonly #onStatus: (status: SaveStatus, error: unknown) => void;
  readonly #shouldSave: () => boolean;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #running: Promise<void> | null = null;
  #dirty = false;
  #status: SaveStatus = "idle";
  #disposed = false;

  constructor(save: () => Promise<void>, options: AutosaverOptions = {}) {
    this.#save = save;
    this.#delay = options.delayMs ?? AUTOSAVE_DELAY_MS;
    this.#retry = options.retryMs ?? AUTOSAVE_RETRY_MS;
    this.#onStatus = options.onStatus ?? (() => {});
    this.#shouldSave = options.shouldSave ?? (() => true);
  }

  get status(): SaveStatus {
    return this.#status;
  }

  get dirty(): boolean {
    return this.#dirty;
  }

  /** Something changed: save after the delay (restarted by each change). */
  touch(): void {
    if (this.#disposed) return;
    this.#dirty = true;
    if (this.#status !== "saving") this.#set("dirty", null);
    this.#schedule(this.#delay);
  }

  /** Save now if anything is unsaved, after any save already running. Rejects when that save fails. */
  async flush(): Promise<void> {
    this.#clear();
    await this.#run(true);
  }

  /** Stop: no more saves (discard, sent). */
  dispose(): void {
    this.#disposed = true;
    this.#clear();
  }

  #schedule(ms: number): void {
    this.#clear();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#run(false).catch(() => {});
    }, ms);
  }

  #clear(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  async #run(rethrow: boolean): Promise<void> {
    // One save at a time: a change made during a save is saved after it.
    while (this.#running) await this.#running.catch(() => {});
    if (!this.#dirty || this.#disposed) return;
    if (!this.#shouldSave()) {
      this.#dirty = false;
      this.#set("idle", null);
      return;
    }
    this.#dirty = false;
    this.#set("saving", null);
    const run = this.#save();
    this.#running = run;
    try {
      await run;
    } catch (err) {
      this.#running = null;
      this.#dirty = true;
      if (!this.#disposed) {
        this.#set("error", err);
        this.#schedule(this.#retry);
      }
      if (rethrow) throw err;
      return;
    }
    this.#running = null;
    if (this.#disposed) return;
    if (this.#dirty) {
      this.#set("dirty", null);
      if (this.#timer === null) this.#schedule(this.#delay);
    } else this.#set("saved", null);
  }

  #set(status: SaveStatus, error: unknown): void {
    this.#status = status;
    this.#onStatus(status, error);
  }
}
