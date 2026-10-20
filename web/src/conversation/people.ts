// Senders and recipients as the cards show them, and the warnings about
// them. Pure.
//
// The real address is always shown next to the display name. A display
// name that is itself an e-mail address different from the real one
// ("security@bank.example.com" <attacker@evil.test>) is flagged.

import type { EmailAddress } from "@postern/jmap";

/** The display name, cleaned of stray quotes; "" when there is none. */
export function displayName(address: EmailAddress): string {
  return (address.name ?? "").replace(/^["'\s]+|["'\s]+$/g, "").trim();
}

const ADDRESS_IN_NAME = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/;

/** The address a display name pretends to be, when it differs from the real one. */
export function forgedAddressInName(address: EmailAddress): string | null {
  const m = ADDRESS_IN_NAME.exec(displayName(address));
  if (!m) return null;
  const claimed = m[0].replace(/[.,;:]+$/, "").toLowerCase();
  return claimed === address.email.toLowerCase() ? null : claimed;
}

/** "Bob Baker" or the address when there is no name. */
export function nameOrAddress(address: EmailAddress): string {
  return displayName(address) || address.email;
}

/** "me" for the signed-in address, else the first name (or the local part). */
export function shortName(address: EmailAddress, me: string): string {
  if (address.email.toLowerCase() === me.toLowerCase()) return "me";
  const name = displayName(address);
  if (name && !ADDRESS_IN_NAME.test(name)) return name.split(/\s+/)[0] ?? name;
  return address.email.split("@")[0] ?? address.email;
}

/** "to me, Carol, dave@x.test" — the recipients line under a sender. */
export function recipientsLine(to: readonly EmailAddress[] | null | undefined, cc: readonly EmailAddress[] | null | undefined, me: string): string {
  const all = [...(to ?? []), ...(cc ?? [])];
  if (all.length === 0) return "to undisclosed recipients";
  const names = all.map((a) => shortName(a, me));
  return `to ${names.join(", ")}`;
}

/** "Bob Baker <bob@x.test>" for the details panel. */
export function fullAddress(address: EmailAddress): string {
  const name = displayName(address);
  return name ? `${name} <${address.email}>` : address.email;
}

export interface AuthenticationSummary {
  /** The server that checked: the authserv-id of the header. */
  checkedBy: string | null;
  /** SPF's envelope sender domain when SPF passed: Gmail's "mailed-by". */
  mailedBy: string | null;
  /** DKIM's signing domain when DKIM passed: Gmail's "signed-by". */
  signedBy: string | null;
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
}

/**
 * Read the topmost Authentication-Results header (RFC 8601), the one the
 * receiving server (Stalwart) wrote. Lower ones may come from the sender and
 * are not trusted.
 */
export function readAuthenticationResults(headers: readonly string[]): AuthenticationSummary | null {
  const header = headers[0];
  if (!header) return null;
  const parts = header.replace(/\([^)]*\)/g, " ").split(";").map((p) => p.trim()).filter(Boolean);
  const checkedBy = parts[0] && !/=/.test(parts[0]) ? (parts[0].split(/\s+/)[0] ?? null) : null;
  const result = (method: string): { result: string; props: Record<string, string> } | null => {
    for (const p of parts) {
      const m = new RegExp(`^${method}\\s*=\\s*(\\w+)(.*)$`, "i").exec(p);
      if (!m) continue;
      const props: Record<string, string> = {};
      for (const kv of (m[2] as string).matchAll(/([\w.-]+)\s*=\s*("[^"]*"|[^\s;]+)/g)) props[(kv[1] as string).toLowerCase()] = (kv[2] as string).replace(/^"|"$/g, "");
      return { result: (m[1] as string).toLowerCase(), props };
    }
    return null;
  };
  const spf = result("spf");
  const dkim = result("dkim");
  const dmarc = result("dmarc");
  const domainOf = (value: string | undefined) => (value ? (value.includes("@") ? (value.split("@").pop() ?? value) : value).toLowerCase() : null);
  return {
    checkedBy,
    mailedBy: spf?.result === "pass" ? domainOf(spf.props["smtp.mailfrom"] ?? spf.props["smtp.helo"]) : null,
    signedBy: dkim?.result === "pass" ? domainOf(dkim.props["header.d"] ?? dkim.props["header.i"]) : null,
    spf: spf?.result ?? null,
    dkim: dkim?.result ?? null,
    dmarc: dmarc?.result ?? null,
  };
}
