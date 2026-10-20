// @vitest-environment jsdom
// Block "<sender>": asks, saves the address in Postern's script, says so with
// an Undo; Unblock takes it out.

import { generateSieve, parseFilterScript, SessionExpiredError } from "@postern/jmap";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { FakeMail, MAILBOXES } from "../actions/fakeMail";
import { clearUndo, peekUndo, undoLast } from "../actions/undo";
import { SessionContext } from "../auth/context";
import { ToastProvider } from "../shell/toast";
import { useBlockSender } from "./BlockSender";
import { FakeScripts } from "./fakeScripts";
import { FiltersStore, provideFiltersStore } from "./store";

function Harness() {
  const block = useBlockSender();
  const bob = { name: "Bob Baker", email: "Bob@postern.test" };
  return (
    <>
      <p>{block.isBlocked(bob.email) ? "blocked" : "not blocked"}</p>
      <button type="button" onClick={() => (block.isBlocked(bob.email) ? void block.unblock(bob.email) : block.ask(bob))}>
        menu
      </button>
      {block.dialog}
    </>
  );
}

async function renderHarness(io: FakeScripts) {
  const client = await new FakeMail({ mailboxes: MAILBOXES, emails: [] }).connect();
  provideFiltersStore(client, new FiltersStore(io));
  render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </SessionContext.Provider>,
  );
  await screen.findByText("not blocked");
  return userEvent.setup();
}

afterEach(() => {
  cleanup();
  clearUndo();
});

describe("Block sender", () => {
  it("asks, blocks, offers Undo", async () => {
    const io = new FakeScripts();
    const user = await renderHarness(io);
    await user.click(screen.getByRole("button", { name: "menu" }));
    expect(screen.getByRole("heading", { name: "Block Bob Baker?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Block" }));
    await screen.findByText("bob@postern.test blocked. New messages from them will go to Spam.");
    expect(screen.getByText("blocked")).toBeTruthy();
    expect(parseFilterScript(io.source("postern")).blocked).toEqual(["bob@postern.test"]);
    expect(io.active()).toBe("postern");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByText("bob@postern.test unblocked.");
    expect(parseFilterScript(io.source("postern")).blocked).toEqual([]);
  });

  it("is in the shared undo list: z undoes the block", async () => {
    const io = new FakeScripts();
    const user = await renderHarness(io);
    await user.click(screen.getByRole("button", { name: "menu" }));
    await user.click(screen.getByRole("button", { name: "Block" }));
    await screen.findByText("bob@postern.test blocked. New messages from them will go to Spam.");
    expect(peekUndo()).toEqual({ label: "bob@postern.test blocked." });
    await act(async () => {
      expect(await undoLast()).toBe(true);
    });
    await screen.findByText("bob@postern.test unblocked.");
    expect(parseFilterScript(io.source("postern")).blocked).toEqual([]);
    expect(peekUndo()).toBeNull();
  });

  it("says nothing when the session expired under it (the sign-in layer does)", async () => {
    const io = new FakeScripts();
    const user = await renderHarness(io);
    io.save = async () => {
      throw new SessionExpiredError();
    };
    await user.click(screen.getByRole("button", { name: "menu" }));
    await user.click(screen.getByRole("button", { name: "Block" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Couldn't block/)).toBeNull();
    expect(screen.queryByText(/blocked\./)).toBeNull();
  });

  it("says when the server refused for any other reason", async () => {
    const io = new FakeScripts();
    const user = await renderHarness(io);
    io.save = async () => {
      throw new Error("the script store is full");
    };
    await user.click(screen.getByRole("button", { name: "menu" }));
    await user.click(screen.getByRole("button", { name: "Block" }));
    await screen.findByText("Couldn't block bob@postern.test: the script store is full");
  });

  it("cancel does nothing", async () => {
    const io = new FakeScripts();
    const user = await renderHarness(io);
    await user.click(screen.getByRole("button", { name: "menu" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(io.saves).toEqual([]);
  });

  it("says filters are off while the vacation responder is on", async () => {
    const io = new FakeScripts();
    io.add("vacation", 'require "vacation";', true);
    const user = await renderHarness(io);
    await user.click(screen.getByRole("button", { name: "menu" }));
    await user.click(screen.getByRole("button", { name: "Block" }));
    await screen.findByText(/blocked\. New messages from them will go to Spam\. Filters are off while your vacation responder is on\./);
    expect(io.active()).toBe("vacation");
  });

  it("unblocks an address already blocked, without asking", async () => {
    const io = new FakeScripts();
    io.add("postern", generateSieve({ filters: [], blocked: ["bob@postern.test"], includes: [] }), true);
    const client = await new FakeMail({ mailboxes: MAILBOXES, emails: [] }).connect();
    provideFiltersStore(client, new FiltersStore(io));
    render(
      <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
        <ToastProvider>
          <Harness />
        </ToastProvider>
      </SessionContext.Provider>,
    );
    await screen.findByText("blocked");
    await userEvent.setup().click(screen.getByRole("button", { name: "menu" }));
    await waitFor(() => expect(parseFilterScript(io.source("postern")).blocked).toEqual([]));
  });
});
