// Exponential backoff with jitter, for reconnecting the push stream.

export interface BackoffOptions {
  /** The first delay (default 1 s). The server's `retry:` replaces it. */
  initialMs: number;
  /** The ceiling (default 60 s). */
  maxMs: number;
  /** Growth per attempt (default 2). */
  factor: number;
  /** Fraction of each delay that is randomised, 0-1 (default 0.5): the delay is in [base × (1 − jitter), base]. */
  jitter: number;
  /** Injected for tests. */
  random: () => number;
}

export const DEFAULT_BACKOFF: BackoffOptions = {
  initialMs: 1_000,
  maxMs: 60_000,
  factor: 2,
  jitter: 0.5,
  random: Math.random,
};

/** The delay before reconnect attempt `attempt` (0 for the first retry). */
export function backoffDelay(attempt: number, options: Partial<BackoffOptions> = {}): number {
  const o = { ...DEFAULT_BACKOFF, ...options };
  const base = Math.min(o.maxMs, o.initialMs * o.factor ** Math.max(0, attempt));
  const jitter = Math.min(1, Math.max(0, o.jitter));
  return Math.round(base * (1 - jitter * o.random()));
}
