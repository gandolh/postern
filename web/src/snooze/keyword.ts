// Snooze's state on the server (brief 24; corpus/wiki/decisions-mail.md,
// "Snooze runs in the browser"), so every device agrees and nothing sits in
// localStorage:
//
//   the Snoozed label   a mailbox named "Snoozed", unsubscribed (out of an IMAP
//                       client's folder list), made on first use (./label.ts)
//   $snoozed-<time>     on each snoozed message: when it comes back, UTC to the
//                       minute, e.g. $snoozed-20261024T0600Z
//   $woken              on the newest message of a conversation that came back:
//                       the Inbox sorts it first until it is read or leaves the
//                       Inbox (./wake.ts), as Gmail puts a woken conversation on top
//
// Stalwart 0.16.25 keeps keyword case and took a 309-character keyword
// (checked 2026-10-27). Pure.

export const SNOOZED_LABEL = "Snoozed";
export const WOKEN = "$woken";

const PREFIX = "$snoozed-";
const PATTERN = /^\$snoozed-(\d{4})(\d{2})(\d{2})t(\d{2})(\d{2})z$/i;

/** The keyword for a wake-up at `at`, rounded up to the minute. */
export function snoozeKeyword(at: Date): string {
  const minute = new Date(Math.ceil(at.getTime() / 60_000) * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${PREFIX}${minute.getUTCFullYear()}${p(minute.getUTCMonth() + 1)}${p(minute.getUTCDate())}T${p(minute.getUTCHours())}${p(minute.getUTCMinutes())}Z`;
}

/** When a snooze keyword says to wake, or null for any other keyword. */
export function parseSnoozeKeyword(keyword: string): Date | null {
  const m = PATTERN.exec(keyword);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const at = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return Number.isNaN(at.getTime()) || at.getUTCMonth() !== mo - 1 ? null : at;
}

/** Is this one of snooze's keywords (any time)? */
export function isSnoozeKeyword(keyword: string): boolean {
  return keyword.toLowerCase().startsWith(PREFIX);
}

/** The snooze keywords a message carries. */
export function snoozeKeywordsOf(message: { keywords: Readonly<Record<string, true>> }): string[] {
  return Object.keys(message.keywords).filter(isSnoozeKeyword);
}

/** The earliest wake-up among some messages' keywords, or null when none is snoozed. */
export function snoozedUntil(messages: readonly { keywords: Readonly<Record<string, true>> }[]): Date | null {
  let best: Date | null = null;
  for (const m of messages) {
    for (const k of snoozeKeywordsOf(m)) {
      const at = parseSnoozeKeyword(k);
      if (at && (!best || at < best)) best = at;
    }
  }
  return best;
}
