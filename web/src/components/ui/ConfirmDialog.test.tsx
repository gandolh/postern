// @vitest-environment jsdom
// ConfirmDialog's pending state: while onConfirm's promise runs, nothing closes it.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function setup(onConfirm: () => void | Promise<unknown>) {
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Empty Trash?"
      body="Gone for good."
      confirmLabel="Empty"
      pendingLabel="Emptying…"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onCancel };
}

describe("ConfirmDialog", () => {
  it("puts focus on Cancel and confirms at once for a plain callback", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    setup(onConfirm);
    const dialog = screen.getByRole("alertdialog", { name: "Empty Trash?" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" })));
    await user.click(screen.getByRole("button", { name: "Empty" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(dialog.isConnected).toBe(true);
    expect((screen.getByRole("button", { name: "Empty" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("cannot be closed by Escape, Cancel or a press outside while its promise runs", async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { onCancel } = setup(onConfirm);
    await user.click(screen.getByRole("button", { name: "Empty" }));

    const confirm = screen.getByRole("button", { name: "Emptying…" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();

    await user.keyboard("{Escape}");
    await user.click(document.body);
    expect(onCancel).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Empty" })).toBeTruthy());
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
