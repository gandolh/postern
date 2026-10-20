// The outbox: messages the user has sent but Postern is still holding for
// Undo send. In memory only, like Gmail's: nothing is submitted until the hold
// ends, so Undo needs no server call. If the tab closes during the hold, the
// message stays a draft in Drafts (the host warns before unload). A sign-out
// sends what is held at once (sendAllNow): the user already saw "Message sent".
//
//   const id = outbox.hold({ key, label, delayMs, send: () => submit(), onSent, onFailed });
//   outbox.undo(key)   // true while held: nothing was sent
//   await outbox.sendAllNow()
//
// States: held (Undo works) → sending → gone (onSent or onFailed ran).

export type OutboxStatus = "held" | "sending";

export interface OutboxEntry {
  /** The composer's key. */
  key: string;
  /** What the message is called (its subject), for status text. */
  label: string;
  status: OutboxStatus;
  /** When the hold ends (ms since epoch). */
  sendAt: number;
}

export interface HoldOptions<T> {
  key: string;
  label: string;
  delayMs: number;
  /** Submit the message. Runs once, when the hold ends. */
  send: () => Promise<T>;
  /** The hold ended and sending starts: Undo is no longer possible. */
  onSend?: () => void;
  onSent?: (result: T) => void;
  onFailed?: (error: unknown) => void;
}

interface Held {
  entry: OutboxEntry;
  timer: ReturnType<typeof setTimeout> | null;
  run: () => void;
  /** Settles once onSent or onFailed has run; null while held. */
  sent: Promise<void> | null;
}

export class Outbox {
  readonly #items = new Map<string, Held>();
  readonly #listeners = new Set<() => void>();
  readonly #now: () => number;
  #snapshot: readonly OutboxEntry[] = [];

  constructor(options: { now?: () => number } = {}) {
    this.#now = options.now ?? Date.now;
  }

  /** Hold a message for `delayMs`, then send it. A second hold for the same key replaces nothing: it is refused. */
  hold<T>(options: HoldOptions<T>): boolean {
    if (this.#items.has(options.key)) return false;
    const entry: OutboxEntry = { key: options.key, label: options.label, status: "held", sendAt: this.#now() + Math.max(0, options.delayMs) };
    const held: Held = {
      entry,
      timer: null,
      sent: null,
      run: () => {
        held.timer = null;
        held.entry = { ...held.entry, status: "sending" };
        this.#emit();
        options.onSend?.();
        held.sent = options.send().then(
          (result) => {
            this.#items.delete(options.key);
            this.#emit();
            options.onSent?.(result);
          },
          (error: unknown) => {
            this.#items.delete(options.key);
            this.#emit();
            options.onFailed?.(error);
          },
        );
      },
    };
    this.#items.set(options.key, held);
    if (options.delayMs <= 0) held.run();
    else held.timer = setTimeout(held.run, options.delayMs);
    this.#emit();
    return true;
  }

  /** Take back a held message. False when it is already being sent (or unknown). */
  undo(key: string): boolean {
    const held = this.#items.get(key);
    if (!held || held.entry.status !== "held") return false;
    if (held.timer !== null) clearTimeout(held.timer);
    this.#items.delete(key);
    this.#emit();
    return true;
  }

  /** Stop holding and send at once (e.g. a second Send). False unless held. */
  sendNow(key: string): boolean {
    const held = this.#items.get(key);
    if (!held || held.entry.status !== "held") return false;
    if (held.timer !== null) clearTimeout(held.timer);
    held.run();
    return true;
  }

  /** Send every held message now, and resolve once each one being sent has its answer (onSent or onFailed ran). Never rejects. */
  async sendAllNow(): Promise<void> {
    for (const key of [...this.#items.keys()]) this.sendNow(key);
    await Promise.allSettled([...this.#items.values()].flatMap((held) => (held.sent ? [held.sent] : [])));
  }

  has(key: string): boolean {
    return this.#items.has(key);
  }

  /** Anything held or being sent (to warn before the tab closes). */
  get busy(): boolean {
    return this.#items.size > 0;
  }

  /**
   * The session is ending (sign-out): drop every held message without sending
   * it. Each stays a draft in Drafts. Returns their keys.
   */
  dispose(): string[] {
    const dropped: string[] = [];
    for (const [key, held] of this.#items) {
      if (held.entry.status !== "held") continue;
      if (held.timer !== null) clearTimeout(held.timer);
      this.#items.delete(key);
      dropped.push(key);
    }
    this.#emit();
    return dropped;
  }

  getSnapshot = (): readonly OutboxEntry[] => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #emit(): void {
    this.#snapshot = [...this.#items.values()].map((h) => h.entry);
    for (const listener of [...this.#listeners]) listener();
  }
}
