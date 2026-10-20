// Shared by the integration tests: is brief 02's Stalwart up, and clients for
// its accounts. Tests skip (not fail) when the server or dev/.env is missing.
// Passwords come from dev/.env and are never printed.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JmapClient, type AuthProvider } from "../../src/index.js";

const ROOT = new URL("../../../", import.meta.url);
const DEV_ENV = fileURLToPath(new URL("dev/.env", ROOT));

export const BASE = (process.env["POSTERN_DEV_API"] ?? "http://127.0.0.1:18080").replace(/\/+$/, "");

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/jmap/session`, { signal: AbortSignal.timeout(2000) });
    await res.body?.cancel();
    return res.status === 200 || res.status === 401;
  } catch {
    return false;
  }
}

/** True when dev/.env exists and Stalwart answers at BASE. */
export const live = existsSync(DEV_ENV) && (await reachable());
if (live) process.loadEnvFile(DEV_ENV);

export type DevAccount = "alice" | "bob";

/** Basic auth from dev/.env (ALICE_PASSWORD, BOB_PASSWORD). */
export function basicAuth(account: DevAccount): AuthProvider {
  const password = process.env[account === "alice" ? "ALICE_PASSWORD" : "BOB_PASSWORD"];
  if (!password) throw new Error(`${account}'s password is not in dev/.env`);
  const value = `Basic ${btoa(`${account}@postern.test:${password}`)}`;
  return { authorization: () => value, onUnauthorized: () => false };
}

export function devClient(account: DevAccount): JmapClient {
  return new JmapClient({ baseUrl: BASE, auth: basicAuth(account) });
}

interface LabelCounts {
  messages: number;
  threads: number;
  unreadMessages: number;
  unreadThreads: number;
  starredMessages: number;
}

/** dev/seed/manifest.json: the seeded counts per label. */
export const manifest = JSON.parse(readFileSync(new URL("dev/seed/manifest.json", ROOT), "utf8")) as {
  accounts: Record<DevAccount, { email: string; totalMessages: number; totalThreads: number; labels: Record<string, LabelCounts> }>;
};

/** Wait until `check` returns a value, or fail after `timeoutMs`. */
export async function waitFor<T>(check: () => T | undefined, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
