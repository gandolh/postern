// @vitest-environment jsdom
// The Web Push flows against fakes: a browser PushManager, Stalwart's
// PushSubscription methods, and the service worker's verification message
// delivered the way register.ts receives it.

import { JmapSetError, type Id, type PushSubscription, type PushSubscriptionCreate } from "@postern/jmap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemory } from "../prefs/storage";
import { PUSH_VERIFICATION } from "../sw/protocol";
import { onBeforeSignOut, runBeforeSignOut } from "./beforeSignOut";
import { deviceClientId } from "./device";
import { handleWorkerMessage, setSignedIn, willNotifyHere } from "./register";
import { readChoice, writeChoice } from "./settings";
import { VerificationInbox, verificationInbox } from "./verification";
import { EXPIRES_MS, WebPush, type BrowserSubscription, type PushManagerLike, type PushServer } from "./webPush";

const USER = "alice@postern.test";
const VAPID = "BFZO8yyg43toSQ9UL5VR931wJRFMyDKsZ1yN1x2bs8kwqNl7dFe3cHVSo0-Q3yfcnu7oubcYeliuoVP0s7ezse0";
const NOW = Date.parse("2026-10-20T12:00:00Z");

function keyBytes(): ArrayBuffer {
  const b64 = VAPID.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}

class FakeSubscription implements BrowserSubscription {
  unsubscribed = false;
  constructor(
    readonly endpoint: string,
    readonly options = { applicationServerKey: keyBytes() as ArrayBuffer | null },
  ) {}
  toJSON() {
    return { keys: { p256dh: "BP256", auth: "AUTH" } };
  }
  async unsubscribe() {
    this.unsubscribed = true;
    manager.current = null;
    return true;
  }
}

class FakeManager implements PushManagerLike {
  current: FakeSubscription | null = null;
  made = 0;
  async getSubscription() {
    return this.current;
  }
  async subscribe() {
    this.made++;
    this.current = new FakeSubscription(`https://fcm.googleapis.com/fcm/send/endpoint-${this.made}`);
    return this.current;
  }
}

/** Stalwart's PushSubscription methods, in memory. Sends the verification "push" through the worker path. */
class FakeServer implements PushServer {
  subs = new Map<Id, Partial<PushSubscription> & { code: string; verified: boolean; url: string }>();
  next = 1;
  /** How the worker would hand the code to the page; null = the push never arrives. */
  deliver: ((id: Id, code: string) => void) | null = (id, code) => handleWorkerMessage({ type: PUSH_VERIFICATION, pushSubscriptionId: id, verificationCode: code }, []);
  calls: string[] = [];
  async get(args: { properties: (keyof PushSubscription)[] }) {
    this.calls.push("get");
    expect(args.properties).not.toContain("url");
    return { list: [...this.subs.values()].map(({ id, deviceClientId, types, emailPush, expires }) => ({ id, deviceClientId, types, emailPush, expires })) };
  }
  async set(args: { destroy: Id[] }) {
    this.calls.push(`destroy ${args.destroy.join(",")}`);
    for (const id of args.destroy) this.subs.delete(id);
    return {};
  }
  async create(sub: PushSubscriptionCreate) {
    const id = `s${this.next++}`;
    const code = `code-${id}`;
    this.calls.push(`create ${id}`);
    this.subs.set(id, { id, deviceClientId: sub.deviceClientId, types: sub.types ?? null, emailPush: sub.emailPush ?? null, expires: sub.expires ?? null, url: sub.url, code, verified: false });
    // Stalwart pushes the code to the endpoint right away; the worker posts it to the page.
    const deliver = this.deliver;
    if (deliver) queueMicrotask(() => deliver(id, code));
    return { id };
  }
  async verify(id: Id, code: string) {
    this.calls.push(`verify ${id}`);
    const sub = this.subs.get(id);
    if (!sub || sub.code !== code) throw new JmapSetError("PushSubscription/set", id, { type: "invalidProperties", description: "Verification code does not match." });
    sub.verified = true;
  }
  async update(id: Id, patch: { expires: string }) {
    this.calls.push(`update ${id}`);
    const sub = this.subs.get(id);
    if (sub) sub.expires = patch.expires;
  }
}

let manager: FakeManager;
let server: FakeServer;
let permission: NotificationPermission;

function webPush(over: Partial<ConstructorParameters<typeof WebPush>[0]> = {}) {
  return new WebPush({
    username: USER,
    vapidKey: VAPID,
    server,
    browser: {
      pushManager: async () => manager,
      permission: () => permission,
      requestPermission: vi.fn(async () => {
        permission = "granted";
        return permission;
      }),
    },
    inbox: verificationInbox,
    emailPush: async () => ({ A: { filter: { inMailbox: "a" }, properties: ["id", "threadId", "from", "subject"] } }),
    now: () => NOW,
    verifyTimeoutMs: 200,
    ...over,
  });
}

