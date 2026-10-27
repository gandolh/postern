// The few iCalendar (RFC 5545) facts a calendar invite's card needs (brief 25),
// read by hand: METHOD, and from the first VEVENT SUMMARY, DTSTART / DTEND,
// LOCATION, ORGANIZER, ATTENDEE (address, name, PARTSTAT), UID and SEQUENCE.
// Nothing else is read, and nothing here is ever HTML: every value is text the
// card shows as text. The invite is untrusted input like any message. Pure.
//
// Times: UTC ("...Z"), a date (all day), or a TZID. A TZID that is an IANA zone
// (the usual case) is worked out with Intl; one that isn't (Outlook's "W.
// Europe Standard Time") uses the offset its VTIMEZONE gives for that time of
// year; failing both it is read as this browser's local time and says so.

export type InviteMethod = "REQUEST" | "CANCEL" | "REPLY" | "PUBLISH" | string;
export type PartStat = "NEEDS-ACTION" | "ACCEPTED" | "DECLINED" | "TENTATIVE" | "DELEGATED" | string;

export interface Person {
  email: string;
  name: string | null;
}

export interface Attendee extends Person {
  partstat: PartStat;
}

export interface EventTime {
  /** The instant (for an all-day event, midnight UTC of the date). */
  at: Date;
  allDay: boolean;
  /** The TZID as given, when there was one. */
  tzid: string | null;
  /** The TZID could not be worked out: `at` is the wall time read as local time. */
  floating: boolean;
}

export interface Invite {
  method: InviteMethod;
  uid: string;
  sequence: number;
  summary: string;
  location: string;
  start: EventTime | null;
  end: EventTime | null;
  organizer: Person | null;
  attendees: Attendee[];
}

/** An invite larger than this is not read. */
export const MAX_ICS_BYTES = 256 * 1024;

interface Line {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Unfold (RFC 5545 §3.1) and split into content lines. */
function contentLines(text: string): Line[] {
  const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const out: Line[] = [];
  for (const raw of unfolded.split(/\r?\n/)) {
    if (!raw) continue;
    // The name and parameters end at the first ":" outside a quoted parameter value.
    let quoted = false;
    let colon = -1;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === '"') quoted = !quoted;
      else if (c === ":" && !quoted) {
        colon = i;
        break;
      }
    }
    if (colon < 0) continue;
    const head = raw.slice(0, colon);
    const value = raw.slice(colon + 1);
    const parts = head.match(/(?:[^;"]+|"[^"]*")+/g) ?? [];
    const name = (parts[0] ?? "").toUpperCase();
    const params: Record<string, string> = {};
    for (const p of parts.slice(1)) {
      const eq = p.indexOf("=");
      if (eq < 0) continue;
      params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
    }
    out.push({ name, params, value });
  }
  return out;
}

/** TEXT values: \n, \, \; \\ unescaped. */
function text(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

function person(line: Line | undefined): Person | null {
  if (!line) return null;
  const email = line.value.replace(/^mailto:/i, "").trim();
  if (!email || !email.includes("@")) return null;
  return { email, name: line.params["CN"]?.trim() || null };
}

interface Zone {
  /** STANDARD and DAYLIGHT: when each starts (month, day, hour) and the offset it brings, in minutes. */
  rules: { month: number; day: number; offsetMinutes: number }[];
}

function offsetMinutes(value: string): number | null {
  const m = /^([+-])(\d{2})(\d{2})/.exec(value.trim());
  if (!m) return null;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Is it a zone Intl knows? */
function isIana(tzid: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tzid });
    return true;
  } catch {
    return false;
  }
}

/** The offset of an IANA zone at an instant, in ms (wall time minus UTC). */
function ianaOffset(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(ms / 1000) * 1000;
}

/** The UTC instant of a wall time in an IANA zone. */
export function zonedToUtc(wall: number, tz: string): number {
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const next = wall - ianaOffset(guess, tz);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** The offset a VTIMEZONE gives at a wall time: the rule that started last before it in the year. */
function zoneOffset(zone: Zone, month: number, day: number): number | null {
  if (zone.rules.length === 0) return null;
  const key = (r: { month: number; day: number }) => r.month * 100 + r.day;
  const sorted = [...zone.rules].sort((a, b) => key(a) - key(b));
  const now = month * 100 + day;
  const before = sorted.filter((r) => key(r) <= now);
  return (before.at(-1) ?? sorted.at(-1))!.offsetMinutes;
}

function eventTime(line: Line | undefined, zones: ReadonlyMap<string, Zone>): EventTime | null {
  if (!line) return null;
  const v = line.value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date || line.params["VALUE"]?.toUpperCase() === "DATE") {
    const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { at: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))), allDay: true, tzid: null, floating: false };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/i.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  if (m[7]) return { at: new Date(wall), allDay: false, tzid: null, floating: false };
  const tzid = line.params["TZID"]?.replace(/^\//, "") ?? null;
  if (tzid && isIana(tzid)) return { at: new Date(zonedToUtc(wall, tzid)), allDay: false, tzid, floating: false };
  const zone = tzid ? zones.get(tzid) : undefined;
  const offset = zone ? zoneOffset(zone, mo, d) : null;
  if (offset !== null) return { at: new Date(wall - offset * 60_000), allDay: false, tzid, floating: false };
  // No zone to go by: the wall time, as this browser's local time.
  return { at: new Date(y, mo - 1, d, h, mi, s), allDay: false, tzid, floating: true };
}

