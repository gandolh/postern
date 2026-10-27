// @vitest-environment jsdom
// Snooze (brief 24): the keyword, the times offered, the plans, and waking
// over the fake JMAP server: on time, on a reply, idempotent, $woken tidied.

import { afterEach, describe, expect, it, vi } from "vitest";
import { publishMailChange } from "../actions/bus";
import { fakeEmail, FakeMail, MAILBOXES, ROLES } from "../actions/fakeMail";
import type { Conversation, ConversationMessage } from "../actions/conversation";
import { planSnooze, planUnsnooze } from "../actions/snooze";
import { parseSnoozeKeyword, snoozedUntil, snoozeKeyword, WOKEN } from "./keyword";
import { checkSnoozeTime, formatSnoozeTime, snoozePresets } from "./times";
import { SnoozeSync, wakeSnoozed } from "./wake";

const SNOOZED = "z";
const scope = { kind: "normal" as const, roles: { ...ROLES } };
const KW = "$snoozed-20261028T0700Z";

describe("the keyword", () => {
  it("holds the time in UTC to the minute, rounding up, and reads back in any case", () => {
    expect(snoozeKeyword(new Date("2026-10-28T07:00:00Z"))).toBe(KW);
    expect(snoozeKeyword(new Date("2026-10-28T06:59:20Z"))).toBe(KW);
    expect(parseSnoozeKeyword(KW)?.toISOString()).toBe("2026-10-28T07:00:00.000Z");
    expect(parseSnoozeKeyword("$snoozed-20261028t0700z")?.toISOString()).toBe("2026-10-28T07:00:00.000Z");
    expect(parseSnoozeKeyword("$snoozed-20261332T0700Z")).toBeNull();
    expect(parseSnoozeKeyword("$seen")).toBeNull();
  });

  it("takes the earliest time among a conversation's messages", () => {
    expect(snoozedUntil([{ keywords: { $seen: true } }])).toBeNull();
    expect(snoozedUntil([{ keywords: { "$snoozed-20261029T0700Z": true } }, { keywords: { [KW]: true } }])?.toISOString()).toBe("2026-10-28T07:00:00.000Z");
  });
});

describe("the times offered", () => {
  const at = (presets: ReturnType<typeof snoozePresets>) => presets.map((p) => [p.label, p.at.toString()]);

  it("offers later today, tomorrow, this weekend and next week on a weekday, local time", () => {
    const tuesday = new Date(2026, 9, 27, 15, 20);
    expect(at(snoozePresets(tuesday))).toEqual([
      ["Later today", new Date(2026, 9, 27, 18, 0).toString()],
      ["Tomorrow", new Date(2026, 9, 28, 8, 0).toString()],
      ["This weekend", new Date(2026, 9, 31, 8, 0).toString()],
      ["Next week", new Date(2026, 10, 2, 8, 0).toString()],
    ]);
    expect(snoozePresets(new Date(2026, 9, 27, 15, 40))[0]!.at.toString()).toBe(new Date(2026, 9, 27, 19, 0).toString());
  });

  it("leaves out later today late at night, and this weekend at the weekend", () => {
    expect(snoozePresets(new Date(2026, 9, 27, 22, 0)).map((p) => p.id)).toEqual(["tomorrow", "weekend", "week"]);
    expect(snoozePresets(new Date(2026, 9, 31, 9, 0)).map((p) => p.id)).toEqual(["later", "tomorrow", "week"]);
  });

  it("shows a weekday within the week and a date further off, and refuses a past time", () => {
    const now = new Date(2026, 9, 27, 15, 0);
    expect(formatSnoozeTime(new Date(2026, 9, 28, 8, 0), now, "en-GB")).toBe("Wed 08:00");
    expect(formatSnoozeTime(new Date(2026, 10, 12, 8, 0), now, "en-GB")).toBe("12 Nov, 08:00");
    expect(checkSnoozeTime(new Date(2026, 9, 27, 14, 0), now)).toBe("Choose a time in the future.");
    expect(checkSnoozeTime(new Date(2026, 9, 27, 16, 0), now)).toBeNull();
  });
});

/** A message of conversation T: its labels and keywords by name. */
function msg(id: string, day: number, mailboxes: string[], keywords: string[]): ConversationMessage {
  const set = (names: string[]) => Object.fromEntries(names.map((n) => [n, true as const]));
  return { id, threadId: "T", receivedAt: `2026-10-0${day}T00:00:00Z`, mailboxIds: set(mailboxes), keywords: set(keywords) };
}

