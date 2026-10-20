// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { setShortcutsEnabled } from "../prefs";
import { HelpSheet } from "./HelpSheet";
import { KeysProvider, useHelpSheet } from "./helpSheet";

function Opener() {
  const help = useHelpSheet();
  return (
    <button type="button" onClick={help.open}>
      open help
    </button>
  );
}

function setup() {
  return render(
    <KeysProvider>
      <Opener />
      <HelpSheet />
    </KeysProvider>,
  );
}

afterEach(() => {
  cleanup();
  setShortcutsEnabled(true);
});

describe("HelpSheet", () => {
  it("opens, lists the groups and finds a shortcut by what it does", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "open help" }));
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts", hidden: true });
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(within(dialog).getAllByRole("heading", { level: 3, hidden: true }).map((h) => h.textContent)).toEqual(["Navigation", "Application", "Conversations", "Composing"]);

    await user.type(within(dialog).getByRole("textbox", { name: "Search shortcuts", hidden: true }), "archive");
    const items = within(dialog).getAllByRole("listitem", { hidden: true });
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain("Archive");
    expect(items[0]!.querySelector("kbd")?.textContent).toBe("e");
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "open help" }));
    await user.type(screen.getByRole("textbox", { name: "Search shortcuts", hidden: true }), "qqqq");
    expect(screen.getByText(/No shortcut matches/)).toBeTruthy();
  });

  it("warns when shortcuts are switched off in settings", async () => {
    setShortcutsEnabled(false);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "open help" }));
    expect(screen.getByText(/Keyboard shortcuts are off/)).toBeTruthy();
  });
});