/** Read an invite's facts, or null when it has no VEVENT. Never throws on bad input. */
export function parseInvite(ics: string): Invite | null {
  if (ics.length > MAX_ICS_BYTES) return null;
  const lines = contentLines(ics);
  let method: InviteMethod = "";
  const zones = new Map<string, Zone>();
  let event: Line[] | null = null;
  let current: Line[] | null = null;
  let zone: { id: string; rule: { month: number; day: number; offsetMinutes: number } | null; zone: Zone } | null = null;
  const stack: string[] = [];
  for (const line of lines) {
    if (line.name === "BEGIN") {
      const what = line.value.trim().toUpperCase();
      stack.push(what);
      if (what === "VEVENT" && event === null) current = [];
      if (what === "VTIMEZONE") zone = { id: "", rule: null, zone: { rules: [] } };
      if ((what === "STANDARD" || what === "DAYLIGHT") && zone) zone.rule = { month: 1, day: 1, offsetMinutes: 0 };
      continue;
    }
    if (line.name === "END") {
      const what = stack.pop();
      if (what === "VEVENT" && current) {
        // The master event, not a changed instance of a recurring one.
        if (!current.some((l) => l.name === "RECURRENCE-ID")) event = current;
        current = null;
      }
      if ((what === "STANDARD" || what === "DAYLIGHT") && zone?.rule) {
        zone.zone.rules.push(zone.rule);
        zone.rule = null;
      }
      if (what === "VTIMEZONE" && zone) {
        if (zone.id) zones.set(zone.id, zone.zone);
        zone = null;
      }
      continue;
    }
    const where = stack.at(-1);
    if (where === "VCALENDAR" && line.name === "METHOD") method = line.value.trim().toUpperCase();
    else if (where === "VEVENT" && current) current.push(line);
    else if (where === "VTIMEZONE" && zone && line.name === "TZID") zone.id = line.value.trim();
    else if ((where === "STANDARD" || where === "DAYLIGHT") && zone?.rule) {
      if (line.name === "TZOFFSETTO") zone.rule.offsetMinutes = offsetMinutes(line.value) ?? 0;
      if (line.name === "DTSTART") {
        const m = /^\d{4}(\d{2})(\d{2})/.exec(line.value.trim());
        if (m) zone.rule = { ...zone.rule, month: Number(m[1]), day: Number(m[2]) };
      }
    }
  }
  if (!event) return null;
  const one = (name: string) => event!.find((l) => l.name === name);
  const sequence = Number.parseInt(one("SEQUENCE")?.value ?? "0", 10);
  return {
    method,
    uid: (one("UID")?.value ?? "").trim(),
    sequence: Number.isFinite(sequence) && sequence >= 0 ? sequence : 0,
    summary: text(one("SUMMARY")?.value ?? "").trim(),
    location: text(one("LOCATION")?.value ?? "").trim(),
    start: eventTime(one("DTSTART"), zones),
    end: eventTime(one("DTEND"), zones),
    organizer: person(one("ORGANIZER")),
    attendees: event
      .filter((l) => l.name === "ATTENDEE")
      .flatMap((l) => {
        const p = person(l);
        return p ? [{ ...p, partstat: (l.params["PARTSTAT"] ?? "NEEDS-ACTION").toUpperCase() }] : [];
      }),
  };
}

// ---- The reply (RFC 5546 §3.2.3) ---------------------------------------------------

/** A TEXT value written back: \ ; , and newlines escaped. */
function escapeText(value: string): string {
  return value.replace(/([\\;,])/g, "\\$1").replace(/\r?\n/g, "\\n");
}

/** A parameter value, quoted when it holds ; : or , (and never a quote or a line break). */
function param(value: string): string {
  const clean = value.replace(/["\r\n]/g, "");
  return /[;:,]/.test(clean) ? `"${clean}"` : clean;
}

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n ");
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** The METHOD:REPLY an attendee sends the organiser. */
export function buildReply(invite: Invite, me: Person, partstat: "ACCEPTED" | "DECLINED" | "TENTATIVE", now: Date): string {
  const organizer = invite.organizer;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Postern//Webmail//EN",
    "METHOD:REPLY",
    "BEGIN:VEVENT",
    `UID:${invite.uid.replace(/[\r\n]/g, "")}`,
    `SEQUENCE:${invite.sequence}`,
    `DTSTAMP:${utcStamp(now)}`,
    ...(invite.start && !invite.start.floating ? [invite.start.allDay ? `DTSTART;VALUE=DATE:${utcStamp(invite.start.at).slice(0, 8)}` : `DTSTART:${utcStamp(invite.start.at)}`] : []),
    ...(invite.summary ? [`SUMMARY:${escapeText(invite.summary)}`] : []),
    ...(organizer ? [`ORGANIZER${organizer.name ? `;CN=${param(organizer.name)}` : ""}:mailto:${organizer.email}`] : []),
    `ATTENDEE;PARTSTAT=${partstat}${me.name ? `;CN=${param(me.name)}` : ""}:mailto:${me.email}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
