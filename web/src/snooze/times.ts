// Snooze's choices (brief 24), in this browser's time zone (Postern keeps no
// time zone for the account): Later today (+3 h, to the nearest hour),
// Tomorrow 08:00, This weekend (Saturday 08:00), Next week (Monday 08:00).
// A choice that doesn't fit today is left out: Later today once it would fall
// tomorrow, This weekend on a Saturday or Sunday. Pure.

export interface SnoozePreset {
  id: "later" | "tomorrow" | "weekend" | "week";
  label: string;
  at: Date;
}

function atHour(day: Date, offsetDays: number, hour: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + offsetDays, hour, 0, 0, 0);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function snoozePresets(now: Date): SnoozePreset[] {
  const out: SnoozePreset[] = [];
  const later = new Date(now.getTime() + 3 * 3_600_000);
  later.setMinutes(later.getMinutes() >= 30 ? 60 : 0, 0, 0);
  if (sameDay(later, now)) out.push({ id: "later", label: "Later today", at: later });
  out.push({ id: "tomorrow", label: "Tomorrow", at: atHour(now, 1, 8) });
  const day = now.getDay();
  if (day !== 0 && day !== 6) out.push({ id: "weekend", label: "This weekend", at: atHour(now, 6 - day, 8) });
  out.push({ id: "week", label: "Next week", at: atHour(now, (8 - day) % 7 || 7, 8) });
  return out;
}

/** "Tue 08:00" within the coming week, "Nov 12, 08:00" further off. */
export function formatSnoozeTime(at: Date, now: Date = new Date(), locale?: string): string {
  const inWeek = at.getTime() - now.getTime() < 6 * 86_400_000 && at.getTime() > now.getTime() - 86_400_000;
  const options: Intl.DateTimeFormatOptions = inWeek
    ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat(locale, options).format(at);
}

/** Why a picked time can't be used, or null: it must be in the future. */
export function checkSnoozeTime(at: Date, now: Date): string | null {
  if (Number.isNaN(at.getTime())) return "Choose a date and a time.";
  if (at.getTime() <= now.getTime()) return "Choose a time in the future.";
  return null;
}
