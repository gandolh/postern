// A browser-level stand-in for Stalwart, for the redesign's screenshots and the Floor checks (focus ring, reduced
// motion, 390 overflow). It answers `/webmail-api` through `page.route`: the token and userinfo calls, the JMAP
// session, the mailboxes, and the threads, taken from the seed in dev/seed (never a real mailbox, never Ward). The
// event stream is held open, so the live banner stays out of the way. Any other `/webmail-api` request fails the test.

import type { Page, Route } from "@playwright/test";
import { allEmails } from "../../../dev/seed/fixtures.ts";
import type { SeedEmail } from "../../../dev/seed/types.ts";

type Json = Record<string, unknown>;

const ACCOUNT = "b";
const ROLE_NAMES: Record<string, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  junk: "Spam",
  trash: "Trash",
  archive: "Archive",
};
const ROLE_ORDER = ["inbox", "sent", "drafts", "junk", "trash", "archive"];

// ---------------------------------------------------------------- a small MIME reader

interface Leaf {
  partId: string;
  type: string;
  name: string | null;
  cid: string | null;
  disposition: string | null;
  size: number;
  value: string | null;
}

function headerOf(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of block.replace(/\r\n[ \t]+/g, " ").split("\r\n")) {
    const i = line.indexOf(":");
    if (i > 0) map.set(line.slice(0, i).toLowerCase(), line.slice(i + 1).trim());
  }
  return map;
}

function decodeBody(body: string, encoding: string): Buffer {
  if (encoding === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64");
  if (encoding === "quoted-printable") {
    const joined = body.replace(/=\r\n/g, "");
    const bytes: number[] = [];
    for (let i = 0; i < joined.length; i++) {
      if (joined[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
        bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
        i += 2;
      } else bytes.push(...Buffer.from(joined[i] as string, "utf8"));
    }
    return Buffer.from(bytes);
  }
  return Buffer.from(body, "utf8");
}

function decodeWords(value: string): string {
  return value.replace(/=\?UTF-8\?B\?([^?]+)\?=(\s+(?==\?UTF-8))?/gi, (_m, b64: string) =>
    Buffer.from(b64, "base64").toString("utf8"),
  );
}

function walk(raw: string, partId: string, out: Leaf[]): void {
  const split = raw.indexOf("\r\n\r\n");
  const head = headerOf(split < 0 ? raw : raw.slice(0, split));
  const body = split < 0 ? "" : raw.slice(split + 4);
  const type = (head.get("content-type") ?? "text/plain").split(";")[0]?.trim().toLowerCase() ?? "text/plain";
  if (type.startsWith("multipart/")) {
    const boundary = /boundary="?([^";]+)"?/i.exec(head.get("content-type") ?? "")?.[1];
    if (!boundary) return;
    const pieces = body.split(`--${boundary}`).slice(1);
    let n = 0;
    for (const piece of pieces) {
      if (piece.startsWith("--")) break;
      n += 1;
      walk(piece.replace(/^\r\n/, "").replace(/\r\n$/, ""), partId ? `${partId}.${n}` : String(n), out);
    }
    return;
  }
  const bytes = decodeBody(body, (head.get("content-transfer-encoding") ?? "7bit").toLowerCase());
  const disposition = head.get("content-disposition")?.split(";")[0]?.trim().toLowerCase() ?? null;
  const name =
    /name="?([^";]+)"?/i.exec(head.get("content-disposition") ?? "")?.[1] ??
    /name="?([^";]+)"?/i.exec(head.get("content-type") ?? "")?.[1] ??
    null;
  const text = type === "text/plain" || type === "text/html";
  out.push({
    partId: partId || "1",
    type,
    name,
    cid: head.get("content-id")?.replace(/[<>]/g, "") ?? null,
    disposition,
    size: bytes.length,
    value: text && disposition !== "attachment" ? bytes.toString("utf8") : null,
  });
}

// ---------------------------------------------------------------- the mailbox

interface Entry {
  id: string;
  seed: SeedEmail;
  threadId: string;
}

interface Parsed {
  email: Json;
  leaves: Leaf[];
}

