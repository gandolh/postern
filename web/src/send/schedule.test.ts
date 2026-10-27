// @vitest-environment jsdom
// Schedule send (brief 23) over the compose test server: the times offered,
// the submission with HOLDUNTIL and every recipient, cancel, the Scheduled
// list, and filing in Sent once the server has sent it.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelScheduled,
  checkSendTime,
  holdUntil,
  listScheduled,
  maxDelayedSendMs,
  reconcileScheduled,
  SCHEDULED,
  scheduleDraft,
  schedulePresets,
  ScheduledSync,
} from "./schedule";
import { ComposeTestServer, MAILBOXES } from "./testServer";

const ROLES = { drafts: MAILBOXES.drafts, sent: MAILBOXES.sent };
const AT = new Date("2026-10-28T08:00:00Z");

function draft(server: ComposeTestServer, id: string, extra: Record<string, unknown> = {}) {
  server.add({
    id,
    threadId: `T-${id}`,
    mailboxIds: { [MAILBOXES.drafts]: true },
    keywords: { $draft: true, $seen: true },
    subject: `Subject ${id}`,
    preview: `Preview ${id}`,
    to: [{ name: "Bob Baker", email: "bob@postern.test" }],
    cc: [{ name: null, email: "Carol@example.org" }],
    bcc: [{ name: null, email: "carol@example.org" }, { name: null, email: "dave@example.org" }],
    ...extra,
  });
}

async function setup() {
  const server = new ComposeTestServer({ maxDelayedSend: 2_592_000 });
  const client = await server.connect();
  return { server, client };
}

describe("choosing a time", () => {
  it("offers tomorrow 08:00 and 13:00 and the next Monday 08:00, in local time", () => {
    const tuesday = new Date(2026, 9, 27, 15, 30);
    expect(schedulePresets(tuesday).map((p) => [p.label, p.at.toString()])).toEqual([
      ["Tomorrow morning", new Date(2026, 9, 28, 8, 0).toString()],
      ["Tomorrow afternoon", new Date(2026, 9, 28, 13, 0).toString()],
      ["Monday morning", new Date(2026, 10, 2, 8, 0).toString()],
    ]);
    expect(schedulePresets(new Date(2026, 9, 26, 7, 0))[2]!.at.toString()).toBe(new Date(2026, 10, 2, 8, 0).toString());
    expect(schedulePresets(new Date(2026, 10, 1, 22, 0))[2]!.at.toString()).toBe(new Date(2026, 10, 2, 8, 0).toString());
  });

  it("refuses a time that has passed, is under a minute away, or is past the server's limit", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    const day = 86_400_000;
    expect(checkSendTime(new Date("2026-10-27T11:00:00Z"), now, 30 * day)).toMatch(/at least a minute/);
    expect(checkSendTime(new Date("2026-10-27T12:00:30Z"), now, 30 * day)).toMatch(/at least a minute/);
    expect(checkSendTime(new Date("2026-12-27T12:00:00Z"), now, 30 * day)).toBe("Choose a time within 30 days.");
    expect(checkSendTime(new Date(NaN), now, 30 * day)).toBe("Choose a date and a time.");
    expect(checkSendTime(new Date("2026-10-28T08:00:00Z"), now, 30 * day)).toBeNull();
  });

  it("writes HOLDUNTIL in UTC to the second, rounding up", () => {
    expect(holdUntil(new Date("2026-10-28T08:00:00.000Z"))).toBe("2026-10-28T08:00:00Z");
    expect(holdUntil(new Date("2026-10-28T08:00:00.200Z"))).toBe("2026-10-28T08:00:01Z");
  });

  it("reads the server's limit, and none where FUTURERELEASE is missing", async () => {
    const { client } = await setup();
    expect(maxDelayedSendMs(client)).toBe(2_592_000_000);
    expect(maxDelayedSendMs(await new ComposeTestServer().connect())).toBe(0);
  });
});

describe("scheduling", () => {
  it("submits with HOLDUNTIL and every recipient once, and marks the draft $scheduled, still in Drafts", async () => {
    const { server, client } = await setup();
    draft(server, "M1");
    const scheduled = await scheduleDraft(client, { emailId: "M1", identityId: "I1", from: "alice@postern.test", at: AT });
    expect(scheduled).toMatchObject({ emailId: "M1", sendAt: "2026-10-28T08:00:00Z" });
    expect(server.submissions[0]).toEqual({
      identityId: "I1",
      emailId: "M1",
      envelope: {
        mailFrom: { email: "alice@postern.test", parameters: { HOLDUNTIL: "2026-10-28T08:00:00Z" } },
        rcptTo: [
          { email: "bob@postern.test", parameters: null },
          { email: "Carol@example.org", parameters: null },
          { email: "dave@example.org", parameters: null },
        ],
      },
    });
    expect(server.emails.get("M1")).toMatchObject({ mailboxIds: { [MAILBOXES.drafts]: true }, keywords: { $draft: true, $seen: true, [SCHEDULED]: true } });
  });

  it("cancels: the submission is canceled and the message a plain draft; once sent, says so", async () => {
    const { server, client } = await setup();
    draft(server, "M1");
    draft(server, "M2");
    const one = await scheduleDraft(client, { emailId: "M1", identityId: "I1", from: "alice@postern.test", at: AT });
    const two = await scheduleDraft(client, { emailId: "M2", identityId: "I1", from: "alice@postern.test", at: AT });
    expect(await cancelScheduled(client, one.submissionId, "M1")).toBe("canceled");
    expect(server.held.get(one.submissionId)!.undoStatus).toBe("canceled");
    expect(server.emails.get("M1")!.keywords).toEqual({ $draft: true, $seen: true });
    server.release(two.submissionId);
    expect(await cancelScheduled(client, two.submissionId, "M2")).toBe("sent");
  });
});

