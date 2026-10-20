// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewMailDetector, type InboxMessage } from "./detector";
import { getDesktopNotifications, setDesktopNotifications, setNotifyAccount } from "./settings";
import { notifyNewMail, type NotifyDeps } from "./show";

function msg(id: string, receivedAt: string, extra: Partial<InboxMessage> = {}): InboxMessage {
  return { id, threadId: `T${id}`, receivedAt, from: [{ name: "Bob", email: "bob@postern.test" }], subject: `Subject ${id}`, keywords: {}, ...extra };
}

describe("NewMailDetector", () => {
  it("treats the first look as a baseline", () => {
    const d = new NewMailDetector();
    expect(d.observe([msg("1", "2026-10-20T10:00:00Z")])).toEqual([]);
  });
  it("reports only new unread mail, once", () => {
    const d = new NewMailDetector();
    d.observe([msg("1", "2026-10-20T10:00:00Z")]);
    const a = msg("2", "2026-10-20T10:05:00Z");
    expect(d.observe([a, msg("1", "2026-10-20T10:00:00Z")]).map((m) => m.id)).toEqual(["2"]);
    expect(d.observe([a, msg("1", "2026-10-20T10:00:00Z")])).toEqual([]);
  });
  it("ignores mail archived earlier and moved back (old receivedAt)", () => {
    const d = new NewMailDetector();
    d.observe([msg("1", "2026-10-20T10:00:00Z")]);
    expect(d.observe([msg("9", "2026-10-01T10:00:00Z"), msg("1", "2026-10-20T10:00:00Z")])).toEqual([]);
  });
  it("ignores mail you archived and moved back during this session", () => {
    const d = new NewMailDetector();
    d.observe([msg("1", "2026-10-20T10:00:00Z")]);
    d.observe([]); // archived
    expect(d.observe([msg("1", "2026-10-20T10:00:00Z")])).toEqual([]);
  });
  it("skips read mail and drafts, and orders oldest first", () => {
    const d = new NewMailDetector();
    d.observe([msg("1", "2026-10-20T10:00:00Z")]);
    const out = d.observe([
      msg("4", "2026-10-20T10:04:00Z"),
      msg("3", "2026-10-20T10:03:00Z", { keywords: { $seen: true } }),
      msg("2", "2026-10-20T10:02:00Z"),
      msg("5", "2026-10-20T10:05:00Z", { keywords: { $draft: true } }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["2", "4"]);
  });
});

function deps(over: Partial<NotifyDeps> = {}) {
  const made: { title: string; options: NotificationOptions; onclick: (() => void) | null; close: () => void }[] = [];
  const d: NotifyDeps = {
    create: (title, options) => {
      const n = { title, options, onclick: null as null | ((ev: Event) => void), close: vi.fn() };
      made.push(n as never);
      return n;
    },
    permission: () => "granted",
    watchingInbox: () => false,
    focusWindow: vi.fn(),
    openConversation: vi.fn(),
    ...over,
  };
  return { d, made };
}

describe("notifyNewMail", () => {
  it("shows sender and subject, never a body, and opens the conversation on click", () => {
    const { d, made } = deps();
    expect(notifyNewMail([msg("2", "2026-10-20T10:05:00Z")], d)).toBe(1);
    expect(made[0]!.title).toBe("Bob");
    expect(made[0]!.options.body).toBe("Subject 2");
    made[0]!.onclick!();
    expect(d.focusWindow).toHaveBeenCalled();
    expect(d.openConversation).toHaveBeenCalledWith("T2");
    expect(made[0]!.close).toHaveBeenCalled();
  });
  it("stays quiet without permission or while the Inbox is in view", () => {
    expect(notifyNewMail([msg("2", "2026-10-20T10:05:00Z")], deps({ permission: () => "default" }).d)).toBe(0);
    expect(notifyNewMail([msg("2", "2026-10-20T10:05:00Z")], deps({ permission: () => "unsupported" }).d)).toBe(0);
    expect(notifyNewMail([msg("2", "2026-10-20T10:05:00Z")], deps({ watchingInbox: () => true }).d)).toBe(0);
  });
  it("merges a burst into one", () => {
    const { d, made } = deps();
    const burst = ["1", "2", "3", "4"].map((i) => msg(i, `2026-10-20T10:0${i}:00Z`));
    expect(notifyNewMail(burst, d)).toBe(1);
    expect(made[0]!.title).toBe("4 new messages");
  });
});

describe("setting", () => {
  beforeEach(() => {
    localStorage.clear();
    setNotifyAccount("alice@postern.test");
  });
  it("is off by default and per account", async () => {
    expect(getDesktopNotifications()).toBe(false);
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
    await setDesktopNotifications(true);
    expect(getDesktopNotifications()).toBe(true);
    setNotifyAccount("bob@postern.test");
    expect(getDesktopNotifications()).toBe(false);
    vi.unstubAllGlobals();
  });
  it("requests permission when turning on, and stays off if refused", async () => {
    const request = vi.fn(async () => "denied");
    vi.stubGlobal("Notification", { permission: "default", requestPermission: request });
    expect(await setDesktopNotifications(true)).toBe(false);
    expect(request).toHaveBeenCalled();
    expect(getDesktopNotifications()).toBe(false);
    vi.unstubAllGlobals();
  });
});
