// Email addresses as people type and paste them: "Bob Baker <bob@x.test>,
// carol@x.test; "Smith, Jo" <jo@x.test>". Parsing, validating, formatting and
// comparing. Pure.

import type { EmailAddress } from "../types/mail.js";

/** One address from a typed or pasted list. `valid` is false when `email` is not a usable address. */
export interface ParsedAddress {
  name: string | null;
  email: string;
  valid: boolean;
  /** The text it came from, trimmed: what an invalid chip shows. */
  raw: string;
}

// RFC 5322 dot-atom for the local part, letters of any script allowed
// (RFC 6531; no quoted local parts: nobody types them), and a domain of at
// least two labels with a letter-only top level.
const LOCAL = /^[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+(?:\.[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+)*$/u;
const LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u;
const TLD = /^(?:[\p{L}]{2,63}|xn--[a-z0-9-]{1,59})$/iu;

/** True when `email` is a plain address Postern will send to (`local@domain.tld`). */
export function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !LOCAL.test(local)) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => LABEL.test(l))) return false;
  return TLD.test(labels[labels.length - 1] as string);
}

/** Split a list on commas, semicolons and line breaks, but not inside "quotes" or <angle brackets>. */
export function splitAddressList(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  let angle = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i] as string;
    if (ch === "\\" && quoted && i + 1 < input.length) {
      current += ch + (input[++i] as string);
      continue;
    }
    if (ch === '"' && !angle) quoted = !quoted;
    else if (ch === "<" && !quoted) angle = true;
    else if (ch === ">" && !quoted) angle = false;
    if (!quoted && !angle && (ch === "," || ch === ";" || ch === "\n" || ch === "\r")) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function unquote(name: string): string {
  let n = name.trim();
  if (n.length >= 2 && n.startsWith('"') && n.endsWith('"')) n = n.slice(1, -1).replace(/\\(.)/g, "$1");
  else if (n.length >= 2 && n.startsWith("'") && n.endsWith("'")) n = n.slice(1, -1);
  return n.replace(/\s+/g, " ").trim();
}

/** One address: `Name <a@b>`, `"Name" <a@b>`, `<a@b>`, `a@b`, `a@b (Name)`, `mailto:a@b`. */
export function parseAddress(text: string): ParsedAddress {
  const raw = text.trim();
  let name: string | null = null;
  let email = raw;
  const angle = /^(.*)<([^<>]*)>\s*$/s.exec(raw);
  if (angle) {
    name = unquote(angle[1] as string) || null;
    email = (angle[2] as string).trim();
  } else {
    const comment = /^(\S+@\S+)\s*\(([^()]*)\)\s*$/.exec(raw);
    if (comment) {
      email = comment[1] as string;
      name = unquote(comment[2] as string) || null;
    }
  }
  email = email.replace(/^mailto:/i, "").trim();
  return { name, email, valid: isValidEmail(email), raw };
}

/** Every address in a typed or pasted list, in order, invalid ones included (marked). */
export function parseAddressList(input: string): ParsedAddress[] {
  return splitAddressList(input).map(parseAddress);
}

/** The comparable form of an address: trimmed and lower-cased. */
export function addressKey(email: string): string {
  return email.trim().toLowerCase();
}

/** Same mailbox, ignoring case. */
export function sameAddress(a: string, b: string): boolean {
  return addressKey(a) === addressKey(b);
}

/** Drop repeats (first one wins, case-insensitive) and any address in `exclude`. */
export function dedupeAddresses(list: readonly EmailAddress[], exclude: Iterable<string> = []): EmailAddress[] {
  const seen = new Set<string>();
  for (const e of exclude) seen.add(addressKey(e));
  const out: EmailAddress[] = [];
  for (const a of list) {
    const key = addressKey(a.email);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: a.name, email: a.email.trim() });
  }
  return out;
}

const NEEDS_QUOTES = /[()<>[\]:;@\\,."]/;

/** `Bob Baker <bob@x.test>`, quoting the name when it needs it; the bare address when there is no name. */
export function formatAddress(address: EmailAddress): string {
  const name = address.name?.trim();
  if (!name) return address.email;
  const shown = NEEDS_QUOTES.test(name) ? `"${name.replace(/(["\\])/g, "\\$1")}"` : name;
  return `${shown} <${address.email}>`;
}
