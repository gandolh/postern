// Schedule send (brief 23). Stalwart 0.16.25 holds a submission until a time
// given with SMTP FUTURERELEASE (RFC 4865): `HOLDUNTIL` in the envelope's
// MAIL FROM parameters. It refuses a `sendAt` set by the client. Found against
// the dev Stalwart on 2026-10-27 (corpus/wiki/gmail-on-jmap.md):
//
//   - the submission reads `undoStatus: "pending"` and `sendAt` = the time
//     until then, and the message arrives a few seconds after it, not before;
//   - `undoStatus: "canceled"` stops it (later: `cannotUnsend`);
//   - it survives a restart;
//   - `undoStatus` turns "final" when the message goes, but nothing changes
//     state then and no push comes, so the client has to look.
//
// While it waits the message stays a draft in Drafts with the `$scheduled`
// keyword, out of the Drafts list and never opened in a composer. The
// reconciler files it in Sent once its submission is final, and drops the
// keyword (back to a plain draft) when the submission was canceled or is gone.
//
//   scheduleDraft(client, { emailId, identityId, from, at })
//   cancelScheduled(client, submissionId, emailId)     "canceled" | "sent"
//   listScheduled(client)                              the Scheduled view's rows
//   new ScheduledSync(client, roles, onChange).start() files what went out

import { escapePointer, JmapSetError, type EmailAddress, type Id, type JmapClient, type PatchObject } from "@postern/jmap";
import { sentPatch } from "./submit";

export const SCHEDULED = "$scheduled";
export const SUBMISSION_CAPABILITY = "urn:ietf:params:jmap:submission";

/** How long after its time a message is looked for in the queue again: Stalwart released one 11 s late. */
export const RECONCILE_MARGIN_MS = 15_000;
/** A message past its time and still in the queue (late, or a delivery being retried): look again after this, doubling. */
const OVERDUE_FIRST_MS = 30_000;
const OVERDUE_MAX_MS = 15 * 60_000;

/** The furthest ahead the account may schedule, in ms; 0 when it cannot (no FUTURERELEASE). */
export function maxDelayedSendMs(client: JmapClient): number {
  if (!client.hasSession) return 0;
  const cap = client.session.accountCapability<{ maxDelayedSend?: number }>(SUBMISSION_CAPABILITY, client.session.accountIdFor(SUBMISSION_CAPABILITY));
  const seconds = cap?.maxDelayedSend;
  return typeof seconds === "number" && seconds > 0 ? seconds * 1000 : 0;
}

