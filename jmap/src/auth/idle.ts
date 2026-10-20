// The idle session timeout (corpus/wiki/security.md). Activity only stamps a
// time, so the web app can call it on every key or pointer event; one timer
// checks the stamp when the deadline comes. A machine that slept through the
// deadline (timers may not count suspended time) is caught three ways: the
// first input after waking finds the deadline passed and ends the session
// instead of restarting the clock, the web app asks `check()` when the tab
// becomes visible, and the token holder asks before every request.

/**
 * Sign out after 8 hours without input. Long enough that a working day of
 * on-and-off use never meets it; short enough that a tab left open overnight on
 * an unattended machine is signed out by morning.
 */
export const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

/** setTimeout's ceiling (2^31 - 1 ms); longer delays fire at once. */
const MAX_DELAY_MS = 2_147_483_647;

export interface IdleTimeoutOptions {
  /** How long without activity before `onIdle`. Default `IDLE_TIMEOUT_MS`. `Infinity` turns it off. */
  timeoutMs?: number;
  /** Called once when the period passes without `activity()`. */
  onIdle: () => void;
  /** Injected for tests. */
  now?: () => number;
}

export class IdleTimeout {
  readonly timeoutMs: number;
  readonly #onIdle: () => void;
  readonly #now: () => number;
  #last = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #running = false;

  constructor(options: IdleTimeoutOptions) {
    this.timeoutMs = options.timeoutMs ?? IDLE_TIMEOUT_MS;
    this.#onIdle = options.onIdle;
    this.#now = options.now ?? Date.now;
  }

  /** Whether the timer is running. */
  get running(): boolean {
    return this.#running;
  }

  /** Start (or restart) counting from now. */
  start(): void {
    this.#running = true;
    this.#last = this.#now();
    this.#schedule(this.timeoutMs);
  }

  /** Stop counting. `onIdle` will not be called. */
  stop(): void {
    this.#running = false;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /**
   * The user did something. Cheap: it only records the time. If the deadline
   * has already passed (the machine slept through it), this is not activity
   * but the first input after waking: `onIdle` runs instead.
   */
  activity(): void {
    if (!this.#running) return;
    if (this.check()) return;
    this.#last = this.#now();
  }

  /** Run `onIdle` now if the deadline has passed. True when it did. */
  check(): boolean {
    if (!this.expired()) return false;
    this.stop();
    this.#onIdle();
    return true;
  }

  /** True when the period has passed, even if the timer has not fired yet (throttled tab, sleeping machine). */
  expired(): boolean {
    return this.#running && Number.isFinite(this.timeoutMs) && this.#now() - this.#last >= this.timeoutMs;
  }

  #schedule(delay: number): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!Number.isFinite(this.timeoutMs)) return;
    this.#timer = setTimeout(() => this.#check(), Math.min(MAX_DELAY_MS, Math.max(0, delay)));
  }

  #check(): void {
    this.#timer = undefined;
    if (!this.#running) return;
    const remaining = this.timeoutMs - (this.#now() - this.#last);
    if (remaining > 0) {
      this.#schedule(remaining);
      return;
    }
    this.stop();
    this.#onIdle();
  }
}
