// The hostile set: each .eml under dev/seed/hostile/ is filed in alice's
// Inbox and in her "Hostile" label, so brief 17 can find them by label or by
// the X-Postern-Fixture header. Calendar invites (brief 25) sit in
// hostile/invites/ and come after the rest: their danger is in the .ics the
// invite card reads, not in an HTML body for the sanitiser's own fixture test
// (web/src/render/), which reads hostile/*.eml only. The files are read as-is (they are the exact
// bytes under test); this module only attaches the mailboxes, keywords and a
// deterministic receivedAt, and reads back the slug and Message-ID.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { daysBefore } from "./types.ts";
import type { SeedEmail } from "./types.ts";

const HOSTILE_DIR = join(import.meta.dirname, "hostile");

/** The label every hostile fixture also lives in. */
export const HOSTILE_LABEL = "Hostile";
/** The header every hostile fixture carries: `hostile/<slug>`. */
export const HOSTILE_HEADER = "X-Postern-Fixture";

function headerValue(raw: string, name: string): string {
  const headerEnd = raw.indexOf("\n\n") === -1 ? raw.indexOf("\r\n\r\n") : raw.indexOf("\n\n");
  const headers = headerEnd === -1 ? raw : raw.slice(0, headerEnd);
  const re = new RegExp(`^${name}:[ \\t]*(.+)$`, "im");
  const m = re.exec(headers);
  if (!m) throw new Error(`hostile fixture has no ${name} header`);
  return (m[1] as string).trim().replace(/^<|>$/g, "");
}

export interface HostileFixture {
  slug: string;
  file: string;
  messageId: string;
}

/** The fixtures, sorted by file for a stable order; the invites after the rest, so the others keep their place. */
export function hostileFixtures(): HostileFixture[] {
  const emls = (dir: string, prefix: string) =>
    readdirSync(join(HOSTILE_DIR, dir))
      .filter((f) => f.endsWith(".eml"))
      .sort()
      .map((f) => `${prefix}${f}`);
  return [...emls("", ""), ...emls("invites", "invites/")]
    .map((file) => {
      const raw = readFileSync(join(HOSTILE_DIR, file), "latin1");
      const marker = headerValue(raw, HOSTILE_HEADER);
      const slug = marker.replace(/^hostile\//, "");
      return { slug, file, messageId: headerValue(raw, "Message-ID") };
    });
}

export function hostile(): SeedEmail[] {
  return hostileFixtures().map((fx, i) => ({
    account: "alice",
    key: `alice/hostile/${fx.slug}`,
    messageId: fx.messageId,
    thread: fx.messageId,
    mailboxes: ["inbox", `label:${HOSTILE_LABEL}`],
    // A couple are unread so the Hostile label shows an unread count.
    keywords: i % 4 === 0 ? [] : ["$seen"],
    receivedAt: daysBefore(30 - i, 7, i * 3),
    hostile: fx.slug,
    build: () => normalise(readFileSync(join(HOSTILE_DIR, fx.file), "latin1")),
  }));
}

/** Mail is CRLF; the committed .eml may be checked out with LF. */
function normalise(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}
