// Gmail's date and size forms. Pure.

/** `YYYY/MM/DD`, `YYYY-MM-DD`, `MM/DD/YYYY`, or epoch seconds, as a UTC midnight shifted by the user's offset. */
export function parseSearchDate(value: string, utcOffsetMinutes = 0): Date | null {
  let y: number, m: number, d: number;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value))) {
    y = +match[1]!;
    m = +match[2]!;
    d = +match[3]!;
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value))) {
    m = +match[1]!;
    d = +match[2]!;
    y = +match[3]!;
  } else if (/^\d{9,11}$/.test(value)) {
    return new Date(Number(value) * 1000);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return new Date(date.getTime() - utcOffsetMinutes * 60_000);
}

/** `3d`, `2m`, `1y`: how far back from `now`. Months and years are calendar months, clamped to the month's length. */
export function subtractAge(now: Date, value: string): Date | null {
  const match = /^(\d{1,4})([dmy])$/i.exec(value);
  if (!match) return null;
  const count = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  if (unit === "d") return new Date(now.getTime() - count * 86_400_000);
  const months = unit === "y" ? count * 12 : count;
  const result = new Date(now.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

/** `500`, `10K`, `5M`, `1G`, `1.5M` (K = 1024 bytes) to bytes. */
export function parseSize(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)([kmg]?)b?$/i.exec(value);
  if (!match) return null;
  const unit = match[2]!.toLowerCase();
  const factor = unit === "k" ? 1024 : unit === "m" ? 1024 ** 2 : unit === "g" ? 1024 ** 3 : 1;
  return Math.round(Number(match[1]) * factor);
}

/** A JMAP UTCDate: `2026-01-01T00:00:00Z`. */
export function toUtcDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