describe("the plans", () => {
  const conversation = (): Conversation => ({
    id: "T",
    messages: [msg("1", 1, ["a", "i"], ["$seen"]), msg("2", 2, ["a"], ["$seen", "$snoozed-20261027T0700Z"]), msg("d", 3, ["d"], ["$draft"])],
  });

  it("snoozes: out of the Inbox into Snoozed with the new time, other labels and a reply draft left alone", () => {
    const plan = planSnooze([conversation()], scope, SNOOZED, new Date("2026-10-28T07:00:00Z"));
    expect(plan.update).toEqual({
      "1": { "mailboxIds/z": true, "mailboxIds/a": null, [`keywords/${KW}`]: true },
      "2": { "mailboxIds/z": true, "mailboxIds/a": null, "keywords/$snoozed-20261027T0700Z": null, [`keywords/${KW}`]: true },
    });
    expect(plan.inverse["1"]).toEqual({ "mailboxIds/z": null, "mailboxIds/a": true, [`keywords/${KW}`]: null });
  });

  it("unsnoozes back to the Inbox; waking also marks the newest unread and $woken", () => {
    const snoozed: Conversation = { id: "T", messages: [msg("1", 1, ["z", "i"], ["$seen", KW]), msg("2", 2, ["z"], ["$seen", KW])] };
    expect(planUnsnooze([snoozed], ROLES, SNOOZED).update).toEqual({
      "1": { "mailboxIds/a": true, "mailboxIds/z": null, [`keywords/${KW}`]: null },
      "2": { "mailboxIds/a": true, "mailboxIds/z": null, [`keywords/${KW}`]: null },
    });
    expect(planUnsnooze([snoozed], ROLES, SNOOZED, { wake: true }).update["2"]).toEqual({
      "mailboxIds/a": true,
      "mailboxIds/z": null,
      [`keywords/${KW}`]: null,
      "keywords/$seen": null,
      [`keywords/${WOKEN}`]: true,
    });
  });
});

