// @vitest-environment jsdom
// Finding F8: the page takes worker messages only from Postern's own worker.

import { afterEach, describe, expect, it, vi } from "vitest";
import { PUSH_VERIFICATION } from "../sw/protocol";
import { acceptsSource, receiveWorkerMessage, type WorkerLike } from "./register";
import { verificationInbox } from "./verification";

const SCRIPT = "https://estate.example/webmail/sw.js";
const ours: WorkerLike = { scriptURL: SCRIPT };
const another: WorkerLike = { scriptURL: "https://estate.example/atrium/sw.js" };
const lookalike: WorkerLike = { scriptURL: SCRIPT }; // the right script, but not the registration's active worker

afterEach(() => vi.restoreAllMocks());

describe("acceptsSource", () => {
  it("accepts the registration's active worker running /webmail/sw.js", () => {
    expect(acceptsSource(ours, [ours], SCRIPT)).toBe(true);
  });

  it("refuses another app's worker, a worker that is not the active one, a window, or nothing", () => {
    expect(acceptsSource(another, [another], SCRIPT)).toBe(false);
    expect(acceptsSource(lookalike, [ours], SCRIPT)).toBe(false);
    expect(acceptsSource(ours, [null], SCRIPT)).toBe(false);
    expect(acceptsSource({ url: "https://estate.example/webmail/" }, [ours], SCRIPT)).toBe(false);
    expect(acceptsSource(null, [ours], SCRIPT)).toBe(false);
  });
});

describe("receiveWorkerMessage", () => {
  const verification = { type: PUSH_VERIFICATION, pushSubscriptionId: "s9", verificationCode: "code" };

  it("hands on a message from the controller", async () => {
    const receive = vi.spyOn(verificationInbox, "receive");
    const handled = await receiveWorkerMessage({ data: verification, ports: [], source: ours as MessageEventSource }, { controller: () => ours, active: async () => ours, scriptUrl: SCRIPT });
    expect(handled).toBe(true);
    expect(receive).toHaveBeenCalledWith("s9", "code");
  });

  it("asks the registration when the page is not controlled yet", async () => {
    const handled = await receiveWorkerMessage({ data: verification, ports: [], source: ours as MessageEventSource }, { controller: () => null, active: async () => ours, scriptUrl: SCRIPT });
    expect(handled).toBe(true);
  });

  it("drops a fake verification from another app's worker, and a question it asks", async () => {
    const receive = vi.spyOn(verificationInbox, "receive");
    const port = { postMessage: vi.fn() } as unknown as MessagePort;
    const lookup = { controller: () => ours, active: async () => ours, scriptUrl: SCRIPT };
    expect(await receiveWorkerMessage({ data: verification, ports: [], source: another as MessageEventSource }, lookup)).toBe(false);
    expect(await receiveWorkerMessage({ data: { type: "postern:will-notify" }, ports: [port], source: lookalike as MessageEventSource }, lookup)).toBe(false);
    expect(receive).not.toHaveBeenCalled();
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});