beforeEach(() => {
  localStorage.clear();
  clearMemory();
  manager = new FakeManager();
  server = new FakeServer();
  permission = "default";
});

afterEach(() => {
  setSignedIn(false);
  vi.unstubAllGlobals();
});

describe("turning it on", () => {
  it("asks permission, subscribes, registers with Stalwart and completes the handshake", async () => {
    const push = webPush();
    await push.enable();
    expect(push.getSnapshot()).toEqual({ on: true, busy: false, problem: null });
    const [sub] = [...server.subs.values()];
    expect(sub?.verified).toBe(true);
    expect(sub?.url).toBe("https://fcm.googleapis.com/fcm/send/endpoint-1");
    expect(sub?.types).toEqual(["EmailDelivery"]);
    expect(sub?.emailPush).toEqual({ A: { filter: { inMailbox: "a" }, properties: ["id", "threadId", "from", "subject"] } });
    expect(sub?.expires).toBe(new Date(NOW + EXPIRES_MS).toISOString().replace(".000Z", "Z"));
    expect(sub?.deviceClientId).toBe(await deviceClientId(USER, "https://fcm.googleapis.com/fcm/send/endpoint-1"));
    expect(readChoice(USER)).toEqual({ on: true, verified: sub?.deviceClientId });
  });

  it("takes the code even when it arrives before PushSubscription/set answers", async () => {
    const inbox = new VerificationInbox();
    server.deliver = (id, code) => inbox.receive(id, code);
    const create = server.create.bind(server);
    server.create = async (sub) => {
      const made = await create(sub);
      await Promise.resolve(); // let the push land first
      return made;
    };
    const push = webPush({ inbox });
    await push.enable();
    expect(push.getSnapshot().on).toBe(true);
  });

  it("stays off when permission is refused", async () => {
    const push = webPush({
      browser: { pushManager: async () => manager, permission: () => "default", requestPermission: async () => "denied" },
    });
    await push.enable();
    expect(push.getSnapshot()).toEqual({ on: false, busy: false, problem: "denied" });
    expect(server.subs.size).toBe(0);
    expect(readChoice(USER).on).toBe(false);
  });

  it("says unavailable without a service worker", async () => {
    permission = "granted";
    const push = webPush({ browser: { pushManager: async () => null, permission: () => permission, requestPermission: async () => permission } });
    await push.enable();
    expect(push.getSnapshot().problem).toBe("unavailable");
  });

  it("gives up after the timeout and leaves no unverified subscription", async () => {
    server.deliver = null;
    const push = webPush();
    await push.enable();
    expect(push.getSnapshot()).toEqual({ on: false, busy: false, problem: "timeout" });
    expect(server.subs.size).toBe(0);
  });

  it("gives up on a browser whose push service never answers (Chrome without background networking)", async () => {
    manager.subscribe = () => new Promise(() => undefined);
    const push = webPush({ subscribeTimeoutMs: 50 });
    await push.enable();
    expect(push.getSnapshot()).toEqual({ on: false, busy: false, problem: "pushService" });
    expect(server.calls).toEqual([]);
  });

  it("skips a stale code for a reused id and takes the next one", async () => {
    server.deliver = (id, code) => {
      handleWorkerMessage({ type: PUSH_VERIFICATION, pushSubscriptionId: id, verificationCode: "stale" }, []);
      setTimeout(() => handleWorkerMessage({ type: PUSH_VERIFICATION, pushSubscriptionId: id, verificationCode: code }, []), 20);
    };
    const push = webPush();
    await push.enable();
    expect(push.getSnapshot()).toEqual({ on: true, busy: false, problem: null });
    expect([...server.subs.values()][0]?.verified).toBe(true);
  });

  it("gives up when only wrong codes come, and leaves nothing behind", async () => {
    server.deliver = (id) => handleWorkerMessage({ type: PUSH_VERIFICATION, pushSubscriptionId: id, verificationCode: "wrong" }, []);
    const push = webPush();
    await push.enable();
    expect(push.getSnapshot().problem).toBe("timeout");
    expect(server.subs.size).toBe(0);
  });

  it("replaces a browser subscription made for another server key", async () => {
    permission = "granted";
    manager.current = new FakeSubscription("https://fcm.googleapis.com/fcm/send/old", { applicationServerKey: new Uint8Array([1, 2, 3]).buffer });
    const old = manager.current;
    await webPush().enable();
    expect(old.unsubscribed).toBe(true);
    expect([...server.subs.values()][0]?.url).toBe("https://fcm.googleapis.com/fcm/send/endpoint-1");
  });

  it("asks for bare StateChanges when the server has no emailPush", async () => {
    await webPush({ emailPush: async () => null }).enable();
    expect([...server.subs.values()][0]?.emailPush).toBeNull();
  });
});

