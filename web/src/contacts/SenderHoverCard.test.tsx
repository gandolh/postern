// @vitest-environment jsdom
// The sender's card opens on pointer rest and on keyboard focus, closes on Escape and blur.

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionContext } from "../auth/context";
import { ToastProvider } from "../shell/toast";
import { card, FakeContacts } from "./fakeContacts";
import { OPEN_DELAY_MS, SenderHoverCard } from "./SenderHoverCard";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderCard(fake: FakeContacts) {
  return render(
    <SessionContext.Provider value={fake.session}>
      <ToastProvider>
        <SenderHoverCard address={{ name: "Bob Baker", email: "bob@x.test" }}>
          <button type="button">Bob Baker</button>
        </SenderHoverCard>
        <button type="button">elsewhere</button>
      </ToastProvider>
    </SessionContext.Provider>,
  );
}

describe("SenderHoverCard", () => {
  it("opens on keyboard focus, is reachable by Tab, and closes on Escape or when focus leaves", async () => {
    const user = userEvent.setup();
    renderCard(new FakeContacts());
    expect(screen.queryByRole("group", { name: "About Bob Baker" })).toBeNull();
    await user.tab();
    const group = await screen.findByRole("group", { name: "About Bob Baker" });
    expect(group.textContent).toContain("bob@x.test");
    await user.tab();
    expect(document.activeElement?.textContent).toContain("Add to contacts");
    expect(screen.getByRole("group", { name: "About Bob Baker" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "About Bob Baker" })).toBeNull();
    act(() => screen.getByRole("button", { name: "Bob Baker" }).focus());
    expect(await screen.findByRole("group", { name: "About Bob Baker" })).toBeTruthy();
    act(() => screen.getByRole("button", { name: "elsewhere" }).focus());
    expect(screen.queryByRole("group", { name: "About Bob Baker" })).toBeNull();
  });

  it("opens when the pointer rests and closes when it leaves", async () => {
    vi.useFakeTimers();
    renderCard(new FakeContacts());
    const trigger = screen.getByRole("button", { name: "Bob Baker" });
    fireEvent.mouseEnter(trigger.parentElement!);
    expect(screen.queryByRole("group")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY_MS + 1);
    });
    expect(screen.getByRole("group", { name: "About Bob Baker" })).toBeTruthy();
    fireEvent.mouseLeave(trigger.parentElement!);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("adds the sender to the contacts, then says they are in them", async () => {
    const user = userEvent.setup();
    const fake = new FakeContacts();
    renderCard(fake);
    await user.tab();
    const add = await screen.findByRole("button", { name: /Add to contacts/ });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    await user.click(add);
    await waitFor(() => expect(fake.cards).toHaveLength(1));
    expect(fake.cards[0]).toMatchObject({ name: { full: "Bob Baker" }, emails: { e1: { address: "bob@x.test" } } });
    expect(await screen.findByRole("button", { name: "In your contacts" })).toBeTruthy();
  });

  it("knows a sender who is already a contact", async () => {
    const user = userEvent.setup();
    renderCard(new FakeContacts([card("1", "Bobby", ["BOB@x.test"])]));
    await user.tab();
    expect(await screen.findByRole("button", { name: "In your contacts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Email/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Search mail from/ })).toBeTruthy();
  });
});