describe("waking", () => {
  const boxes = [...MAILBOXES, { id: SNOOZED, name: "Snoozed", role: null, parentId: null }];
  const snoozedMail = () => [
    // Due: snoozed until 07:00.
    fakeEmail({ id: "d1", threadId: "D", receivedAt: "2026-10-01T00:00:00Z", mailboxIds: { [SNOOZED]: true }, keywords: { $seen: true, [KW]: true } }),
    fakeEmail({ id: "d2", threadId: "D", receivedAt: "2026-10-02T00:00:00Z", mailboxIds: { [SNOOZED]: true, i: true }, keywords: { $seen: true, [KW]: true } }),
    // Not yet: 09:00.
    fakeEmail({ id: "w1", threadId: "W", receivedAt: "2026-10-01T00:00:00Z", mailboxIds: { [SNOOZED]: true }, keywords: { $seen: true, "$snoozed-20261028T0900Z": true } }),
    // Not yet, but a reply came into the Inbox.
    fakeEmail({ id: "r1", threadId: "R", receivedAt: "2026-10-01T00:00:00Z", mailboxIds: { [SNOOZED]: true }, keywords: { $seen: true, "$snoozed-20261030T0900Z": true } }),
    fakeEmail({ id: "r2", threadId: "R", receivedAt: "2026-10-28T06:00:00Z", mailboxIds: { a: true } }),
    // Woken earlier and read since: loses $woken.
    fakeEmail({ id: "old", threadId: "O", mailboxIds: { a: true }, keywords: { $seen: true, [WOKEN]: true } }),
    // Woken and still unread: keeps it.
    fakeEmail({ id: "new", threadId: "N", mailboxIds: { a: true }, keywords: { [WOKEN]: true } }),
  ];

  async function setup() {
    const mail = new FakeMail({ mailboxes: boxes, emails: snoozedMail() });
    return { mail, client: await mail.connect() };
  }

  it("brings back what is due (unread, $woken) and what was answered, tidies $woken, and says when to look next", async () => {
    const { mail, client } = await setup();
    const result = await wakeSnoozed(client, SNOOZED, "a", Date.parse("2026-10-28T07:00:30Z"));
    expect(result).toEqual({ due: ["D"], replied: ["R"], unmarked: ["old"], next: Date.parse("2026-10-28T09:00:00Z") });
    expect(mail.emails.get("d1")).toMatchObject({ mailboxIds: { a: true }, keywords: { $seen: true } });
    expect(mail.emails.get("d2")).toMatchObject({ mailboxIds: { a: true, i: true }, keywords: { [WOKEN]: true } });
    expect(mail.emails.get("r1")).toMatchObject({ mailboxIds: { a: true }, keywords: { $seen: true } });
    expect(mail.emails.get("w1")!.mailboxIds).toEqual({ [SNOOZED]: true });
    expect(mail.emails.get("old")!.keywords).toEqual({ $seen: true });
    expect(mail.emails.get("new")!.keywords).toEqual({ [WOKEN]: true });
  });

  it("finds nothing to do on a second look, as a second device would", async () => {
    const { mail, client } = await setup();
    await wakeSnoozed(client, SNOOZED, "a", Date.parse("2026-10-28T07:00:30Z"));
    const sets = () => mail.calls().filter((c) => c.includes("Email/set")).length;
    const before = sets();
    expect(await wakeSnoozed(client, SNOOZED, "a", Date.parse("2026-10-28T07:00:40Z"))).toEqual({ due: [], replied: [], unmarked: [], next: Date.parse("2026-10-28T09:00:00Z") });
    expect(sets()).toBe(before);
  });

  it("only tidies $woken while the account has no Snoozed label", async () => {
    const mail = new FakeMail({ mailboxes: MAILBOXES, emails: [fakeEmail({ id: "old", threadId: "O", mailboxIds: { h: true }, keywords: { [WOKEN]: true } })] });
    const client = await mail.connect();
    expect((await wakeSnoozed(client, undefined, "a", Date.now())).unmarked).toEqual(["old"]);
  });

  describe("the sync", () => {
    afterEach(() => vi.useRealTimers());

    it("looks at start, every minute, a second after a wake-up time, and after mail changes", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
      vi.setSystemTime(new Date("2026-10-28T08:59:20Z"));
      const { mail, client } = await setup();
      const looks = () => mail.calls().filter((c) => c[0] === "Email/query" && c.includes("Thread/get")).length;
      const labels = { snoozedId: () => SNOOZED, mailboxIdForRole: () => "a", sync: vi.fn(async () => {}), subscribe: () => () => {} };
      const sync = new SnoozeSync(client, labels, { busGapMs: 0 });
      sync.start();
      // The first look wakes D and R; the mail change it announces brings one more look, which finds nothing.
      await vi.waitFor(() => expect(looks()).toBe(2));
      expect(mail.emails.get("d1")!.mailboxIds).toEqual({ a: true });
      expect(mail.emails.get("w1")!.mailboxIds).toEqual({ [SNOOZED]: true });
      // 09:00 is 40 s away, before the next minute's tick: a look of its own at 09:00:01.
      await vi.advanceTimersByTimeAsync(41_500);
      expect(mail.emails.get("w1")!.mailboxIds).toEqual({ a: true });
      expect(labels.sync).toHaveBeenCalled();
      const n = looks();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(looks()).toBeGreaterThan(n);
      const m = looks();
      publishMailChange({ kind: "settled" });
      await vi.waitFor(() => expect(looks()).toBe(m + 1));
      sync.stop();
    });

    it("after a burst of mail changes, looks once now and once more at the end of the gap", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
      vi.setSystemTime(new Date("2026-10-28T06:00:00Z"));
      const mail = new FakeMail({ mailboxes: boxes, emails: [] });
      const client = await mail.connect();
      const looks = () => mail.calls().filter((c) => c[0] === "Email/query").length;
      const sync = new SnoozeSync(client, { snoozedId: () => SNOOZED, mailboxIdForRole: () => "a", sync: async () => {}, subscribe: () => () => {} }, { busGapMs: 5_000 });
      sync.start();
      await vi.waitFor(() => expect(looks()).toBe(1));
      publishMailChange({ kind: "settled" });
      await vi.waitFor(() => expect(looks()).toBe(2));
      publishMailChange({ kind: "settled" });
      publishMailChange({ kind: "settled" });
      await vi.advanceTimersByTimeAsync(4_000);
      expect(looks()).toBe(2);
      await vi.advanceTimersByTimeAsync(1_500);
      expect(looks()).toBe(3);
      sync.stop();
    });

    it("looks as soon as the labels are in, so opening Postern brings back what is overdue", async () => {
      const { mail, client } = await setup();
      let known = false;
      const listeners = new Set<() => void>();
      const labels = {
        snoozedId: () => (known ? SNOOZED : undefined),
        mailboxIdForRole: () => (known ? "a" : undefined),
        sync: async () => {},
        subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
      };
      const sync = new SnoozeSync(client, labels, { now: () => Date.parse("2026-10-28T07:00:30Z") });
      sync.start();
      await new Promise((r) => setTimeout(r, 20));
      expect(mail.emails.get("d1")!.mailboxIds).toEqual({ [SNOOZED]: true });
      known = true;
      for (const l of listeners) l();
      await vi.waitFor(() => expect(mail.emails.get("d1")!.mailboxIds).toEqual({ a: true }));
      sync.stop();
    });
  });
});
