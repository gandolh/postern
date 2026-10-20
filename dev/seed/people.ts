// The cast of the seed and the helpers every curated message uses.

import { buildMessage, rfc5322Date } from "./mime.ts";
import type { Address, MessageSpec } from "./mime.ts";
import type { MailboxRef, SeedEmail } from "./types.ts";

export type Person = Required<Address>;

export const PEOPLE = {
  alice: { name: "Alice Archer", email: "alice@postern.test" },
  bob: { name: "Bob Baker", email: "bob@postern.test" },
  carol: { name: "Carol Chen", email: "carol.chen@northwind.example.com" },
  dave: { name: "Dave Okafor", email: "dave@okafor.example.org" },
  erin: { name: "Erin Walsh", email: "erin.walsh@example.net" },
  hiro: { name: "Hiro Tanaka", email: "hiro@tanaka.example.net" },
  priya: { name: "Priya Raman", email: "priya@example.org" },
  zoe: { name: "Zoë Müller", email: "zoe@mueller.example.com" },
  sam: { name: "Sam Rivera", email: "sam.rivera@example.com" },
  noor: { name: "Noor Haddad", email: "noor@haddad.example.org" },
  marta: { name: "Marta Kowalski", email: "marta@lettings.example.com" },
} satisfies Record<string, Person>;

export function domainOf(email: string): string {
  return email.slice(email.indexOf("@") + 1);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function paragraphsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function humanDate(d: Date): string {
  return rfc5322Date(d).replace(/:\d\d \+0000$/, " UTC");
}

export interface MessageOptions {
  account: SeedEmail["account"];
  thread?: string;
  mailboxes: MailboxRef[];
  keywords?: string[];
  receivedAt?: Date;
}

/**
 * A SeedEmail from a MessageSpec. Mail from outside postern.test gets the
 * Authentication-Results line Stalwart writes for a clean sender, so "Show
 * original" has something to show.
 */
export function seed(spec: MessageSpec, opts: MessageOptions): SeedEmail {
  const incoming = !spec.from.email.endsWith("@postern.test");
  const d = domainOf(spec.from.email);
  const auth: [string, string] = [
    "Authentication-Results",
    `mail.postern.test; dkim=pass header.d=${d}; spf=pass smtp.mailfrom=${spec.from.email}; dmarc=pass header.from=${d}`,
  ];
  const full: MessageSpec = incoming ? { ...spec, headers: [auth, ...(spec.headers ?? [])] } : spec;
  return {
    account: opts.account,
    key: spec.key,
    messageId: spec.messageId,
    thread: opts.thread ?? spec.messageId,
    mailboxes: opts.mailboxes,
    keywords: opts.keywords ?? ["$seen"],
    receivedAt: opts.receivedAt ?? spec.date,
    build: () => buildMessage(full),
  };
}
