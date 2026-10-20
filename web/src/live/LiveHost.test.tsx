// @vitest-environment jsdom
import type { JmapClient, PushStatus, StateChange } from "@postern/jmap";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionContext, type SignedInSession } from "../auth/context";
import { LabelsStore } from "../labels/labelsStore";
import { LabelsStoreProvider } from "../labels/useLabels";
import { StatusSlot, StatusSlotProvider } from "../shell/status";
import { LiveHost } from "./LiveHost";

class FakeReader {
  status: PushStatus = "connecting";
  #status = new Set<(s: PushStatus) => void>();
  #change = new Set<(c: StateChange) => void>();
  start = vi.fn();
  stop = vi.fn(async () => {});
  onStatus(fn: (s: PushStatus) => void) {
    this.#status.add(fn);
    return () => this.#status.delete(fn);
  }
  onStateChange(fn: (c: StateChange) => void) {
    this.#change.add(fn);
    return () => this.#change.delete(fn);
  }
  set(s: PushStatus) {
    this.status = s;
    for (const f of this.#status) f(s);
  }
  emit(c: StateChange) {
    for (const f of this.#change) f(c);
  }
}

function setup() {
  const reader = new FakeReader();
  const call = vi.fn(async (name: string) => {
    if (name === "Mailbox/get") return { accountId: "A", state: "m1", list: [], notFound: [] };
    throw new Error(`unexpected ${name}`);
  });
  const client = { accountId: "A", call, push: vi.fn(() => reader), request: () => { throw new Error("no"); } } as unknown as JmapClient;
  const session: SignedInSession = { client, account: { username: "alice@postern.test" }, signOut: async () => {} };
  const store = new LabelsStore(client, () => "A");
  const applied = vi.spyOn(store, "applyStateChange");
  const ui = render(
    <SessionContext.Provider value={session}>
      <StatusSlotProvider>
        <StatusSlot />
        <LabelsStoreProvider store={store}>
          <LiveHost />
        </LabelsStoreProvider>
      </StatusSlotProvider>
    </SessionContext.Provider>,
  );
  return { reader, client, applied, ...ui };
}

afterEach(cleanup);

describe("LiveHost", () => {
  it("starts one reader and stops it on unmount", () => {
    const { reader, client, unmount } = setup();
    expect(client.push).toHaveBeenCalledTimes(1);
    expect(reader.start).toHaveBeenCalledTimes(1);
    unmount();
    expect(reader.stop).toHaveBeenCalled();
  });

  it("shows Reconnecting… and Checking for mail while degraded, nothing when open", async () => {
    const { reader } = setup();
    act(() => reader.set("open"));
    expect(screen.queryByRole("status")).toBeNull();
    act(() => reader.set("reconnecting"));
    expect(screen.getByRole("status").textContent).toBe("Reconnecting…");
    act(() => reader.set("open"));
    expect(screen.queryByRole("status")).toBeNull();
    act(() => reader.set("polling"));
    expect(screen.getByRole("status").textContent).toBe("Checking for mail every 30 seconds");
  });

  it("hands each state change to the labels", () => {
    const { reader, applied } = setup();
    const change: StateChange = { "@type": "StateChange", changed: { A: { Mailbox: "m2" } } };
    act(() => reader.emit(change));
    expect(applied).toHaveBeenCalledWith(change);
  });
});
