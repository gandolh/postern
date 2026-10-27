// @vitest-environment jsdom
// The composer window as a person uses it: chips (valid and invalid), the
// checks before sending (an invalid address, the "attached" warning), Ctrl+Enter.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runBeforeSignOut } from "../auth/beforeSignOut";
import { SessionContext } from "../auth/context";
import { LabelsStore } from "../labels/labelsStore";
import { LabelsStoreProvider } from "../labels/useLabels";
import { ComposeTestServer } from "../send/testServer";
import { setUndoSendDelay, DEFAULT_UNDO_SEND_DELAY_MS } from "../send/undoDelay";
import { ToastProvider } from "../shell/toast";
import { ComposerHost, ComposerProvider, useCompose } from ".";

beforeAll(() => {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
});

function Opener() {
  const compose = useCompose();
  return (
    <button type="button" onClick={() => compose.open()}>
      Compose
    </button>
  );
}

let server: ComposeTestServer;

async function renderComposer(options: { maxDelayedSend?: number } = {}) {
  server = new ComposeTestServer(options);
  const client = await server.connect();
  const labels = new LabelsStore(client, () => "A");
  const user = userEvent.setup();
  render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <LabelsStoreProvider store={labels}>
        <ToastProvider>
          <ComposerProvider>
            <Opener />
            <ComposerHost />
          </ComposerProvider>
        </ToastProvider>
      </LabelsStoreProvider>
    </SessionContext.Provider>,
  );
  await user.click(screen.getByRole("button", { name: "Compose" }));
  const window = await screen.findByRole("dialog", { name: "New Message" });
  await within(window).findByRole("combobox", { name: "To" });
  return { user, window };
}

/** Type into the contentEditable body (jsdom has no editing): put text in, fire input. */
function write(window: HTMLElement, text: string) {
  const body = within(window).getByRole("textbox", { name: "Message body" });
  const line = document.createElement("div");
  line.textContent = text;
  body.replaceChildren(line);
  fireEvent.input(body);
}

beforeEach(() => setUndoSendDelay(50));
afterEach(() => {
  cleanup();
  setUndoSendDelay(DEFAULT_UNDO_SEND_DELAY_MS);
});

