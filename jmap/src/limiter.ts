// A counting semaphore, to stay within the session's maxConcurrentRequests and
// maxConcurrentUpload. A finishing task hands its slot straight to the next
// waiter, so nothing can slip in between.

export class Limiter {
  #max: number;
  #active = 0;
  #queue: (() => void)[] = [];

  constructor(max: number) {
    this.#max = Math.max(1, max);
  }

  get max(): number {
    return this.#max;
  }

  /** Change the limit (after a session refresh). */
  set max(value: number) {
    this.#max = Math.max(1, value);
    while (this.#active < this.#max && this.#queue.length > 0) {
      this.#active++;
      this.#queue.shift()?.();
    }
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.#active < this.#max) this.#active++;
    else await new Promise<void>((resolve) => this.#queue.push(resolve));
    try {
      return await task();
    } finally {
      this.#release();
    }
  }

  #release(): void {
    if (this.#active <= this.#max && this.#queue.length > 0) {
      this.#queue.shift()?.();
    } else {
      this.#active--;
    }
  }
}
