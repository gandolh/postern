// Waking snoozed mail (brief 24), in the browser: the owner chose that over a
// scheduler of our own (decisions-mail.md), so mail comes back only while
// Postern is open somewhere. Stalwart 0.16.25 has nothing that moves or flags
// a message at a time (no such Sieve extension, task or JMAP call; checked
// 2026-10-27).
//
// Each look, one request: the messages in Snoozed, their conversations, and
// the messages marked $woken. A conversation comes back to the Inbox when its
// time has passed (unread, $woken, so the Inbox shows it on top) or at once
// when one of its messages is in the Inbox (a reply came). $woken goes once
// the conversation is read or has left the Inbox. Two devices looking at once
// don't fight: the second finds nothing left in Snoozed, and a patch that
// changes nothing is never sent.
//
//   new SnoozeSync(client, labels).start()   on start-up (once the labels are
//                                            in), every minute, on focus, after
//                                            mail changes, and at the next
//                                            wake-up time

import type { Id, JmapClient } from "@postern/jmap";
import { publishMailChange, subscribeMailChanges } from "../actions/bus";
import type { Conversation, ConversationMessage } from "../actions/conversation";
import { SEEN } from "../actions/conversation";
import { planUnsnooze } from "../actions/snooze";
import { emptyPlan, type MessagePlan } from "../actions/patches";
import { snoozedUntil, WOKEN } from "./keyword";

export interface SnoozeLabels {
  snoozedId(): Id | undefined;
  mailboxIdForRole(role: "inbox"): Id | undefined;
  sync(): Promise<void>;
  /** Hear label changes: the first look waits for the Inbox and Snoozed to be known. */
  subscribe(listener: () => void): () => void;
}

export interface WakeResult {
  /** Conversations back in the Inbox: their time came. */
  due: Id[];
  /** Conversations back because a message of theirs reached the Inbox. */
  replied: Id[];
  /** Messages that lost $woken. */
  unmarked: Id[];
  /** The next wake-up still waiting (ms since epoch), or null. */
  next: number | null;
}

type Msg = ConversationMessage;
const LIMIT = 500;

function merge(a: MessagePlan, b: MessagePlan): MessagePlan {
  return {
    update: { ...a.update, ...b.update },
    inverse: { ...a.inverse, ...b.inverse },
    conversationIds: [...a.conversationIds, ...b.conversationIds],
    conversationOf: { ...a.conversationOf, ...b.conversationOf },
  };
}

/** One look: wake what is due or answered, and tidy $woken. */
export async function wakeSnoozed(client: JmapClient, snoozedId: Id | undefined, inbox: Id | undefined, now: number): Promise<WakeResult> {
  const result: WakeResult = { due: [], replied: [], unmarked: [], next: null };
  if (inbox === undefined) return result;
  const props = ["threadId", "mailboxIds", "keywords", "receivedAt"] as const;
  const r = client.request();
  const s = snoozedId === undefined ? null : r.call("Email/query", { filter: { inMailbox: snoozedId }, limit: LIMIT });
  const sg = s ? r.call("Email/get", { ids: s.ref("/ids"), properties: [...props] }) : null;
  const t = sg ? r.call("Thread/get", { ids: sg.ref<Id[]>("/list/*/threadId") }) : null;
  const tm = t ? r.call("Email/get", { ids: t.ref<Id[]>("/list/*/emailIds"), properties: [...props] }) : null;
  const w = r.call("Email/query", { filter: { hasKeyword: WOKEN }, limit: LIMIT });
  const wg = r.call("Email/get", { ids: w.ref("/ids"), properties: ["mailboxIds", "keywords"] });
  const res = await r.send();

  let plan = emptyPlan();
  if (sg) {
    const snoozed = res.get(sg).list as unknown as Msg[];
    // A long conversation can pass maxObjectsInGet: then only the time decides this look.
    const others = tm && !res.error(tm) ? (res.get(tm).list as unknown as Msg[]) : [];
    const byThread = new Map<Id, Msg[]>();
    for (const m of snoozed) byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);
    const due: Conversation[] = [];
    const replied: Conversation[] = [];
    for (const [threadId, messages] of byThread) {
      const ids = new Set(messages.map((m) => m.id));
      const reply = others.some((m) => m.threadId === threadId && !ids.has(m.id) && m.mailboxIds[inbox] === true);
      const until = snoozedUntil(messages);
      if (reply) replied.push({ id: threadId, messages });
      else if (until && until.getTime() <= now) due.push({ id: threadId, messages });
      else if (until) result.next = result.next === null ? until.getTime() : Math.min(result.next, until.getTime());
    }
    result.due = due.map((c) => c.id);
    result.replied = replied.map((c) => c.id);
    plan = merge(planUnsnooze(due, { inbox }, snoozedId, { wake: true }), planUnsnooze(replied, { inbox }, snoozedId));
  }

  for (const m of res.get(wg).list) {
    if (plan.update[m.id]) continue;
    if (m.keywords?.[SEEN] === true || m.mailboxIds?.[inbox] !== true) {
      plan.update[m.id] = { [`keywords/${WOKEN}`]: null };
      result.unmarked.push(m.id);
    }
  }

  if (Object.keys(plan.update).length > 0) await client.call("Email/set", { update: plan.update });
  return result;
}

