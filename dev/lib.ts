// Shared by dev/accounts.ts and dev/seed.ts: dev/.env, the two accounts, and
// a few lines of raw JMAP over fetch. Brief 03's client does not exist yet,
// and these scripts must not depend on it anyway: they build the server the
// client is tested against.
//
// Runs on plain `node` (type stripping), so only erasable TypeScript here.

import { existsSync } from "node:fs";
import { join } from "node:path";

export const DEV_DIR = import.meta.dirname;
export const ENV_FILE = join(DEV_DIR, ".env");

/** Where Stalwart's HTTP listener is published. Override with POSTERN_DEV_API. */
export const BASE_URL = (process.env.POSTERN_DEV_API ?? "http://127.0.0.1:18080").replace(/\/+$/, "");

export const DOMAIN = "postern.test";

export interface DevAccount {
  /** The local part: alice, bob. */
  name: "alice" | "bob";
  email: string;
  displayName: string;
  /** The dev/.env key holding the password. */
  passwordKey: "ALICE_PASSWORD" | "BOB_PASSWORD";
}

export const ACCOUNTS: readonly DevAccount[] = [
  { name: "alice", email: `alice@${DOMAIN}`, displayName: "Alice Archer", passwordKey: "ALICE_PASSWORD" },
  { name: "bob", email: `bob@${DOMAIN}`, displayName: "Bob Baker", passwordKey: "BOB_PASSWORD" },
];

export function loadDevEnv(): void {
  if (!existsSync(ENV_FILE)) {
    fail("dev/.env is missing. Run `npm run dev:mail` first; it writes the passwords there.");
  }
  process.loadEnvFile(ENV_FILE);
}

export function passwordFor(account: DevAccount): string {
  const value = process.env[account.passwordKey];
  if (!value) fail(`${account.passwordKey} is not set in dev/.env. Run \`npm run dev:mail\`.`);
  return value;
}

export function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

export const USING = [
  "urn:ietf:params:jmap:core",
  "urn:ietf:params:jmap:mail",
  "urn:ietf:params:jmap:submission",
];

export type Invocation = [name: string, args: Record<string, unknown>, callId: string];

/**
 * A signed-in JMAP connection for one account, with Basic auth.
 *
 * Stalwart's session advertises absolute URLs built from its hostname
 * (`https://mail.postern.test/jmap/...`), which do not resolve here. Every
 * request is therefore made against BASE_URL with the standard paths, and only
 * the account id is taken from the session.
 */
export class Jmap {
  readonly account: DevAccount;
  readonly accountId: string;
  readonly #auth: string;

  private constructor(account: DevAccount, accountId: string, auth: string) {
    this.account = account;
    this.accountId = accountId;
    this.#auth = auth;
  }

  static async connect(account: DevAccount): Promise<Jmap> {
    const auth = "Basic " + Buffer.from(`${account.email}:${passwordFor(account)}`).toString("base64");
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/jmap/session`, { headers: { authorization: auth } });
    } catch (err) {
      fail(`cannot reach Stalwart at ${BASE_URL} (${(err as Error).message}). Is it running? \`npm run dev:mail\``);
    }
    if (res.status === 401) {
      fail(
        `${account.email} does not sign in with ${account.passwordKey} from dev/.env. ` +
          "The store in dev/data was made with another dev/.env. " +
          "Start over with `npm run dev:mail:reset && npm run dev:mail`.",
      );
    }
    if (!res.ok) fail(`GET /jmap/session as ${account.email}: HTTP ${res.status}`);
    const session = (await res.json()) as { primaryAccounts: Record<string, string> };
    const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];
    if (!accountId) fail(`no mail account in ${account.email}'s session`);
    return new Jmap(account, accountId, auth);
  }

  /** One JMAP request. Throws on any method-level error. */
  async call(methodCalls: Invocation[]): Promise<Invocation[]> {
    const res = await fetch(`${BASE_URL}/jmap/`, {
      method: "POST",
      headers: { authorization: this.#auth, "content-type": "application/json" },
      body: JSON.stringify({ using: USING, methodCalls }),
    });
    if (!res.ok) throw new Error(`POST /jmap/ as ${this.account.email}: HTTP ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { methodResponses: Invocation[] };
    for (const [name, args] of body.methodResponses) {
      if (name === "error") throw new Error(`JMAP error as ${this.account.email}: ${JSON.stringify(args)}`);
    }
    return body.methodResponses;
  }

  /** One call, returning its arguments. */
  async one<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T> {
    const [first] = await this.call([[name, { accountId: this.accountId, ...args }, "0"]]);
    if (!first) throw new Error(`${name}: empty response`);
    return first[1] as T;
  }

  async upload(body: Uint8Array | string, type: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/jmap/upload/${this.accountId}/`, {
      method: "POST",
      headers: { authorization: this.#auth, "content-type": type },
      body,
    });
    if (!res.ok) throw new Error(`upload as ${this.account.email}: HTTP ${res.status} ${await res.text()}`);
    return ((await res.json()) as { blobId: string }).blobId;
  }
}

export interface MailboxInfo {
  id: string;
  name: string;
  parentId: string | null;
  role: string | null;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
}

export async function getMailboxes(jmap: Jmap): Promise<MailboxInfo[]> {
  const res = await jmap.one<{ list: MailboxInfo[] }>("Mailbox/get", {
    properties: ["name", "parentId", "role", "totalEmails", "unreadEmails", "totalThreads", "unreadThreads"],
  });
  return res.list;
}

/** A label's path from the root, "Work/Clients", as IMAP shows it. */
export function mailboxPath(mailbox: MailboxInfo, all: readonly MailboxInfo[]): string {
  const parts = [mailbox.name];
  let parent = mailbox.parentId;
  while (parent) {
    const p = all.find((m) => m.id === parent);
    if (!p) break;
    parts.unshift(p.name);
    parent = p.parentId;
  }
  return parts.join("/");
}
