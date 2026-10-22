// Before the browser tests: check the dev Stalwart and the build are there,
// note alice's mailbox, and start Caddy in Docker serving web/dist with the
// production headers (Caddyfile). After them (the returned function): put
// the mailbox back, stop and remove the container, and check the counts.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { labelCounts, manifestCounts, restoreMail, snapshotMail, type LabelCounts } from "./lib/devmail.ts";
import { APP_URL, CADDY_CONTAINER, CADDY_IMAGE, DIST_DIR, E2E_DIR, E2E_PORT, PROBE_PORT } from "./lib/env.ts";

const STALWART = process.env.POSTERN_DEV_API ?? "http://127.0.0.1:18080";

function docker(args: string[], options: { quiet?: boolean } = {}): string {
  return execFileSync("docker", args, { encoding: "utf8", stdio: options.quiet ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "pipe"] });
}

function removeContainer(): void {
  try {
    docker(["rm", "--force", CADDY_CONTAINER], { quiet: true });
  } catch {
    // Not there.
  }
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${url} did not come up (${last})`);
}

function sameCounts(a: LabelCounts, b: LabelCounts): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  try {
    await fetch(`${STALWART}/healthz/live`);
  } catch {
    throw new Error(`The dev Stalwart is not answering at ${STALWART}. Start it with \`npm run dev:mail\` (never reset it for this).`);
  }
  if (!existsSync(join(DIST_DIR, "index.html"))) {
    throw new Error("web/dist is missing. `npm run test:e2e` builds first; run `npm run build` when calling Playwright directly.");
  }

  const snapshot = await snapshotMail();
  const expected = manifestCounts();
  if (!sameCounts(snapshot.counts, expected)) {
    console.warn(
      `[e2e] dev mail differs from dev/seed/manifest.json before the run: ${JSON.stringify(snapshot.counts)} vs ${JSON.stringify(expected)}. ` +
        "The run puts back what it changes, not what was already different.",
    );
  }

  removeContainer();
  const env = process.env.POSTERN_CSP ? ["--env", `POSTERN_CSP=${process.env.POSTERN_CSP}`] : [];
  docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    CADDY_CONTAINER,
    "--publish",
    `127.0.0.1:${E2E_PORT}:80`,
    "--publish",
    `127.0.0.1:${PROBE_PORT}:81`,
    "--add-host",
    "host.docker.internal:host-gateway",
    "--volume",
    `${DIST_DIR}:/srv/webmail:ro`,
    "--volume",
    `${join(E2E_DIR, "Caddyfile")}:/etc/caddy/Caddyfile:ro`,
    ...env,
    CADDY_IMAGE,
  ]);
  try {
    await waitFor(APP_URL, 20_000);
  } catch (err) {
    removeContainer();
    throw err;
  }

  return async () => {
    removeContainer();
    const report = await restoreMail(snapshot);
    const after = await labelCounts();
    console.log(
      `[e2e] dev mail restored: ${report.markedUnread} marked unread again, ${report.draftsRemoved} drafts removed, ${report.identitiesRestored} identities put back; ` +
        `Inbox ${after.inbox.messages}/${after.inbox.threads}/${after.inbox.unreadThreads} unread, ` +
        `Hostile ${after.hostile.messages}/${after.hostile.threads}/${after.hostile.unreadThreads} unread (messages/threads/unread threads).`,
    );
    if (report.unexpected.length > 0) {
      throw new Error(`[e2e] the run created ${report.unexpected.length} message(s) that are not drafts; left in place: ${report.unexpected.join(", ")}`);
    }
    if (!sameCounts(after, snapshot.counts)) {
      throw new Error(`[e2e] counts after the run ${JSON.stringify(after)} differ from before ${JSON.stringify(snapshot.counts)}`);
    }
  };
}
