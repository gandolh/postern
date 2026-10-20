// @vitest-environment jsdom
// The label menu over the fake JMAP server: checkboxes with the indeterminate
// state, applying and removing, search, "Create new", and Move to.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeEmail, FakeMail, MAILBOXES, type FakeEmail } from "../actions/fakeMail";
import { clearUndo } from "../actions/undo";
import { SessionContext } from "../auth/context";
import type { LabelRoute } from "../shell/router";
import { ToastProvider } from "../shell/toast";
import { LabelMenu } from "./LabelMenu";
import { LabelsStore } from "./labelsStore";
import { LabelsStoreProvider } from "./useLabels";

const INBOX: LabelRoute = { kind: "system", view: "inbox" };

async function renderMenu(emails: FakeEmail[], props: { mode?: "label" | "move"; ids?: string[]; current?: LabelRoute | null; onDone?: () => void } = {}) {
  const mail = new FakeMail({ mailboxes: [...MAILBOXES, { id: "j", name: "Receipts", role: null, parentId: null }], emails });
  // The fake has no Mailbox/changes: have the store reload every mailbox instead.
  mail.failWith = (name) => (name === "Mailbox/changes" ? ["error", { type: "cannotCalculateChanges" }] : undefined);
  const client = await mail.connect();
  const labels = new LabelsStore(client, () => "A");
  const user = userEvent.setup();
  const ids = props.ids ?? [...new Set(emails.map((e) => e.threadId))];
  render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <LabelsStoreProvider store={labels}>
        <ToastProvider>
          <LabelMenu
            conversationIds={ids}
            emailIds={emails.map((e) => e.id)}
            current={props.current === undefined ? INBOX : props.current}
            mode={props.mode ?? "label"}
            {...(props.onDone ? { onDone: props.onDone } : {})}
          />
        </ToastProvider>
      </LabelsStoreProvider>
    </SessionContext.Provider>,
  );
  await waitFor(() => expect(labels.getSnapshot().status).toBe("ready"));
  return { mail, user, labels };
}

const boxes = (mail: FakeMail, id: string) => Object.keys(mail.emails.get(id)!.mailboxIds).sort();

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "#inbox");
  clearUndo();
});
afterEach(() => cleanup());

const two = () => [
  fakeEmail({ id: "1", threadId: "T1", mailboxIds: { a: true, i: true } }),
  fakeEmail({ id: "2", threadId: "T2", mailboxIds: { a: true } }),
];

describe("Labels (apply and remove)", () => {
  it("shows a label some of the conversations carry as indeterminate, and the rest unchecked", async () => {
    const { user } = await renderMenu(two());
    await user.click(screen.getByRole("button", { name: "Labels" }));
    const work = (await screen.findByRole("checkbox", { name: /Work/ })) as HTMLInputElement;
    expect(work.indeterminate).toBe(true);
    expect((screen.getByRole("checkbox", { name: /Receipts/ }) as HTMLInputElement).checked).toBe(false);
    // Only user labels: no Inbox, Trash...
    expect(screen.queryByRole("checkbox", { name: /Inbox/ })).toBeNull();
  });

  it("puts an indeterminate label on every conversation, then takes it off", async () => {
    const onDone = vi.fn();
    const { mail, user } = await renderMenu(two(), { onDone });
    await user.click(screen.getByRole("button", { name: "Labels" }));
    const work = (await screen.findByRole("checkbox", { name: /Work/ })) as HTMLInputElement;
    await user.click(work);
    await waitFor(() => expect(boxes(mail, "2")).toEqual(["a", "i"]));
    expect(work.checked).toBe(true);
    expect(work.indeterminate).toBe(false);
    expect(onDone).toHaveBeenCalled();
    expect(await screen.findByText(/Label "Work" added/)).toBeTruthy();

    await user.click(work);
    await waitFor(() => expect(boxes(mail, "1")).toEqual(["a"]));
    expect(boxes(mail, "2")).toEqual(["a"]);
    expect(work.checked).toBe(false);
  });

  it("removing the only label puts the message in All Mail", async () => {
    const { mail, user } = await renderMenu([fakeEmail({ id: "1", threadId: "T1", mailboxIds: { i: true } })], { current: { kind: "label", labelId: "i" } });
    await user.click(screen.getByRole("button", { name: "Labels" }));
    await user.click(await screen.findByRole("checkbox", { name: /Work/ }));
    await waitFor(() => expect(boxes(mail, "1")).toEqual(["h"]));
  });

  it("filters by the search box", async () => {
    const { user } = await renderMenu(two());
    await user.click(screen.getByRole("button", { name: "Labels" }));
    await screen.findByRole("checkbox", { name: /Work/ });
    await user.type(screen.getByRole("textbox", { name: "Search labels" }), "rec");
    expect(screen.queryByRole("checkbox", { name: /Work/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Receipts/ })).toBeTruthy();
  });

  it("creates a label from the typed text and applies it", async () => {
    const { mail, user, labels } = await renderMenu(two());
    await user.click(screen.getByRole("button", { name: "Labels" }));
    await screen.findByRole("checkbox", { name: /Work/ });
    await user.type(screen.getByRole("textbox", { name: "Search labels" }), "Travel");
    await user.click(screen.getByRole("button", { name: "Create new" }));
    expect((screen.getByLabelText("Label name") as HTMLInputElement).value).toBe("Travel");
    await user.click(screen.getByRole("button", { name: "Create and apply" }));
    await waitFor(() => expect(labels.getSnapshot().labels.some((l) => l.title === "Travel")).toBe(true));
    const travel = labels.getSnapshot().labels.find((l) => l.title === "Travel")!;
    await waitFor(() => expect(boxes(mail, "1")).toContain(travel.id));
    expect(boxes(mail, "2")).toContain(travel.id);
  });

  it("says why a name can't be used and creates nothing", async () => {
    const { mail, user } = await renderMenu(two());
    await user.click(screen.getByRole("button", { name: "Labels" }));
    await user.click(await screen.findByRole("button", { name: "Create new" }));
    await user.type(screen.getByLabelText("Label name"), "work");
    await user.click(screen.getByRole("button", { name: "Create and apply" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already exists/);
    expect(mail.mailboxes.filter((m) => m.name.toLowerCase() === "work")).toHaveLength(1);
  });

  it("is disabled with nothing selected", async () => {
    await renderMenu(two(), { ids: [] });
    expect((screen.getByRole("button", { name: "Labels" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Move to", () => {
  it("takes the conversations out of the viewed label and into the chosen one, and closes", async () => {
    const onDone = vi.fn();
    const { mail, user } = await renderMenu(two(), { mode: "move", onDone });
    await user.click(screen.getByRole("button", { name: "Move to" }));
    // Not offered: where you already are.
    expect(screen.queryByRole("menuitem", { name: "Inbox" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Trash" })).toBeTruthy();
    await user.click(await screen.findByRole("menuitem", { name: "Receipts" }));
    await waitFor(() => expect(boxes(mail, "2")).toEqual(["j"]));
    expect(boxes(mail, "1")).toEqual(["i", "j"]);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.queryByRole("menuitem", { name: "Receipts" })).toBeNull();
  });
});
