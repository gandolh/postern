// Best-effort work that must never hold up sign-in or sign-out.

/** Resolves with `promise`'s result, or `undefined` once `ms` pass or it fails. */
export async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([promise.catch(() => undefined), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} took longer than ${ms} ms`);
    this.name = "TimeoutError";
  }
}

/** Resolves or rejects with `promise`, or rejects with TimeoutError once `ms` pass. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(what, ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