function addresses(value: string | undefined): Array<{ name: string | null; email: string }> | null {
  if (!value) return null;
  return decodeWords(value)
    .split(/,\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((part) => {
      const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(part);
      return m ? { name: m[1]?.trim() || null, email: m[2] as string } : { name: null, email: part.trim() };
    });
}

export class Desk {
  readonly entries: Entry[];
  readonly mailboxes: Array<Json & { id: string; key: string }>;
  readonly unhandled: string[] = [];
  #parsed = new Map<string, Parsed>();

  constructor() {
    const seeds = allEmails().filter((e) => e.account === "alice");
    const threads = new Map<string, string>();
    this.entries = seeds
      .map((seed, i) => {
        if (!threads.has(seed.thread)) threads.set(seed.thread, `t${threads.size}`);
        return { id: `e${i}`, seed, threadId: threads.get(seed.thread) as string };
      })
      .sort((a, b) => b.seed.receivedAt.getTime() - a.seed.receivedAt.getTime());
    const keys = new Set<string>();
    for (const e of this.entries) for (const m of e.seed.mailboxes) keys.add(m);
    const roles = ROLE_ORDER.filter((r) => keys.has(r) || r === "drafts" || r === "junk" || r === "trash");
    const labels = [...keys].filter((k) => k.startsWith("label:") && !/hostile/i.test(k)).sort();
    const everyParent = new Set<string>();
    for (const l of labels) {
      const parts = l.slice(6).split("/");
      for (let i = 1; i < parts.length; i++) everyParent.add(`label:${parts.slice(0, i).join("/")}`);
    }
    const all = [...roles, ...new Set([...labels, ...everyParent])];
    this.mailboxes = all.map((key, i) => this.#mailbox(key, i));
  }

  #mailbox(key: string, sortOrder: number): Json & { id: string; key: string } {
    const isLabel = key.startsWith("label:");
    const path = isLabel ? key.slice(6).split("/") : [key];
    const here = this.entries.filter((e) => e.seed.mailboxes.includes(key as never));
    const unread = here.filter((e) => !e.seed.keywords.includes("$seen"));
    return {
      key,
      id: `mb-${key.replace(/[^a-z0-9]+/gi, "-")}`,
      name: isLabel ? (path[path.length - 1]) : (ROLE_NAMES[key]),
      parentId: path.length > 1 ? `mb-${("label:" + path.slice(0, -1).join("/")).replace(/[^a-z0-9]+/gi, "-")}` : null,
      role: isLabel ? null : key,
      sortOrder,
      totalEmails: here.length,
      unreadEmails: unread.length,
      totalThreads: new Set(here.map((e) => e.threadId)).size,
      unreadThreads: new Set(unread.map((e) => e.threadId)).size,
      myRights: {
        mayReadItems: true,
        mayAddItems: true,
        mayRemoveItems: true,
        maySetSeen: true,
        maySetKeywords: true,
        mayCreateChild: true,
        mayRename: true,
        mayDelete: true,
        maySubmit: true,
      },
      isSubscribed: true,
    };
  }

  #mailboxId(key: string): string | undefined {
    return this.mailboxes.find((m) => m.key === key)?.id;
  }

  #parse(entry: Entry): Parsed {
    const cached = this.#parsed.get(entry.id);
    if (cached) return cached;
    const raw = entry.seed.build();
    const split = raw.indexOf("\r\n\r\n");
    const head = headerOf(raw.slice(0, split));
    const leaves: Leaf[] = [];
    walk(raw, "", leaves);
    const text = leaves.find((l) => l.type === "text/plain" && l.value !== null);
    const html = leaves.find((l) => l.type === "text/html" && l.value !== null);
    const attachments = leaves.filter((l) => l.value === null && (l.disposition === "attachment" || l.name));
    const preview = (text?.value ?? (html?.value ?? "").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 256);
    const part = (l: Leaf): Json => ({
      partId: l.value !== null ? l.partId : null,
      blobId: `b-${entry.id}-${l.partId}`,
      size: l.size,
      name: l.name,
      type: l.type,
      charset: l.value !== null ? "utf-8" : null,
      disposition: l.disposition,
      cid: l.cid,
      language: null,
      location: null,
      headers: [],
      subParts: null,
    });
    const bodyValues: Json = {};
    for (const l of leaves)
      if (l.value !== null) bodyValues[l.partId] = { value: l.value, isEncodingProblem: false, isTruncated: false };
    const messageId = head.get("message-id")?.replace(/[<>]/g, "");
    const inReplyTo = head.get("in-reply-to");
    const subjectRaw = head.get("subject");
    const email: Json = {
      id: entry.id,
      blobId: `b-${entry.id}`,
      threadId: entry.threadId,
      mailboxIds: Object.fromEntries(
        entry.seed.mailboxes.map((m) => [this.#mailboxId(m), true]).filter(([k]) => k !== undefined),
      ),
      keywords: Object.fromEntries(entry.seed.keywords.map((k) => [k, true])),
      size: raw.length,
      receivedAt: entry.seed.receivedAt.toISOString().replace(".000Z", "Z"),
      messageId: messageId ? [messageId] : null,
      inReplyTo: inReplyTo ? [inReplyTo.replace(/[<>]/g, "")] : null,
      references:
        head
          .get("references")
          ?.split(/\s+/)
          .map((r) => r.replace(/[<>]/g, "")) ?? null,
      sender: null,
      from: addresses(head.get("from")),
      to: addresses(head.get("to")),
      cc: addresses(head.get("cc")),
      bcc: null,
      replyTo: null,
      subject: subjectRaw ? decodeWords(subjectRaw) : null,
      sentAt: entry.seed.receivedAt.toISOString().replace(".000Z", "Z"),
      headers: [...head].map(([name, value]) => ({ name, value })),
      hasAttachment: attachments.length > 0,
      preview,
      bodyValues,
      textBody: text ? [part(text)] : html ? [part(html)] : [],
      htmlBody: html ? [part(html)] : text ? [part(text)] : [],
      attachments: attachments.map(part),
      bodyStructure: part(html ?? text ?? (leaves[0] as Leaf)),
    };
    const parsed = { email, leaves };
    this.#parsed.set(entry.id, parsed);
    return parsed;
  }

  #matches(entry: Entry, filter: Json | undefined): boolean {
    if (!filter) return true;
    if (Array.isArray(filter["conditions"])) {
      const parts = (filter["conditions"] as Json[]).map((c) => this.#matches(entry, c));
      if (filter["operator"] === "OR") return parts.some(Boolean);
      if (filter["operator"] === "NOT") return !parts.some(Boolean);
      return parts.every(Boolean);
    }
    const mailboxId = filter["inMailbox"] as string | undefined;
    if (mailboxId) {
      const key = this.mailboxes.find((m) => m.id === mailboxId)?.key;
      if (!key || !entry.seed.mailboxes.includes(key as never)) return false;
    }
    const other = filter["inMailboxOtherThan"] as string[] | undefined;
    if (other && entry.seed.mailboxes.every((m) => other.includes(this.#mailboxId(m) as string))) return false;
    if (typeof filter["hasKeyword"] === "string" && !entry.seed.keywords.includes(filter["hasKeyword"])) return false;
    if (typeof filter["notKeyword"] === "string" && entry.seed.keywords.includes(filter["notKeyword"])) return false;
    if (typeof filter["text"] === "string") {
      const hay = JSON.stringify([
        (this.#parse(entry).email)["subject"],
        (this.#parse(entry).email)["preview"],
      ]);
      if (!hay.toLowerCase().includes(filter["text"].toLowerCase())) return false;
    }
    if (
      typeof filter["hasAttachment"] === "boolean" &&
      (this.#parse(entry).email["hasAttachment"] as boolean) !== filter["hasAttachment"]
    )
      return false;
    return true;
  }

  #query(args: Json): Json {
    const filter = args["filter"] as Json | undefined;
    let list = this.entries.filter((e) => this.#matches(e, filter));
    if (args["collapseThreads"]) {
      const seen = new Set<string>();
      list = list.filter((e) => (seen.has(e.threadId) ? false : (seen.add(e.threadId), true)));
    }
    const position = Number(args["position"] ?? 0);
    const limit = Number(args["limit"] ?? 50);
    return {
      accountId: ACCOUNT,
      queryState: "s1",
      canCalculateChanges: false,
      position,
      ids: list.slice(position, position + limit).map((e) => e.id),
      total: list.length,
      limit,
    };
  }

  #pick(object: Json, properties: string[] | null | undefined): Json {
    if (!properties) return object;
    const out: Json = { id: object["id"] };
    for (const p of properties) if (p in object) out[p] = object[p];
    return out;
  }

  #handle(name: string, args: Json): Json | { error: string } {
    const ids = args["ids"] as string[] | null | undefined;
    const properties = args["properties"] as string[] | null | undefined;
    switch (name) {
      case "Mailbox/get": {
        const list = this.mailboxes
          .filter((m) => !ids || ids.includes(m.id))
          .map(({ key: _k, ...rest }) => this.#pick(rest, properties));
        return { accountId: ACCOUNT, state: "s1", list, notFound: [] };
      }
      case "Mailbox/query":
        return {
          accountId: ACCOUNT,
          queryState: "s1",
          canCalculateChanges: false,
          position: 0,
          ids: this.mailboxes.map((m) => m.id),
          total: this.mailboxes.length,
        };
      case "Email/query":
        return this.#query(args);
      case "Email/get": {
        const found = (ids ?? []).map((id) => this.entries.find((e) => e.id === id)).filter((e): e is Entry => !!e);
        return {
          accountId: ACCOUNT,
          state: "s1",
          list: found.map((e) => this.#pick(this.#parse(e).email, properties)),
          notFound: (ids ?? []).filter((id) => !this.entries.some((e) => e.id === id)),
        };
      }
      case "Thread/get": {
        const list = (ids ?? []).map((id) => ({
          id,
          emailIds: this.entries
            .filter((e) => e.threadId === id)
            .sort((a, b) => a.seed.receivedAt.getTime() - b.seed.receivedAt.getTime())
            .map((e) => e.id),
        }));
        return {
          accountId: ACCOUNT,
          state: "s1",
          list: list.filter((t) => t.emailIds.length),
          notFound: list.filter((t) => !t.emailIds.length).map((t) => t.id),
        };
      }
      case "Identity/get":
        return {
          accountId: ACCOUNT,
          state: "s1",
          list: [
            {
              id: "i1",
              name: "Alice Archer",
              email: "alice@postern.test",
              replyTo: null,
              bcc: null,
              textSignature: "",
              htmlSignature: "",
              mayDelete: false,
            },
          ],
          notFound: [],
        };
      case "SearchSnippet/get":
        return {
          accountId: ACCOUNT,
          list: (ids ?? []).map((emailId) => ({ emailId, subject: null, preview: null })),
          notFound: [],
        };
      case "VacationResponse/get":
        return {
          accountId: ACCOUNT,
          state: "s1",
          list: [
            {
              id: "singleton",
              isEnabled: false,
              fromDate: null,
              toDate: null,
              subject: null,
              textBody: null,
              htmlBody: null,
            },
          ],
          notFound: [],
        };
      default:
        break;
    }
    if (name.endsWith("/get")) return { accountId: ACCOUNT, state: "s1", list: [], notFound: [] };
    if (name.endsWith("/query"))
      return { accountId: ACCOUNT, queryState: "s1", canCalculateChanges: false, position: 0, ids: [], total: 0 };
    if (name.endsWith("/changes") || name.endsWith("/queryChanges")) return { error: "cannotCalculateChanges" };
    if (name.endsWith("/set")) {
      const update = (args["update"] as Json | null | undefined) ?? {};
      return {
        accountId: ACCOUNT,
        oldState: "s1",
        newState: "s1",
        created: null,
        updated: Object.fromEntries(Object.keys(update).map((k) => [k, null])),
        destroyed: (args["destroy"]) ?? null,
      };
    }
    this.unhandled.push(name);
    return { error: "unknownMethod" };
  }

  /** One JMAP request body to its response, resolving back-references. */
  respond(body: { methodCalls: Array<[string, Json, string]> }): Json {
    const results = new Map<string, { name: string; value: Json }>();
    const out: unknown[] = [];
    for (const [name, rawArgs, tag] of body.methodCalls) {
      const args: Json = { ...rawArgs };
      for (const key of Object.keys(args)) {
        if (!key.startsWith("#")) continue;
        const ref = args[key] as { resultOf: string; path: string };
        delete args[key];
        const source = results.get(ref.resultOf)?.value;
        args[key.slice(1)] = source ? resolve(source, ref.path) : [];
      }
      const result = this.#handle(name, args);
      if ("error" in result && typeof result["error"] === "string") {
        out.push(["error", { type: result["error"] }, tag]);
      } else {
        results.set(tag, { name, value: result });
        out.push([name, result, tag]);
      }
    }
    return { methodResponses: out, sessionState: "ss1" };
  }
}

function resolve(value: unknown, path: string): unknown {
  let current: unknown[] = [value];
  for (const seg of path.split("/").slice(1)) {
    const next: unknown[] = [];
    for (const c of current) {
      if (seg === "*") next.push(...(Array.isArray(c) ? c : []));
      else if (c && typeof c === "object") {
        const v = (c as Json)[seg];
        if (Array.isArray(v) && path.includes("*")) next.push(v);
        else next.push(v);
      }
    }
    current = next;
  }
  const flat = current.flat();
  return path.includes("*") ? flat : current[0];
}

// ---------------------------------------------------------------- the routes

const SESSION = {
  capabilities: {
    "urn:ietf:params:jmap:core": {
      maxSizeUpload: 50000000,
      maxConcurrentUpload: 4,
      maxSizeRequest: 10000000,
      maxConcurrentRequests: 4,
      maxCallsInRequest: 16,
      maxObjectsInGet: 500,
      maxObjectsInSet: 500,
      collationAlgorithms: ["i;ascii-casemap", "i;unicode-casemap"],
    },
    "urn:ietf:params:jmap:mail": {},
    "urn:ietf:params:jmap:contacts": {},
    "urn:ietf:params:jmap:submission": {},
    "urn:ietf:params:jmap:vacationresponse": {},
    "urn:ietf:params:jmap:sieve": {},
    "urn:ietf:params:jmap:blob": {},
  },
  accounts: {
    [ACCOUNT]: {
      name: "alice@postern.test",
      isPersonal: true,
      isReadOnly: false,
      accountCapabilities: {
        "urn:ietf:params:jmap:mail": { maxMailboxDepth: 10, maxSizeMailboxName: 255, mayCreateTopLevelMailbox: true },
        "urn:ietf:params:jmap:submission": { maxDelayedSend: 2592000 },
        "urn:ietf:params:jmap:contacts": {},
        "urn:ietf:params:jmap:sieve": { maxSizeScript: 102400, maxNumberScripts: 100, sieveExtensions: ["fileinto"] },
        "urn:ietf:params:jmap:vacationresponse": {},
      },
    },
  },
  primaryAccounts: {
    "urn:ietf:params:jmap:mail": ACCOUNT,
    "urn:ietf:params:jmap:submission": ACCOUNT,
    "urn:ietf:params:jmap:contacts": ACCOUNT,
    "urn:ietf:params:jmap:vacationresponse": ACCOUNT,
    "urn:ietf:params:jmap:sieve": ACCOUNT,
    "urn:ietf:params:jmap:blob": ACCOUNT,
  },
  username: "alice@postern.test",
  apiUrl: "https://mail.postern.test/jmap/",
  downloadUrl: "https://mail.postern.test/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
  uploadUrl: "https://mail.postern.test/jmap/upload/{accountId}/",
  eventSourceUrl: "https://mail.postern.test/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
  state: "ss1",
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

export const THE_DAY = new Date("2026-10-01T10:30:00Z");

/** Sign a stored session in, route `/webmail-api` to the stub, and freeze the clock. Returns the stub. */
export async function openDesk(page: Page, options: { signedIn?: boolean; desk?: Desk } = {}): Promise<Desk> {
  const desk = options.desk ?? new Desk();
  await page.clock.setFixedTime(THE_DAY);
  if (options.signedIn !== false) {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("desk-seeded")) {
        sessionStorage.setItem(
          "postern.session",
          JSON.stringify({
            version: 1,
            refreshToken: "stub-refresh",
            username: "alice@postern.test",
            name: "Alice Archer",
            lastActivity: Date.now(),
          }),
        );
        sessionStorage.setItem("desk-seeded", "1");
      }
    });
  }
  await page.route("**/webmail-api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/webmail-api/, "");
    if (path === "/auth/token")
      return json(route, {
        access_token: "stub-access",
        refresh_token: "stub-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      });
    if (path === "/auth/userinfo")
      return json(route, { sub: ACCOUNT, email: "alice@postern.test", name: "Alice Archer" });
    if (path === "/jmap/session") return json(route, SESSION);
    if (path.startsWith("/jmap/eventsource")) {
      // Held open: the reader stays "connecting", so no "Reconnecting..." pill shows in a shot.
      await new Promise((done) => setTimeout(done, 120_000));
      return route.abort("failed").catch(() => undefined);
    }
    if (path === "/jmap/" || path === "/jmap") {
      return json(
        route,
        desk.respond(route.request().postDataJSON() as { methodCalls: Array<[string, Json, string]> }),
      );
    }
    desk.unhandled.push(`${route.request().method()} ${path}`);
    return route.abort("failed");
  });
  return desk;
}
