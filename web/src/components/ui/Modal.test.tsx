// @vitest-environment jsdom
// Modal holds logic of its own: the Escape guard, initial focus, pointer
// dismissal for forms and the layer a dialog opens in.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal, layerFor, type ModalProps } from "./Modal";

afterEach(cleanup);

function Host(props: Partial<ModalProps> & { field?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button">Behind</button>
      {open ? (
        <Modal
          className="x"
          alert={props.alert}
          disablePointerDismissal={props.disablePointerDismissal}
          dismissible={props.dismissible}
          onClose={() => {
            props.onClose?.();
            setOpen(false);
          }}
        >
          <Modal.Title>Title text</Modal.Title>
          <button type="button">First</button>
          <input
            aria-label="Field"
            data-autofocus
            onKeyDown={(e) => {
              // A field's own list uses Escape (a combobox): the dialog isn't asked.
              if (props.field && e.key === "Escape") e.preventDefault();
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}

/** Base UI moves focus in a frame after it mounts. */
const focusedField = () =>
  waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Field" })));

describe("Modal", () => {
  it("is named by its Title, as a dialog or an alertdialog", () => {
    const { unmount } = render(<Host />);
    expect(screen.getByRole("dialog", { name: "Title text" })).toBeTruthy();
    unmount();
    render(<Host alert />);
    expect(screen.getByRole("alertdialog", { name: "Title text" })).toBeTruthy();
  });

  it("puts focus on [data-autofocus], and closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    await focusedField();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves an Escape a field's own list used alone", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Host field onClose={onClose} />);
    await focusedField();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Title text" })).toBeTruthy();
  });

  it("closes on a press outside, unless it holds a form", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = render(<Host onClose={onClose} disablePointerDismissal />);
    await focusedField();
    await user.click(document.body);
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    unmount();

    const again = vi.fn();
    render(<Host onClose={again} />);
    await user.click(document.body);
    expect(again).toHaveBeenCalledOnce();
  });

  it("ignores Escape and a press outside when it is not dismissible", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Host onClose={onClose} dismissible={false} />);
    await user.keyboard("{Escape}");
    await user.click(document.body);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens inside the composer window when one is a modal <dialog>", () => {
    const native = document.createElement("dialog");
    const inside = document.createElement("button");
    native.append(inside);
    document.body.append(native);
    // jsdom's selector engine doesn't know :modal: stand it in for this dialog.
    const matches = Element.prototype.matches;
    const spy = vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
      return selector === "dialog:modal" ? this === native : matches.call(this, selector);
    });
    try {
      expect(layerFor(inside)).toBe(native);
      expect(layerFor(document.body)).toBe(native);
    } finally {
      spy.mockRestore();
      native.remove();
    }
    expect(layerFor(inside)).toBe(document.body);
  });
});