describe("signing in again", () => {
  it("extends the verified subscription instead of making a new one", async () => {
    await webPush().enable();
    server.calls = [];
    const later = webPush({ now: () => NOW + 86_400_000 });
    await later.refresh();
    expect(server.calls).toEqual(["get", "update s1"]);
    expect(server.subs.get("s1")?.expires).toBe(new Date(NOW + 86_400_000 + EXPIRES_MS).toISOString().replace(".000Z", "Z"));
  });

  it("makes a new one when the browser re-subscribed, and drops the old one", async () => {
    await webPush().enable();
    manager.current = null; // e.g. unsubscribed by an idle sign-out
    server.calls = [];
    await webPush().refresh();
    expect(server.calls).toEqual(["get", "destroy s1", "create s2", "verify s2"]);
    expect([...server.subs.keys()]).toEqual(["s2"]);
  });

  it("does nothing when it is off here, or permission was taken back", async () => {
    await webPush().refresh();
    expect(server.calls).toEqual([]);
    writeChoice(USER, { on: true });
    permission = "denied";
    await webPush().refresh();
    expect(server.calls).toEqual([]);
  });
});

describe("turning it off and signing out", () => {
  it("off destroys the server's copy and unsubscribes the browser", async () => {
    const push = webPush();
    await push.enable();
    const sub = manager.current;
    await push.disable();
    expect(server.subs.size).toBe(0);
    expect(sub?.unsubscribed).toBe(true);
    expect(readChoice(USER)).toEqual({ on: false, verified: null });
  });

  it("a user sign-out destroys the subscription before the tokens go, and keeps the choice", async () => {
    const push = webPush();
    await push.enable();
    const sub = manager.current;
    const off = onBeforeSignOut(() => push.forget());
    await runBeforeSignOut();
    off();
    expect(server.subs.size).toBe(0);
    expect(sub?.unsubscribed).toBe(true);
    expect(readChoice(USER)).toEqual({ on: true, verified: null });
  });

  it("a sign-out never waits more than its deadline on a hung server", async () => {
    const push = webPush();
    await push.enable();
    server.get = () => new Promise(() => undefined);
    const off = onBeforeSignOut(() => push.forget());
    const started = Date.now();
    await runBeforeSignOut(300);
    off();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("after an idle sign-out (no token) the browser still unsubscribes, and the next sign-in clears the server's copy", async () => {
    const push = webPush();
    await push.enable();
    const sub = manager.current;
    server.calls = [];
    await push.dropBrowserSubscription();
    expect(sub?.unsubscribed).toBe(true);
    expect(server.calls).toEqual([]);
    expect([...server.subs.keys()]).toEqual(["s1"]);
    await webPush().refresh();
    expect(server.calls).toEqual(["get", "destroy s1", "create s2", "verify s2"]);
    expect([...server.subs.keys()]).toEqual(["s2"]);
  });
});

describe("worker messages", () => {
  it("answers the worker's question: will this page show the mail itself?", () => {
    const port = { postMessage: vi.fn() } as unknown as MessagePort;
    handleWorkerMessage({ type: "postern:will-notify" }, [port]);
    expect(port.postMessage).toHaveBeenLastCalledWith({ willNotify: false });
    expect(willNotifyHere()).toBe(false);
  });

  it("ignores messages that are not the worker's", () => {
    const inbox = verificationInbox;
    const spy = vi.spyOn(inbox, "receive");
    handleWorkerMessage({ type: PUSH_VERIFICATION, pushSubscriptionId: 7 }, []);
    handleWorkerMessage("nonsense", []);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("opens the route a notification asks for", () => {
    handleWorkerMessage({ type: "postern:open", hash: "#inbox/T9" }, []);
    expect(window.location.hash).toBe("#inbox/T9");
    handleWorkerMessage({ type: "postern:open", hash: "#settings/general" }, []);
    expect(window.location.hash).toBe("#inbox/T9");
  });
});

describe("VerificationInbox", () => {
  it("hands a code to whoever waits for that id, and only that id", async () => {
    const inbox = new VerificationInbox();
    const a = inbox.waitFor("s1", 1000);
    inbox.receive("s2", "other");
    inbox.receive("s1", "mine");
    await expect(a).resolves.toBe("mine");
    await expect(inbox.waitFor("s2", 1000)).resolves.toBe("other");
  });

  it("times out", async () => {
    vi.useFakeTimers();
    const inbox = new VerificationInbox();
    const waiting = inbox.waitFor("s1", 500);
    const check = expect(waiting).rejects.toThrow(/No verification code/);
    await vi.advanceTimersByTimeAsync(500);
    await check;
    vi.useRealTimers();
  });
});