describe("the Scheduled list and filing in Sent", () => {
  it("lists what waits, soonest first, and not an ordinary send still in the queue", async () => {
    const { server, client } = await setup();
    draft(server, "late");
    draft(server, "soon");
    draft(server, "now");
    await scheduleDraft(client, { emailId: "late", identityId: "I1", from: "alice@postern.test", at: new Date("2026-11-02T08:00:00Z") });
    await scheduleDraft(client, { emailId: "soon", identityId: "I1", from: "alice@postern.test", at: AT });
    // An ordinary send that is still pending for a moment carries no $scheduled.
    server.held.set("S-now", { id: "S-now", emailId: "now", threadId: "T-now", sendAt: "2026-10-27T12:00:00Z", undoStatus: "pending" });
    const list = await listScheduled(client);
    expect(list.map((m) => [m.emailId, m.sendAt, m.subject])).toEqual([
      ["soon", "2026-10-28T08:00:00Z", "Subject soon"],
      ["late", "2026-11-02T08:00:00Z", "Subject late"],
    ]);
    expect(list[0]!.to.map((a) => a.email)).toEqual(["bob@postern.test", "Carol@example.org", "carol@example.org", "dave@example.org"]);
  });

  it("files a sent one in Sent, makes a canceled one a plain draft, and waits for the rest", async () => {
    const { server, client } = await setup();
    for (const id of ["gone", "kept", "waits", "orphan"]) draft(server, id);
    const gone = await scheduleDraft(client, { emailId: "gone", identityId: "I1", from: "alice@postern.test", at: AT });
    const kept = await scheduleDraft(client, { emailId: "kept", identityId: "I1", from: "alice@postern.test", at: AT });
    await scheduleDraft(client, { emailId: "waits", identityId: "I1", from: "alice@postern.test", at: new Date("2026-10-29T13:00:00Z") });
    server.emails.get("orphan")!.keywords[SCHEDULED] = true;
    server.release(gone.submissionId);
    server.held.get(kept.submissionId)!.undoStatus = "canceled";

    const result = await reconcileScheduled(client, ROLES);
    expect(result).toEqual({ filed: ["gone"], unscheduled: ["kept", "orphan"], next: Date.parse("2026-10-29T13:00:00Z") });
    expect(server.emails.get("gone")).toMatchObject({ mailboxIds: { [MAILBOXES.sent]: true }, keywords: { $seen: true } });
    expect(server.emails.get("kept")!.keywords).toEqual({ $draft: true, $seen: true });
    expect(server.emails.get("kept")!.mailboxIds).toEqual({ [MAILBOXES.drafts]: true });
    expect(server.emails.get("waits")!.keywords[SCHEDULED]).toBe(true);
  });

  it("asks nothing more when no message is scheduled", async () => {
    const { server, client } = await setup();
    expect(await reconcileScheduled(client, ROLES)).toEqual({ filed: [], unscheduled: [], next: null });
    expect(server.names()).toEqual(["Email/query"]);
  });
});

describe("ScheduledSync", () => {
  afterEach(() => vi.useRealTimers());

  it("looks at start, and again a little after the next send time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-10-28T07:59:00Z"));
    const { server, client } = await setup();
    draft(server, "M1");
    const scheduled = await scheduleDraft(client, { emailId: "M1", identityId: "I1", from: "alice@postern.test", at: AT });
    const changed = vi.fn();
    const sync = new ScheduledSync(client, () => ROLES, changed, { marginMs: 15_000 });
    sync.start();
    await vi.waitFor(() => expect(server.names().filter((n) => n === "EmailSubmission/query")).toHaveLength(1));
    expect(changed).not.toHaveBeenCalled();

    server.release(scheduled.submissionId);
    await vi.advanceTimersByTimeAsync(60_000 + 14_000);
    expect(server.emails.get("M1")!.mailboxIds).toEqual({ [MAILBOXES.drafts]: true });
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(server.emails.get("M1")!.mailboxIds).toEqual({ [MAILBOXES.sent]: true }));
    expect(changed).toHaveBeenCalledTimes(1);
    sync.stop();
  });

  it("backs off while a message past its time is still in the queue", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-10-28T08:01:00Z"));
    const { server, client } = await setup();
    draft(server, "M1");
    await scheduleDraft(client, { emailId: "M1", identityId: "I1", from: "alice@postern.test", at: AT });
    const sync = new ScheduledSync(client, () => ROLES, () => {}, { marginMs: 15_000 });
    const looks = () => server.names().filter((n) => n === "EmailSubmission/query").length;
    sync.start();
    await vi.waitFor(() => expect(looks()).toBe(1));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(looks()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(looks()).toBe(2);
    // Then a minute after that one (t = 90 s).
    await vi.advanceTimersByTimeAsync(57_000);
    expect(looks()).toBe(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(looks()).toBe(3);
    sync.stop();
  });

  it("looks again when the window regains focus", async () => {
    const { server, client } = await setup();
    const sync = new ScheduledSync(client, () => ROLES, () => {});
    sync.start();
    await vi.waitFor(() => expect(server.names()).toEqual(["Email/query"]));
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(server.names()).toEqual(["Email/query", "Email/query"]));
    sync.stop();
    window.dispatchEvent(new Event("focus"));
    await new Promise((r) => setTimeout(r, 10));
    expect(server.names()).toHaveLength(2);
  });
});