describe("the composer window", () => {
  it("turns typed and pasted addresses into chips, marking the invalid ones", async () => {
    const { user, window } = await renderComposer();
    const to = within(window).getByRole("combobox", { name: "To" });
    await user.type(to, "bob@postern.test,");
    await user.click(to);
    await user.paste("Carol <carol@example.org>; not-an-address");
    const chips = within(window).getByRole("list", { name: "To recipients" });
    expect(within(chips).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["bob@postern.test", "Carol", "not-an-address (not a valid email address)", ""]);
    expect(to.getAttribute("aria-invalid")).toBe("true");
    // Backspace takes the last chip back into the box to fix it.
    await user.type(to, "{Backspace}");
    expect((to as HTMLInputElement).value).toBe("not-an-address");
  });

  it("refuses to send to an invalid address, then warns about a missing attachment", async () => {
    const { user, window } = await renderComposer();
    const to = within(window).getByRole("combobox", { name: "To" });
    await user.type(to, "bob@postern.test, nope{Enter}");
    write(window, "The plan is attached.");
    await user.click(within(window).getByRole("button", { name: "Send" }));
    expect(within(window).getByRole("alert").textContent).toMatch(/“nope” isn't a valid email address/);
    await user.click(within(window).getByRole("button", { name: "Remove nope" }));
    await user.click(within(window).getByRole("button", { name: "Send" }));
    const question = await screen.findByRole("alertdialog", { name: "Did you mean to attach files?" });
    await user.click(within(question).getByRole("button", { name: "Cancel" }));
    expect(server.submissions).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "New Message" })).toBeTruthy();
  });

  it("sends with Ctrl+Enter, holding the message for Undo first", async () => {
    const { user, window } = await renderComposer();
    await user.type(within(window).getByRole("textbox", { name: "Subject" }), "Lunch");
    write(window, "Noon?");
    // The address is still being typed when Ctrl+Enter comes: it is taken, then sent.
    await user.type(within(window).getByRole("combobox", { name: "To" }), "bob@postern.test");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await screen.findByText("Message sent.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Lunch/ })).toBeNull());
    await waitFor(() => expect(server.submissions).toHaveLength(1));
    await screen.findByRole("button", { name: "View message" });
    const sent = [...server.emails.values()][0]!;
    expect(sent["subject"]).toBe("Lunch");
    expect((sent["bodyValues"] as Record<string, { value: string }>)["html"]?.value).toBe("<div>Noon?</div>");
    expect((sent["bodyValues"] as Record<string, { value: string }>)["text"]?.value).toBe("Noon?");
  });

  it("has no Schedule send where the server cannot hold a message", async () => {
    const { window } = await renderComposer();
    expect(within(window).queryByRole("button", { name: "More send options" })).toBeNull();
  });

  // Many steps of user input: more than the default 5 s on a loaded machine.
  it("schedules from the menu beside Send: a preset, or a picked date and time, after the same checks (brief 23)", { timeout: 20_000 }, async () => {
    const { user, window } = await renderComposer({ maxDelayedSend: 2_592_000 });
    await user.click(within(window).getByRole("button", { name: "More send options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Schedule send" }));
    let dialog = await screen.findByRole("dialog", { name: "Schedule send" });
    await user.click(within(dialog).getByRole("button", { name: /^Tomorrow morning/ }));
    // No recipient yet: the check Send makes stops it, and nothing is submitted.
    expect(within(window).getByRole("alert").textContent).toBe("Add at least one recipient.");
    expect(server.submissions).toHaveLength(0);

    await user.type(within(window).getByRole("combobox", { name: "To" }), "bob@postern.test{Enter}");
    await user.type(within(window).getByRole("textbox", { name: "Subject" }), "Lunch");
    write(window, "Noon?");
    await user.click(within(window).getByRole("button", { name: "More send options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Schedule send" }));
    dialog = await screen.findByRole("dialog", { name: "Schedule send" });
    await user.click(within(dialog).getByRole("button", { name: "Pick date and time" }));
    const date = within(dialog).getByLabelText("Date");
    expect(document.activeElement).toBe(date);
    fireEvent.change(date, { target: { value: "2020-01-01" } });
    await user.click(within(dialog).getByRole("button", { name: "Schedule send" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Choose a time at least a minute from now.");
    const next = new Date();
    next.setDate(next.getDate() + 2);
    const day = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    fireEvent.change(date, { target: { value: day } });
    fireEvent.change(within(dialog).getByLabelText("Time"), { target: { value: "09:30" } });
    await user.click(within(dialog).getByRole("button", { name: "Schedule send" }));

    await screen.findByText(/^Send scheduled for /);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Lunch/ })).toBeNull());
    expect(server.submissions).toHaveLength(1);
    const hold = (server.submissions[0]!["envelope"] as { mailFrom: { parameters: Record<string, string> } }).mailFrom.parameters["HOLDUNTIL"];
    expect(new Date(hold!).getTime()).toBe(new Date(next.getFullYear(), next.getMonth(), next.getDate(), 9, 30).getTime());
    expect([...server.emails.values()][0]!.keywords).toMatchObject({ $draft: true, $scheduled: true });
  });

  it("before a sign-out, the message held for Undo goes out and the typed text is saved", async () => {
    setUndoSendDelay(60_000);
    const { user, window } = await renderComposer();
    await user.type(within(window).getByRole("combobox", { name: "To" }), "bob@postern.test,");
    await user.type(within(window).getByRole("textbox", { name: "Subject" }), "Sent before sign-out");
    write(window, "Bye");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await screen.findByText("Message sent.");
    // A second message, typed but not autosaved yet.
    await user.click(screen.getByRole("button", { name: "Compose" }));
    const second = await screen.findByRole("dialog", { name: "New Message" });
    await user.type(within(second).getByRole("textbox", { name: "Subject" }), "Unsaved");
    expect(server.submissions).toHaveLength(0);

    await act(() => runBeforeSignOut());

    expect(server.submissions).toHaveLength(1);
    const subjects = [...server.emails.values()].map((e) => e["subject"]);
    expect(subjects).toEqual(expect.arrayContaining(["Sent before sign-out", "Unsaved"]));
  });

  it("minimises, goes full screen and back", async () => {
    const { user, window } = await renderComposer();
    await user.click(within(window).getByRole("button", { name: "Minimise" }));
    expect(window.getAttribute("data-placement")).toBe("minimised");
    await user.click(within(window).getByRole("button", { name: "Restore" }));
    await user.click(within(window).getByRole("button", { name: "Full screen" }));
    expect(window.getAttribute("data-placement")).toBe("fullscreen");
    await act(async () => {
      fireEvent.keyDown(within(window).getByRole("combobox", { name: "To" }), { key: "Escape" });
    });
    expect(window.getAttribute("data-placement")).toBe("docked");
  });
});
