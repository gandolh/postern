// @vitest-environment jsdom
// The toast wrapper holds the app's rules: one at a time, Undo, the timer that
// pauses, and the live region that is in the page before the first toast.

import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast, type ToastOptions } from "./Toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Trigger({ options, label = "Show" }: { options: ToastOptions; label?: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(options)}>
      {label}
    </button>
  );
}

function setup(...triggers: { options: ToastOptions; label: string }[]) {
  return render(
    <ToastProvider>
      {triggers.map((t) => (
        <Trigger key={t.label} {...t} />
      ))}
    </ToastProvider>,
  );
}

const region = () => screen.getByRole("region");

describe("the toast", () => {
  it("has its live region in the page before the first toast, and announces into it", async () => {
    const user = userEvent.setup();
    setup({ label: "Archive", options: { message: "Conversation archived." } });
    expect(region().getAttribute("aria-live")).toBe("polite");
    expect(region().textContent).toBe("");
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(within(region()).getByText("Conversation archived.")).toBeTruthy();
  });

  it("runs Undo and closes", async () => {
    const user = userEvent.setup();
    const undo = vi.fn();
    setup({
      label: "Archive",
      options: { message: "Conversation archived.", action: { label: "Undo", onClick: undo } },
    });
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(within(region()).getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText("Conversation archived.")).toBeNull();
  });

  it("shows one at a time: a second replaces the first, and the first does not come back", async () => {
    const user = userEvent.setup();
    setup(
      { label: "First", options: { message: "One" } },
      { label: "Second", options: { message: "Two", duration: null } },
    );
    await user.click(screen.getByRole("button", { name: "First" }));
    await user.click(screen.getByRole("button", { name: "Second" }));
    expect(screen.queryByText("One")).toBeNull();
    expect(within(region()).getByText("Two")).toBeTruthy();
    expect(within(region()).queryAllByRole("dialog")).toHaveLength(1);
  });

  it("goes by itself after its duration, and a null duration stays", async () => {
    vi.useFakeTimers();
    setup(
      { label: "Timed", options: { message: "Saved", duration: 1000 } },
      { label: "Stays", options: { message: "Failed", duration: null } },
    );
    act(() => screen.getByRole("button", { name: "Timed" }).click());
    expect(screen.getByText("Saved")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByText("Saved")).toBeNull();

    act(() => screen.getByRole("button", { name: "Stays" }).click());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText("Failed")).toBeTruthy();
  });

  it("waits while the pointer is over it, then goes", async () => {
    vi.useFakeTimers();
    setup({ label: "Timed", options: { message: "Saved", duration: 1000 } });
    act(() => screen.getByRole("button", { name: "Timed" }).click());
    const toast = screen.getByRole("dialog");
    act(() => {
      vi.advanceTimersByTime(500);
      toast.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      region().dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      region().dispatchEvent(new MouseEvent("mouseenter"));
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Saved")).toBeTruthy();
    act(() => {
      region().dispatchEvent(new MouseEvent("mouseleave"));
      region().dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText("Saved")).toBeNull();
  });
});
