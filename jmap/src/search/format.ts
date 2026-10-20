import type { AdvancedSearchFields } from "./types.js";

/** `value` as one operator argument: quoted when it has spaces or brackets. */
function arg(value: string): string {
  const v = value.trim().replace(/"/g, "");
  return /[\s(){}]/.test(v) ? `"${v}"` : v;
}

/** Splits free text into words and "quoted phrases", dropping stray quotes. */
function pieces(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => (m[1] !== undefined ? (m[1].trim() ? `"${m[1].trim()}"` : "") : m[2]!.replace(/"/g, ""))).filter((p) => p !== "");
}

function ymd(date: Date): string {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The Advanced search form as a search string, in Gmail's operators.
 * `parseSearch` reads back what this writes. Empty fields write nothing.
 * "Within N days of D": `after:` D-N, `before:` D+N+1 (the day after the last day).
 */
export function formatSearch(fields: AdvancedSearchFields): string {
  const out: string[] = [];
  const text = (name: string, value: string | undefined): void => {
    if (value && value.trim()) out.push(`${name}:${arg(value)}`);
  };
  text("from", fields.from);
  text("to", fields.to);
  text("subject", fields.subject);
  if (fields.words) out.push(...pieces(fields.words));
  if (fields.notWords) out.push(...pieces(fields.notWords).map((p) => `-${p}`));
  if (fields.label && fields.label.trim()) {
    out.push(fields.label.trim().toLowerCase() === "anywhere" ? "in:anywhere" : `label:${arg(fields.label)}`);
  }
  if (fields.hasAttachment) out.push("has:attachment");
  const size = fields.size;
  if (size && Number.isFinite(size.amount) && size.amount > 0) {
    out.push(`${size.comparison}:${size.amount}${size.unit === "B" ? "" : size.unit}`);
  }
  const within = fields.dateWithin;
  if (within) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(within.date);
    const days = Math.max(0, Math.floor(within.days));
    if (match) {
      const centre = Date.UTC(+match[1]!, +match[2]! - 1, +match[3]!);
      if (Number.isFinite(centre)) {
        out.push(`after:${ymd(new Date(centre - days * 86_400_000))}`, `before:${ymd(new Date(centre + (days + 1) * 86_400_000))}`);
      }
    }
  }
  return out.join(" ");
}
