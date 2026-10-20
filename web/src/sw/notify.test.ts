import { describe, expect, it } from "vitest";
import { anyVisible, appWindows, clickHash, hashFor, notificationsFor, parsePushPayload, windowForClick, type WindowLike } from "./notify";
import { OPEN, PUSH_VERIFICATION, readWorkerMessage, WILL_NOTIFY } from "./protocol";

const IMAGES = { icon: "/webmail/pwa-192x192.png", badge: "/webmail/pwa-badge-96x96.png" };

describe("parsePushPayload", () => {
  it("reads Stalwart's verification push", () => {
    expect(parsePushPayload({ "@type": "PushVerification", pushSubscriptionId: "b", verificationCode: "abc123" })).toEqual({
      kind: "verification",
      message: { type: PUSH_VERIFICATION, pushSubscriptionId: "b", verificationCode: "abc123" },
    });
    expect(parsePushPayload({ "@type": "PushVerification", pushSubscriptionId: "b" }).kind).toBe("unknown");
  });

  it("reads an EmailPush's sender, subject and conversation, and nothing else", () => {
    const payload = parsePushPayload({
      "@type": "EmailPush",
      accountId: "b",
      emails: [{ id: "e1", threadId: "T1", from: [{ name: "Bob Baker", email: "bob@postern.test" }], subject: "Lunch?", preview: "never shown" }],
    });
    expect(payload).toEqual({ kind: "mail", messages: [{ threadId: "T1", from: [{ name: "Bob Baker", email: "bob@postern.test" }], subject: "Lunch?" }] });
  });

  it("falls back to a delivery when an EmailPush has no usable email", () => {
    expect(parsePushPayload({ "@type": "EmailPush", accountId: "b", emails: [{ id: "e1" }] }).kind).toBe("delivery");
  });

  it("tells a delivery StateChange from other changes", () => {
    expect(parsePushPayload({ "@type": "StateChange", changed: { b: { EmailDelivery: "s1", Email: "s2" } } }).kind).toBe("delivery");
    expect(parsePushPayload({ "@type": "StateChange", changed: { b: { Mailbox: "s3" } } }).kind).toBe("quiet");
  });

  it("calls anything else unknown", () => {
    expect(parsePushPayload(null).kind).toBe("unknown");
    expect(parsePushPayload("Test push message from DevTools.").kind).toBe("unknown");
    expect(parsePushPayload({ "@type": "CalendarAlert" }).kind).toBe("unknown");
  });
});

describe("notificationsFor", () => {
  it("shows sender and subject per conversation, opening it on click", () => {
    const [n, ...rest] = notificationsFor({ kind: "mail", messages: [{ threadId: "T1", from: [{ name: "Bob Baker", email: "bob@postern.test" }], subject: "Lunch?" }] }, IMAGES);
    expect(rest).toEqual([]);
    expect(n).toEqual({ title: "Bob Baker", options: { ...IMAGES, body: "Lunch?", tag: "T1", data: { hash: "#inbox/T1" } } });
  });

  it("uses the address without a name, and a placeholder without a subject", () => {
    const [n] = notificationsFor({ kind: "mail", messages: [{ threadId: "T1", from: [{ name: null, email: "bob@postern.test" }], subject: "  " }] }, IMAGES);
    expect(n?.title).toBe("bob@postern.test");
    expect(n?.options.body).toBe("(no subject)");
  });

  it("merges a burst into one", () => {
    const messages = ["1", "2", "3", "4"].map((i) => ({ threadId: `T${i}`, from: null, subject: `s${i}` }));
    const shown = notificationsFor({ kind: "mail", messages }, IMAGES);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.title).toBe("4 new messages");
    expect(shown[0]?.options.data.hash).toBe("#inbox/T4");
  });

  it("is generic and coalesced without sender details", () => {
    for (const kind of ["delivery", "unknown"] as const) {
      const [n] = notificationsFor({ kind }, IMAGES);
      expect(n?.title).toBe("New mail in Postern");
      expect(n?.options.tag).toBe("postern-new-mail");
      expect(n?.options.data.hash).toBe("#inbox");
    }
  });

  it("shows nothing for a verification or a non-delivery change", () => {
    expect(notificationsFor({ kind: "quiet" }, IMAGES)).toEqual([]);
    expect(notificationsFor({ kind: "verification", message: { type: PUSH_VERIFICATION, pushSubscriptionId: "b", verificationCode: "c" } }, IMAGES)).toEqual([]);
  });
});

describe("windows", () => {
  const ORIGIN = "https://estate.example";
  const win = (path: string, visibilityState: DocumentVisibilityState = "hidden", focused = false, origin = ORIGIN): WindowLike & { name: string } => ({
    url: `${origin}${path}`,
    visibilityState,
    focused,
    name: path,
  });

  it("counts only Postern's own windows", () => {
    const all = [win("/webmail/#inbox"), win("/atrium/", "visible", true), win("/webmail/", "hidden", false, "https://other.example")];
    expect(appWindows(all, ORIGIN, "/webmail/").map((w) => w.name)).toEqual(["/webmail/#inbox"]);
  });

  it("stays quiet when a Postern window is visible or focused", () => {
    expect(anyVisible([win("/webmail/")])).toBe(false);
    expect(anyVisible([win("/webmail/", "visible")])).toBe(true);
    expect(anyVisible([win("/webmail/", "hidden", true)])).toBe(true);
    expect(anyVisible([])).toBe(false);
  });

  it("sends a click to a focused window, else a visible one, else any", () => {
    expect(windowForClick([win("/webmail/a"), win("/webmail/b", "visible"), win("/webmail/c", "hidden", true)])?.name).toBe("/webmail/c");
    expect(windowForClick([win("/webmail/a"), win("/webmail/b", "visible")])?.name).toBe("/webmail/b");
    expect(windowForClick([win("/webmail/a")])?.name).toBe("/webmail/a");
    expect(windowForClick([])).toBeNull();
  });
});

describe("click routes", () => {
  it("opens only the Inbox or a conversation in it", () => {
    expect(hashFor("T1")).toBe("#inbox/T1");
    expect(hashFor(undefined)).toBe("#inbox");
    expect(hashFor("../../evil")).toBe("#inbox");
    expect(clickHash({ hash: "#inbox/T1" })).toBe("#inbox/T1");
    expect(clickHash({ hash: "#settings" })).toBe("#inbox");
    expect(clickHash({ hash: "https://evil.example/" })).toBe("#inbox");
    expect(clickHash(null)).toBe("#inbox");
  });
});

describe("readWorkerMessage", () => {
  it("reads the worker's messages and refuses anything else", () => {
    expect(readWorkerMessage({ type: PUSH_VERIFICATION, pushSubscriptionId: "b", verificationCode: "c" })).toEqual({
      type: PUSH_VERIFICATION,
      pushSubscriptionId: "b",
      verificationCode: "c",
    });
    expect(readWorkerMessage({ type: OPEN, hash: "#inbox/T1" })).toEqual({ type: OPEN, hash: "#inbox/T1" });
    expect(readWorkerMessage({ type: OPEN, hash: "javascript:alert(1)" })).toBeNull();
    expect(readWorkerMessage({ type: WILL_NOTIFY })).toEqual({ type: WILL_NOTIFY });
    expect(readWorkerMessage({ type: PUSH_VERIFICATION, pushSubscriptionId: 1 })).toBeNull();
    expect(readWorkerMessage("hello")).toBeNull();
  });
});
