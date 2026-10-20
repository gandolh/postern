// @vitest-environment jsdom
// The vacation responder and Postern's filters share Stalwart's one active
// script: the form warns before turning the responder on, and turns the
// filters back on after turning it off.

import { emptyActions, emptyCriteria, generateSieve, type JmapClient, type VacationResponse } from "@postern/jmap";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionContext } from "../auth/context";
import { FakeScripts } from "../filters/fakeScripts";
import { FiltersStore, provideFiltersStore } from "../filters/store";
import { FILTERS_STOP_WARNING, VacationForm } from "./VacationForm";

/** A server where, as on Stalwart, the responder is on exactly when the "vacation" script is active. */
function setup(withFilters: boolean) {
  const io = new FakeScripts();
  io.add("vacation", 'require "vacation";');
  if (withFilters) {
    const filter = { criteria: { ...emptyCriteria(), from: ["bob@postern.test"] }, actions: { ...emptyActions(), star: true } };
    io.add("postern", generateSieve({ filters: [filter], blocked: [], includes: [] }), true);
  }
  const vacationId = io.scripts.find((s) => s.name === "vacation")!.id;
  const vacation = (): VacationResponse => ({
    id: "singleton",
    isEnabled: io.active() === "vacation",
    fromDate: null,
    toDate: null,
    subject: null,
    textBody: null,
    htmlBody: null,
  });
  const set = vi.fn(async (patch: Partial<VacationResponse>) => {
    if (patch.isEnabled === true) await io.activate(vacationId);
    if (patch.isEnabled === false && io.active() === "vacation") for (const s of io.scripts) s.isActive = false;
  });
  const client = {
    session: { hasCapability: () => true },
    vacationResponse: { get: async () => vacation(), set },
  } as unknown as JmapClient;
  provideFiltersStore(client, new FiltersStore(io));
  render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <VacationForm />
    </SessionContext.Provider>,
  );
  return { io, set, user: userEvent.setup() };
}

afterEach(() => cleanup());

describe("the vacation responder and filters", () => {
  it("warns before turning the responder on when filters exist, and does nothing on Cancel", async () => {
    const { io, set, user } = setup(true);
    await screen.findByText(FILTERS_STOP_WARNING);
    await user.click(screen.getByRole("checkbox", { name: "Vacation responder on" }));
    expect(screen.getByRole("heading", { name: "Turn on the vacation responder?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(set).not.toHaveBeenCalled();
    expect(io.active()).toBe("postern");
  });

  it("turns it on after confirming, then off again with the filters back on", async () => {
    const { io, set, user } = setup(true);
    await screen.findByText(FILTERS_STOP_WARNING);
    await user.click(screen.getByRole("checkbox", { name: "Vacation responder on" }));
    await user.click(screen.getByRole("button", { name: "Turn it on" }));
    expect(set).toHaveBeenLastCalledWith({ isEnabled: true });
    expect(io.active()).toBe("vacation");
    await screen.findByText("Your filters are off while the vacation responder is on.");

    await user.click(screen.getByRole("checkbox", { name: "Vacation responder on" }));
    expect(set).toHaveBeenLastCalledWith({ isEnabled: false });
    await screen.findByText("Your filters are on again.");
    expect(io.active()).toBe("postern");
  });

  it("asks nothing and activates nothing when there are no filters", async () => {
    const { io, set, user } = setup(false);
    const box = await screen.findByRole("checkbox", { name: "Vacation responder on" });
    await waitFor(() => expect(screen.queryByText(FILTERS_STOP_WARNING)).toBeNull());
    await user.click(box);
    expect(set).toHaveBeenLastCalledWith({ isEnabled: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(box);
    expect(set).toHaveBeenLastCalledWith({ isEnabled: false });
    await waitFor(() => expect(io.active()).toBeNull());
    expect(io.scripts.map((s) => s.name)).toEqual(["vacation"]);
  });
});
