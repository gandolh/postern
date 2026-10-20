// @vitest-environment jsdom
// The label manager over the fake JMAP server.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeEmail, FakeMail, MAILBOXES } from "../actions/fakeMail";
import { SessionContext } from "../auth/context";
import { ToastProvider } from "../shell/toast";
import { LabelManager } from "./LabelManager";
import { getLabelPref, resetLabelPrefsCache } from "./labelPrefs";
import { LabelsStore } from "./labelsStore";
import { LabelsStoreProvider } from "./useLabels";

async function renderManager() {
  const mail = new FakeMail({
    mailboxes: [...MAILBOXES, { id: "j", name: "Clients", role: null, parentId: "i" }],
    emails: [fakeEmail({ id: "1", threadId: "T1", mailboxIds: { i: true } })],
  });
  mail.failWith = (name) => (name === "Mailbox/changes" ? ["error", { type: "cannotCalculateChanges" }] : undefined);
  const client = await mail.connect();
  const labels = new LabelsStore(client, () => "A");
  const user = userEvent.setup();
  render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <LabelsStoreProvider store={labels}>
        <ToastProvider>
          <LabelManager />
        </ToastProvider>
      </LabelsStoreProvider>
    </SessionContext.Provider>,
  );
  await screen.findByRole("table");
  return { mail, user, labels };
}

beforeEach(() => {
  window.localStorage.clear();
  resetLabelPrefsCache();
});
afterEach(() => cleanup());

describe("LabelManager", () => {
  it("lists user labels with their sublabels and says system labels are fixed", async () => {
    await renderManager();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0]!.textContent)).toEqual(["Work", "Clients"]);
    expect(screen.getByText(/System labels \(.*Inbox.*\) can't be renamed/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete Inbox" })).toBeNull();
  });

  it("keeps colour and show-if-unread on this device", async () => {
    const { user } = await renderManager();
    await user.selectOptions(screen.getByRole("combobox", { name: "Colour of Work" }), "blue");
    await user.click(screen.getByRole("checkbox", { name: /Show Work only if it has unread/ }));
    expect(getLabelPref("alice@postern.test", "i")).toEqual({ color: "blue", showIfUnread: true });
  });

  it("creates a label, nested if asked, and refuses a clash", async () => {
    const { mail, user } = await renderManager();
    await user.type(screen.getByLabelText("New label"), "Travel");
    await user.selectOptions(screen.getByLabelText("Nest under"), "Work");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mail.mailboxes.find((m) => m.name === "Travel")).toMatchObject({ parentId: "i" }));
    expect(await screen.findByText(/Label "Travel" created/)).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Nest under"), "(none)");
    await user.type(screen.getByLabelText("New label"), "work");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already exists/);
  });

  it("renames a label", async () => {
    const { mail, user } = await renderManager();
    await user.click(screen.getByRole("button", { name: "Edit Work" }));
    const input = screen.getByRole("textbox", { name: "Name of Work" });
    await user.clear(input);
    await user.type(input, "Job");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mail.mailboxes.find((m) => m.id === "i")!.name).toBe("Job"));
  });

  it("asks before deleting and says what happens to sublabels and conversations", async () => {
    const { user } = await renderManager();
    await user.click(screen.getByRole("button", { name: "Delete Work" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toMatch(/sublabel stays and move up one level/);
    expect(dialog.textContent).toMatch(/All Mail/);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