export interface SnoozeSyncOptions {
  intervalMs?: number;
  /** At most one look this often when mail changes (the actions bus). */
  busGapMs?: number;
  now?: () => number;
}

export class SnoozeSync {
  readonly #client: JmapClient;
  readonly #labels: SnoozeLabels;
  readonly #interval: number;
  readonly #busGap: number;
  readonly #now: () => number;
  #tick: ReturnType<typeof setInterval> | null = null;
  #soon: ReturnType<typeof setTimeout> | null = null;
  #busLater: ReturnType<typeof setTimeout> | null = null;
  #offBus: (() => void) | null = null;
  #offLabels: (() => void) | null = null;
  /** The Inbox and Snoozed ids last looked with: a look runs when they change (the labels loaded, Snoozed made). */
  #labelsKey = "";
  #running: Promise<void> | null = null;
  #again = false;
  #lastBusRun = 0;
  #started = false;

  constructor(client: JmapClient, labels: SnoozeLabels, options: SnoozeSyncOptions = {}) {
    this.#client = client;
    this.#labels = labels;
    this.#interval = options.intervalMs ?? 60_000;
    this.#busGap = options.busGapMs ?? 5_000;
    this.#now = options.now ?? Date.now;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#tick = setInterval(() => void this.run(), this.#interval);
    window.addEventListener("focus", this.#onFocus);
    this.#offBus = subscribeMailChanges((change) => {
      if (change.kind !== "settled") return;
      // A burst of changes (our own action, then the reply it raced) gets a look now and one at the end of the gap.
      const wait = this.#lastBusRun + this.#busGap - this.#now();
      if (wait <= 0) {
        this.#lastBusRun = this.#now();
        void this.run();
      } else if (this.#busLater === null) {
        this.#busLater = setTimeout(() => {
          this.#busLater = null;
          this.#lastBusRun = this.#now();
          void this.run();
        }, wait);
      }
    });
    this.#offLabels = this.#labels.subscribe(() => {
      if (this.#keyOfLabels() !== this.#labelsKey) void this.run();
    });
    void this.run();
  }

  #keyOfLabels(): string {
    return `${this.#labels.mailboxIdForRole("inbox") ?? ""}|${this.#labels.snoozedId() ?? ""}`;
  }

  stop(): void {
    this.#started = false;
    if (this.#tick !== null) clearInterval(this.#tick);
    if (this.#soon !== null) clearTimeout(this.#soon);
    if (this.#busLater !== null) clearTimeout(this.#busLater);
    this.#tick = this.#soon = this.#busLater = null;
    window.removeEventListener("focus", this.#onFocus);
    this.#offBus?.();
    this.#offLabels?.();
    this.#offBus = this.#offLabels = null;
  }

  /** Look now (a call during a look runs one more after it). */
  run(): Promise<void> {
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = (async () => {
      try {
        do {
          this.#again = false;
          this.#labelsKey = this.#keyOfLabels();
          const result = await wakeSnoozed(this.#client, this.#labels.snoozedId(), this.#labels.mailboxIdForRole("inbox"), this.#now());
          if (result.due.length || result.replied.length || result.unmarked.length) {
            void this.#labels.sync();
            publishMailChange({ kind: "settled" });
          }
          this.#armNext(result.next);
        } while (this.#again && this.#started);
      } catch {
        // Offline or signed out: the next tick or focus tries again.
      } finally {
        this.#running = null;
      }
    })();
    return this.#running;
  }

  readonly #onFocus = () => void this.run();

  /** A wake-up before the next tick gets a look of its own, a second after its time. */
  #armNext(next: number | null): void {
    if (this.#soon !== null) clearTimeout(this.#soon);
    this.#soon = null;
    if (!this.#started || next === null) return;
    const delay = next - this.#now() + 1_000;
    if (delay >= this.#interval) return;
    this.#soon = setTimeout(() => {
      this.#soon = null;
      void this.run();
    }, Math.max(0, delay));
  }
}
