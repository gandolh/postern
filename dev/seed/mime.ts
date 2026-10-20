// A small, deterministic RFC 5322 / MIME writer for the seed, plus the binary
// bits the fixtures attach (PNG, PDF, iCalendar, a large CSV). Same input,
// same bytes: boundaries come from the message key, never from the clock or
// Math.random.

import { crc32, deflateSync } from "node:zlib";

// ---------------------------------------------------------------- randomness

/** mulberry32: a tiny seeded PRNG. Returns floats in [0, 1). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error("pick from an empty list");
  return item;
}

// ------------------------------------------------------------------- headers

export interface Address {
  name?: string;
  email: string;
}

const CRLF = "\r\n";

function isAscii(s: string): boolean {
  return /^[\x20-\x7e]*$/.test(s);
}

/** RFC 2047 encoded-word for a header value with non-ASCII text. */
function encodeWord(s: string): string {
  if (isAscii(s)) return s;
  // Split on whole characters so no encoded-word ends mid-sequence.
  const words: string[] = [];
  let chunk = "";
  for (const ch of s) {
    if (Buffer.byteLength(chunk + ch) > 39) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w).toString("base64")}?=`).join(" ");
}

export function formatAddress(a: Address): string {
  if (!a.name) return a.email;
  if (!isAscii(a.name)) return `${encodeWord(a.name)} <${a.email}>`;
  const needsQuotes = /[()<>[\]:;@\\,."]/.test(a.name);
  return needsQuotes ? `"${a.name.replace(/(["\\])/g, "\\$1")}" <${a.email}>` : `${a.name} <${a.email}>`;
}

/** Fold a header at spaces to stay under 78 characters a line. */
function foldHeader(name: string, value: string): string {
  const line = `${name}: ${value}`;
  if (line.length <= 78) return line;
  const parts = value.split(" ");
  const out: string[] = [];
  let current = `${name}:`;
  for (const part of parts) {
    if ((current + " " + part).length > 78 && current !== `${name}:`) {
      out.push(current);
      current = " " + part;
    } else {
      current += " " + part;
    }
  }
  out.push(current);
  return out.join(CRLF);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** RFC 5322 date in UTC: "Tue, 20 Oct 2026 10:00:00 +0000". */
export function rfc5322Date(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${DAYS[d.getUTCDay()]}, ${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`
  );
}

// ------------------------------------------------------------------ encodings

/** Quoted-printable over UTF-8 bytes, CRLF line ends, 76-column soft breaks. */
export function quotedPrintable(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const bytes = Buffer.from(line, "utf8");
    let encoded = "";
    let col = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i] as number;
      const last = i === bytes.length - 1;
      let token: string;
      if ((b === 0x20 || b === 0x09) && last) token = b === 0x20 ? "=20" : "=09";
      else if ((b >= 33 && b <= 126 && b !== 61) || b === 0x20 || b === 0x09) token = String.fromCharCode(b);
      else token = "=" + b.toString(16).toUpperCase().padStart(2, "0");
      if (col + token.length > 75) {
        encoded += "=" + CRLF;
        col = 0;
      }
      encoded += token;
      col += token.length;
    }
    out.push(encoded);
  }
  return out.join(CRLF);
}

export function base64Lines(data: Uint8Array | string): string {
  const b64 = Buffer.from(data).toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join(CRLF);
}

// ---------------------------------------------------------------------- parts

export interface Attachment {
  filename: string;
  /** Media type, with parameters if any. */
  type: string;
  data: Uint8Array | string;
  /** Set for an inline image referenced from the HTML as cid:<contentId>. */
  contentId?: string;
}

export interface MessageSpec {
  /** Stable key, e.g. "alice/conv/roadmap/03"; seeds the MIME boundaries. */
  key: string;
  from: Address;
  to: Address[];
  cc?: Address[];
  replyTo?: Address;
  subject: string;
  date: Date;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  text?: string;
  html?: string;
  /** Inline images for the HTML part (multipart/related). */
  inline?: Attachment[];
  attachments?: Attachment[];
  /** A text/calendar alternative, as calendar invitations carry. */
  calendar?: { method: string; ics: string };
  /** Extra headers, in order, after the standard ones. */
  headers?: Array<[string, string]>;
}

interface Part {
  headers: Array<[string, string]>;
  body: string;
}

function textPart(type: string, text: string): Part {
  return {
    headers: [
      ["Content-Type", `${type}; charset=utf-8`],
      ["Content-Transfer-Encoding", "quoted-printable"],
    ],
    body: quotedPrintable(text),
  };
}

function attachmentPart(a: Attachment, inline: boolean): Part {
  const quoted = `"${a.filename.replace(/(["\\])/g, "\\$1")}"`;
  const headers: Array<[string, string]> = [
    ["Content-Type", `${a.type}; name=${quoted}`],
    ["Content-Transfer-Encoding", "base64"],
    ["Content-Disposition", `${inline ? "inline" : "attachment"}; filename=${quoted}`],
  ];
  if (a.contentId) headers.push(["Content-ID", `<${a.contentId}>`]);
  return { headers, body: base64Lines(a.data) };
}

function multipart(subtype: string, boundary: string, parts: Part[]): Part {
  const body =
    "This is a multi-part message in MIME format." +
    CRLF +
    parts.map((p) => `${CRLF}--${boundary}${CRLF}${renderPart(p)}`).join("") +
    `${CRLF}--${boundary}--${CRLF}`;
  return { headers: [["Content-Type", `multipart/${subtype}; boundary="${boundary}"`]], body };
}