/** HOLDUNTIL's value: UTC, to the second. */
export function holdUntil(at: Date): string {
  return new Date(Math.ceil(at.getTime() / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---- Choosing a time ------------------------------------------------------------------------

export interface SchedulePreset {
  id: "tomorrow-morning" | "tomorrow-afternoon" | "monday-morning";
  label: string;
  at: Date;
}

function atHour(day: Date, offsetDays: number, hour: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + offsetDays, hour, 0, 0, 0);
}

/** Gmail's three choices, in this browser's time zone: tomorrow 08:00 and 13:00, and the next Monday 08:00. */
export function schedulePresets(now: Date): SchedulePreset[] {
  const toMonday = (8 - now.getDay()) % 7 || 7;
  return [
    { id: "tomorrow-morning", label: "Tomorrow morning", at: atHour(now, 1, 8) },
    { id: "tomorrow-afternoon", label: "Tomorrow afternoon", at: atHour(now, 1, 13) },
    { id: "monday-morning", label: "Monday morning", at: atHour(now, toMonday, 8) },
  ];
}

/** "Wed, Oct 28, 8:00 AM": a send time, in this browser's time zone. */
export function formatSendTime(at: Date | string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(at));
}

/** Why a picked time cannot be used, or null. At least a minute ahead, and no further than the server allows. */
export function checkSendTime(at: Date, now: Date, maxMs: number): string | null {
  if (Number.isNaN(at.getTime())) return "Choose a date and a time.";
  if (at.getTime() < now.getTime() + 60_000) return "Choose a time at least a minute from now.";
  if (maxMs > 0 && at.getTime() > now.getTime() + maxMs) return `Choose a time within ${Math.floor(maxMs / 86_400_000)} days.`;
  return null;
}

// ---- Scheduling and cancelling --------------------------------------------------------------

export interface ScheduleArgs {
  /** The saved draft. */
  emailId: Id;
  identityId: Id;
  /** The identity's address: the envelope's MAIL FROM. */
  from: string;
  at: Date;
}

export interface Scheduled {
  submissionId: Id;
  emailId: Id;
  /** When the server will send it (the submission's `sendAt`). */
  sendAt: string;
}

/** Every recipient of the draft, once each: an envelope given by the client must name them all, Bcc included. */
function envelopeRecipients(email: { to?: EmailAddress[] | null; cc?: EmailAddress[] | null; bcc?: EmailAddress[] | null }): string[] {
  const seen = new Map<string, string>();
  for (const a of [...(email.to ?? []), ...(email.cc ?? []), ...(email.bcc ?? [])]) {
    const address = a.email.trim();
    if (address && !seen.has(address.toLowerCase())) seen.set(address.toLowerCase(), address);
  }
  return [...seen.values()];
}

/**
 * Hand a saved draft to the server to send at `at`. It stays in Drafts with
 * `$scheduled`. @throws JmapSetError when the server refuses (the draft stays as it was).
 */
export async function scheduleDraft(client: JmapClient, args: ScheduleArgs, signal?: AbortSignal): Promise<Scheduled> {
  const got = await client.call("Email/get", { ids: [args.emailId], properties: ["to", "cc", "bcc"] }, { signal });
  const email = got.list[0];
  if (!email) throw new JmapSetError("EmailSubmission/set", "send", { type: "notFound", description: "The draft is gone" });
  const rcptTo = envelopeRecipients(email).map((address) => ({ email: address, parameters: null }));
  if (rcptTo.length === 0) throw new JmapSetError("EmailSubmission/set", "send", { type: "noRecipients", description: "The message has no recipients" });
  const res = await client.call(
    "EmailSubmission/set",
    {
      create: {
        send: {
          identityId: args.identityId,
          emailId: args.emailId,
          envelope: { mailFrom: { email: args.from, parameters: { HOLDUNTIL: holdUntil(args.at) } }, rcptTo },
        },
      },
      onSuccessUpdateEmail: { "#send": { [`keywords/${escapePointer(SCHEDULED)}`]: true } },
    },
    { signal },
  );
  const refused = res.notCreated?.["send"];
  if (refused) throw new JmapSetError("EmailSubmission/set", "send", refused);
  const created = res.created?.["send"];
  if (!created?.id) throw new JmapSetError("EmailSubmission/set", "send", { type: "serverFail", description: "No submission came back" });
  return { submissionId: created.id, emailId: args.emailId, sendAt: created.sendAt ?? holdUntil(args.at) };
}

/**
 * Cancel send: the submission is canceled and the message is a plain draft
 * again. "sent" when it had already gone (the reconciler then files it).
 * (onSuccessUpdateEmail does nothing on an update in Stalwart 0.16.25, so the
 * keyword goes in a second call.)
 */
export async function cancelScheduled(client: JmapClient, submissionId: Id, emailId: Id): Promise<"canceled" | "sent"> {
  const res = await client.call("EmailSubmission/set", { update: { [submissionId]: { undoStatus: "canceled" } } });
  const refused = res.notUpdated?.[submissionId];
  if (refused) {
    if (refused.type === "cannotUnsend") return "sent";
    throw new JmapSetError("EmailSubmission/set", submissionId, refused);
  }
  const unmark = await client.call("Email/set", { update: { [emailId]: { [`keywords/${escapePointer(SCHEDULED)}`]: null } } });
  const failed = unmark.notUpdated?.[emailId];
  if (failed && failed.type !== "notFound") throw new JmapSetError("Email/set", emailId, failed);
  return "canceled";
}

// ---- The Scheduled view -------------------------------------------------------------------

export interface ScheduledMessage {
  submissionId: Id;
  emailId: Id;
  threadId: Id;
  sendAt: string;
  subject: string;
  preview: string;
  to: EmailAddress[];
}

/** The messages waiting to go, soonest first: pending submissions whose message carries `$scheduled`. */
export async function listScheduled(client: JmapClient): Promise<ScheduledMessage[]> {
  const r = client.request();
  const q = r.call("EmailSubmission/query", { filter: { undoStatus: "pending" } });
  const s = r.call("EmailSubmission/get", { ids: q.ref("/ids"), properties: ["emailId", "threadId", "sendAt", "undoStatus"] });
  const e = r.call("Email/get", { ids: s.ref<Id[]>("/list/*/emailId"), properties: ["subject", "preview", "to", "cc", "bcc", "keywords"] });
  const res = await r.send();
  const emails = new Map(res.get(e).list.map((m) => [m.id, m]));
  const out: ScheduledMessage[] = [];
  for (const sub of res.get(s).list) {
    const email = emails.get(sub.emailId);
    if (!email || sub.undoStatus !== "pending" || email.keywords?.[SCHEDULED] !== true) continue;
    out.push({
      submissionId: sub.id,
      emailId: sub.emailId,
      threadId: sub.threadId,
      sendAt: sub.sendAt,
      subject: email.subject ?? "",
      preview: email.preview ?? "",
      to: [...(email.to ?? []), ...(email.cc ?? []), ...(email.bcc ?? [])],
    });
  }
  return out.sort((a, b) => (a.sendAt < b.sendAt ? -1 : a.sendAt > b.sendAt ? 1 : 0));
}

// ---- Filing what went out -----------------------------------------------------------------

export interface ScheduledRoles {
  drafts: Id | undefined;
  sent: Id | undefined;
}

export interface ReconcileResult {
  /** Went out: filed in Sent. */
  filed: Id[];
  /** Canceled, or no submission left: plain drafts again. */
  unscheduled: Id[];
  /** The next send time still waiting (ms since epoch), or null. */
  next: number | null;
}

const RECONCILE_LIMIT = 256;

/**
 * Look at every message marked `$scheduled`: one whose submission is final is
 * filed in Sent (as an ordinary send is), one whose submissions are all
 * canceled, or gone, is a plain draft again, and one still pending waits.
 */
export async function reconcileScheduled(client: JmapClient, roles: ScheduledRoles): Promise<ReconcileResult> {
  const result: ReconcileResult = { filed: [], unscheduled: [], next: null };
  const marked = await client.call("Email/query", { filter: { hasKeyword: SCHEDULED }, limit: RECONCILE_LIMIT });
  if (marked.ids.length === 0) return result;
  const r = client.request();
  const q = r.call("EmailSubmission/query", { filter: { emailIds: [...marked.ids] } });
  const g = r.call("EmailSubmission/get", { ids: q.ref("/ids"), properties: ["emailId", "sendAt", "undoStatus"] });
  const res = await r.send();
  const byEmail = new Map<Id, { undoStatus: string; sendAt: string }[]>();
  for (const sub of res.get(g).list) byEmail.set(sub.emailId, [...(byEmail.get(sub.emailId) ?? []), sub]);

  const update: Record<Id, PatchObject> = {};
  const unmark = `keywords/${escapePointer(SCHEDULED)}`;
  for (const id of marked.ids) {
    const subs = byEmail.get(id) ?? [];
    const pending = subs.filter((s) => s.undoStatus === "pending");
    if (subs.some((s) => s.undoStatus === "final")) {
      update[id] = { ...sentPatch(roles.drafts, roles.sent), [unmark]: null };
      result.filed.push(id);
    } else if (pending.length > 0) {
      for (const s of pending) {
        const at = Date.parse(s.sendAt);
        if (!Number.isNaN(at)) result.next = result.next === null ? at : Math.min(result.next, at);
      }
    } else {
      update[id] = { [unmark]: null };
      result.unscheduled.push(id);
    }
  }
  if (Object.keys(update).length > 0) await client.call("Email/set", { update });
  return result;
}

export interface ScheduledSyncOptions {
  marginMs?: number;
  now?: () => number;
}

/**
 * Runs reconcileScheduled while Postern is open: at start, when the window
 * regains focus, a little after the next send time, and when asked. One run
 * at a time. Only for accounts that can schedule.
 */
export class ScheduledSync {
  readonly #client: JmapClient;
  readonly #roles: () => ScheduledRoles;
  readonly #onChange: () => void;
  readonly #margin: number;
  readonly #now: () => number;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #timerAt: number | null = null;
  #running: Promise<void> | null = null;
  #again = false;
  #started = false;
  #overdue = OVERDUE_FIRST_MS;

  constructor(client: JmapClient, roles: () => ScheduledRoles, onChange: () => void, options: ScheduledSyncOptions = {}) {
    this.#client = client;
    this.#roles = roles;
    this.#onChange = onChange;
    this.#margin = options.marginMs ?? RECONCILE_MARGIN_MS;
    this.#now = options.now ?? Date.now;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    window.addEventListener("focus", this.#onFocus);
    void this.run();
  }

  stop(): void {
    this.#started = false;
    window.removeEventListener("focus", this.#onFocus);
    this.#clearTimer();
  }

  /** A message was just scheduled here for `sendAt`: look again a little after it. */
  expect(sendAt: string | number): void {
    const at = typeof sendAt === "number" ? sendAt : Date.parse(sendAt);
    if (!Number.isNaN(at)) this.#arm(at);
  }

  /** Reconcile now (a second call during a run runs once more after it). */
  run(): Promise<void> {
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = (async () => {
      try {
        do {
          this.#again = false;
          const roles = this.#roles();
          const result = await reconcileScheduled(this.#client, roles);
          if (result.filed.length > 0 || result.unscheduled.length > 0) this.#onChange();
          if (result.next !== null) this.#arm(result.next);
        } while (this.#again && this.#started);
      } catch {
        // Offline or signed out: the next focus or timer tries again.
      } finally {
        this.#running = null;
      }
    })();
    return this.#running;
  }

  readonly #onFocus = () => void this.run();

  #arm(sendAt: number): void {
    if (!this.#started) return;
    let at = sendAt + this.#margin;
    if (at <= this.#now()) {
      // Past its time and still waiting: back off rather than ask again at once.
      at = this.#now() + this.#overdue;
      this.#overdue = Math.min(this.#overdue * 2, OVERDUE_MAX_MS);
    } else this.#overdue = OVERDUE_FIRST_MS;
    if (this.#timerAt !== null && this.#timerAt <= at && this.#timerAt > this.#now()) return;
    this.#clearTimer();
    this.#timerAt = at;
    // setTimeout's delay is a 32-bit count of ms (about 24.8 days); a later time re-arms on the way.
    const delay = Math.min(Math.max(0, at - this.#now()), 2_000_000_000);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#timerAt = null;
      void this.run();
    }, delay);
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    this.#timerAt = null;
  }
}
