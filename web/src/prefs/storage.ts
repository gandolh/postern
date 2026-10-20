// Versioned JSON in localStorage with an in-memory fallback. Every access is
// wrapped: private mode, blocked storage and corrupt JSON all fall back to
// this tab's memory, never to an error.

const memory = new Map<string, string>();

export function readRaw(key: string): unknown {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Storage unavailable: use memory below.
  }
  raw ??= memory.get(key) ?? null;
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: unknown): void {
  const text = JSON.stringify(value);
  memory.set(key, text);
  try {
    window.localStorage.setItem(key, text);
  } catch {
    // Kept in memory for this tab.
  }
}

/** For tests. */
export function clearMemory(): void {
  memory.clear();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