function renderPart(p: Part): string {
  return p.headers.map(([k, v]) => foldHeader(k, v)).join(CRLF) + CRLF + CRLF + p.body;
}

/** The whole message, CRLF line ends throughout. */
export function buildMessage(spec: MessageSpec): string {
  let n = 0;
  const boundary = () => `=_postern_${spec.key.replace(/[^A-Za-z0-9]/g, "_")}_${n++}`;

  let html: Part | undefined;
  if (spec.html !== undefined) {
    html = textPart("text/html", spec.html);
    if (spec.inline?.length) {
      html = multipart("related", boundary(), [html, ...spec.inline.map((a) => attachmentPart(a, true))]);
    }
  }
  const alternatives: Part[] = [];
  if (spec.text !== undefined) alternatives.push(textPart("text/plain", spec.text));
  if (html) alternatives.push(html);
  if (spec.calendar) {
    alternatives.push({
      headers: [
        ["Content-Type", `text/calendar; charset=utf-8; method=${spec.calendar.method}`],
        ["Content-Transfer-Encoding", "quoted-printable"],
      ],
      body: quotedPrintable(spec.calendar.ics),
    });
  }
  if (alternatives.length === 0) throw new Error(`${spec.key}: no body`);
  let body: Part =
    alternatives.length === 1 ? (alternatives[0] as Part) : multipart("alternative", boundary(), alternatives);
  if (spec.attachments?.length) {
    body = multipart("mixed", boundary(), [body, ...spec.attachments.map((a) => attachmentPart(a, false))]);
  }

  const headers: Array<[string, string]> = [
    ["From", formatAddress(spec.from)],
    ["To", spec.to.map(formatAddress).join(", ")],
  ];
  if (spec.cc?.length) headers.push(["Cc", spec.cc.map(formatAddress).join(", ")]);
  if (spec.replyTo) headers.push(["Reply-To", formatAddress(spec.replyTo)]);
  headers.push(["Subject", encodeWord(spec.subject)]);
  headers.push(["Date", rfc5322Date(spec.date)]);
  headers.push(["Message-ID", `<${spec.messageId}>`]);
  if (spec.inReplyTo) headers.push(["In-Reply-To", `<${spec.inReplyTo}>`]);
  if (spec.references?.length) headers.push(["References", spec.references.map((r) => `<${r}>`).join(" ")]);
  for (const h of spec.headers ?? []) headers.push(h);
  headers.push(["MIME-Version", "1.0"]);
  return renderPart({ headers: [...headers, ...body.headers], body: body.body }) + CRLF;
}

// ------------------------------------------------------------------- binaries

/** A width x height RGB PNG with a diagonal two-colour gradient. */
export function png(width: number, height: number, from: [number, number, number], to: [number, number, number]): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const t = (x + y) / (width + height - 2 || 1);
      for (let c = 0; c < 3; c++) {
        raw[row + 1 + x * 3 + c] = Math.round((from[c] as number) + ((to[c] as number) - (from[c] as number)) * t);
      }
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A one-page PDF with lines of Helvetica text. ASCII only. */
export function pdf(title: string, lines: readonly string[]): Uint8Array {
  const esc = (s: string) => s.replace(/([\\()])/g, "\\$1");
  const content = [
    "BT",
    "/F1 18 Tf",
    "72 760 Td",
    `(${esc(title)}) Tj`,
    "/F1 11 Tf",
    "0 -28 Td",
    ...lines.flatMap((l) => [`(${esc(l)}) Tj`, "0 -16 Td"]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Title (${esc(title)}) /Producer (Postern dev seed) >>`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
  organizer: Address;
  attendees: Address[];
  stamp: Date;
}

export function ics(method: string, e: CalendarEvent): string {
  const fold = (line: string) => {
    const out: string[] = [];
    for (let s = line; s.length; s = s.slice(73)) out.push((out.length ? " " : "") + s.slice(0, 73));
    return out.join("\r\n");
  };
  const text = (s: string) => s.replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n");
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Postern//dev seed//EN",
      `METHOD:${method}`,
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${icsDate(e.stamp)}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${text(e.summary)}`,
      `LOCATION:${text(e.location)}`,
      `DESCRIPTION:${text(e.description)}`,
      `ORGANIZER;CN=${e.organizer.name ?? e.organizer.email}:mailto:${e.organizer.email}`,
      ...e.attendees.map(
        (a) => `ATTENDEE;CN=${a.name ?? a.email};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`,
      ),
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}

/** At least `bytes` of deterministic CSV: sensor readings. */
export function largeCsv(bytes: number, seed: number): string {
  const rand = prng(seed);
  const sites = ["north-gate", "pump-house", "east-field", "weir", "boathouse", "orchard"];
  const rows: string[] = ["timestamp,site,sensor,temperature_c,humidity_pct,flow_l_min"];
  let size = (rows[0] as string).length + 1;
  let t = Date.UTC(2026, 6, 1);
  while (size < bytes) {
    const row =
      `${new Date(t).toISOString()},${pick(rand, sites)},s${String(Math.floor(rand() * 64)).padStart(2, "0")},` +
      `${(8 + rand() * 20).toFixed(2)},${(30 + rand() * 60).toFixed(1)},${(rand() * 400).toFixed(3)}`;
    rows.push(row);
    size += row.length + 1;
    t += 15_000;
  }
  return rows.join("\n") + "\n";
}
