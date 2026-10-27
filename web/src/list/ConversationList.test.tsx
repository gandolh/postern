// @vitest-environment jsdom
// The list over the fake JMAP server: rows, selection, the toolbar's actions
// with their toast and Undo, Delete forever's confirmation, opening, keys.

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeEmail, FakeMail, inboxThreads, MAILBOXES, type FakeEmail } from "../actions/fakeMail";
import { clearUndo } from "../actions/undo";
import { SessionContext } from "../auth/context";
import { LabelsStore, resolveLabelRoute } from "../labels/labelsStore";
import { resolveConversations } from "../labels/conversations";
import { LabelsStoreProvider, useLabels } from "../labels/useLabels";
import { resetPrefs, setPrefs } from "../prefs/prefs";
import type { LabelRoute } from "../shell/router";
import { ToastProvider } from "../shell/toast";
import { ListRoute } from "./ListRoute";
import { getActiveList } from "./registry";

const INBOX: LabelRoute = { kind: "system", view: "inbox" };

function Screen({ route }: { route: LabelRoute }) {
  const labels = useLabels();
  if (labels.status !== "ready") return null;
  const label = resolveLabelRoute(route, labels);
  return label ? <ListRoute route={route} label={label} /> : null;
}

async function renderList(emails: FakeEmail[], route: LabelRoute = INBOX) {
  const mail = new FakeMail({ mailboxes: MAILBOXES, emails });
  const client = await mail.connect();
  const labels = new LabelsStore(client, () => "A");
  const user = userEvent.setup();
  render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <LabelsStoreProvider store={labels}>
        <ToastProvider>
          <Screen route={route} />
        </ToastProvider>
      </LabelsStoreProvider>
    </SessionContext.Provider>,
  );
  const grid = await screen.findByRole("grid");
  return { mail, client, user, grid };
}

const toolbar = () => screen.getByRole("toolbar", { name: "Conversation actions" });
const rowsOf = (grid: HTMLElement) => within(grid).getAllByRole("row").filter((r) => r.getAttribute("aria-busy") !== "true");

beforeEach(() => {
  window.history.replaceState(null, "", "#inbox");
  clearUndo();
});

afterEach(() => cleanup());

describe("the rows", () => {
  it("shows each conversation's senders, subject, snippet and date, unread ones marked", async () => {
    const { grid } = await renderList([
      fakeEmail({ id: "1", threadId: "T1", receivedAt: "2026-10-03T10:00:00Z", subject: "Lunch?", preview: "Are you free" }),
      fakeEmail({ id: "2", threadId: "T1", receivedAt: "2026-10-04T10:00:00Z", mailboxIds: { e: true }, keywords: { $seen: true }, from: [{ name: "Alice Archer", email: "alice@postern.test" }] }),
      fakeEmail({ id: "3", threadId: "T2", receivedAt: "2026-10-02T10:00:00Z", keywords: { $seen: true }, hasAttachment: true, mailboxIds: { a: true, i: true } }),
    ]);
    expect(grid.getAttribute("aria-label")).toBe("Conversations in Inbox");
    expect(grid.getAttribute("aria-rowcount")).toBe("2");
    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeTruthy();
    const [first, second] = rowsOf(grid);
    expect(first!.textContent).toContain("Bob, me (2)");
    expect(first!.textContent).toContain("Lunch?");
    expect(first!.textContent).toContain("Are you free");
    expect(first!.hasAttribute("data-unread")).toBe(true);
    expect(second!.hasAttribute("data-unread")).toBe(false);
    expect(within(second!).getByText("Work")).toBeTruthy();
    expect(within(second!).getByText("Has attachment")).toBeTruthy();
    expect(within(first!).getByRole("button", { name: "Not starred" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("opens a conversation on click, and marks the open one", async () => {
    const { user, grid } = await renderList(inboxThreads(2));
    await user.click(within(rowsOf(grid)[1]!).getByText("Subject m1"));
    expect(window.location.hash).toBe("#inbox/t1");
  });
});

describe("selection and the toolbar", () => {
  it("selects a range with shift-click and archives it with Undo", async () => {
    const { mail, user, grid } = await renderList(inboxThreads(4));
    const rows = rowsOf(grid);
    await user.click(within(rows[0]!).getByRole("checkbox", { name: "Select" }));
    await user.keyboard("{Shift>}");
    await user.click(within(rows[2]!).getByRole("checkbox", { name: "Select" }));
    await user.keyboard("{/Shift}");
    expect(rowsOf(grid).map((r) => r.getAttribute("aria-selected"))).toEqual(["true", "true", "true", "false"]);
    expect(screen.getByText("3 conversations selected")).toBeTruthy();

    await user.click(within(toolbar()).getByRole("button", { name: "Archive" }));
    expect(rowsOf(grid).map((r) => r.textContent)).toEqual([expect.stringContaining("Subject m3")]);
    expect(await screen.findByText("3 conversations archived.")).toBeTruthy();
    await waitFor(() => expect(mail.emails.get("m0")!.mailboxIds).toEqual({ h: true }));

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Action undone.")).toBeTruthy();
    await waitFor(() => expect(rowsOf(screen.getByRole("grid"))).toHaveLength(4));
    expect([...mail.emails.values()].every((e) => e.mailboxIds["a"] && !e.mailboxIds["h"])).toBe(true);
  });

  it("selects all conversations beyond those loaded, and acts on every one", async () => {
    const { mail, user } = await renderList(inboxThreads(60));
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Select all 60 conversations in Inbox" }));
    expect(screen.getByText("All 60 conversations in Inbox are selected.")).toBeTruthy();
    await user.click(within(toolbar()).getByRole("button", { name: "Mark as read" }));
    expect(await screen.findByText("60 conversations marked as read.")).toBeTruthy();
    expect([...mail.emails.values()].every((e) => e.keywords["$seen"])).toBe(true);
  });

  it("selects by the select menu", async () => {
    const { user, grid } = await renderList([
      fakeEmail({ id: "1", threadId: "T1", receivedAt: "2026-10-03T00:00:00Z" }),
      fakeEmail({ id: "2", threadId: "T2", receivedAt: "2026-10-02T00:00:00Z", keywords: { $seen: true, $flagged: true } }),
    ]);
    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(await screen.findByRole("menuitem", { name: "Starred" }));
    expect(rowsOf(grid).map((r) => r.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(await screen.findByRole("menuitem", { name: "Unread" }));
    expect(rowsOf(grid).map((r) => r.getAttribute("aria-selected"))).toEqual(["true", "false"]);
  });

  it("shows snooze as not available yet", async () => {
    const { user, grid } = await renderList(inboxThreads(1));
    await user.click(within(rowsOf(grid)[0]!).getByRole("checkbox", { name: "Select" }));
    expect(screen.getByRole("button", { name: "Snooze isn't available yet" }).getAttribute("aria-disabled")).toBe("true");
  });
});

describe("row actions", () => {
  it("stars quietly from the row, and the hover delete moves to Trash", async () => {
    const { mail, user, grid } = await renderList(inboxThreads(2));
    await user.click(within(rowsOf(grid)[0]!).getByRole("button", { name: "Not starred" }));
    await waitFor(() => expect(mail.emails.get("m0")!.keywords).toEqual({ $flagged: true }));
    expect(screen.queryByText("Conversation starred.")).toBeNull();

    await user.click(within(rowsOf(grid)[1]!).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Conversation moved to Trash.")).toBeTruthy();
    await waitFor(() => expect(mail.emails.get("m1")!.mailboxIds).toEqual({ b: true }));
  });

  it("asks before deleting forever in Trash", async () => {
    const { mail, user, grid } = await renderList([fakeEmail({ id: "1", threadId: "T1", mailboxIds: { b: true } })], { kind: "system", view: "trash" });
    await user.click(within(rowsOf(grid)[0]!).getByRole("button", { name: "Delete forever" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete forever?" });
    expect(dialog.textContent).toContain("This conversation will be deleted forever.");
    await user.click(within(dialog).getByRole("button", { name: "Delete forever" }));
    expect(await screen.findByText("Conversation deleted forever.")).toBeTruthy();
    expect(mail.emails.size).toBe(0);
  });
});

describe("keyboard and the controller", () => {
  it("moves focus with the arrows, selects with Space, opens with Enter", async () => {
    const { user, grid } = await renderList(inboxThreads(3));
    act(() => rowsOf(grid)[0]!.focus());
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rowsOf(grid)[1]);
    await user.keyboard(" ");
    expect(rowsOf(grid)[1]!.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Enter}");
    expect(window.location.hash).toBe("#inbox/t1");
  });

  it("is the active list, for brief 14's keys", async () => {
    const { mail, grid } = await renderList(inboxThreads(3));
    const list = getActiveList()!;
    expect(list).not.toBeNull();
    act(() => list.moveFocus(1));
    act(() => list.moveFocus(1));
    expect(list.focusedId).toBe("t1");
    expect(document.activeElement).toBe(rowsOf(grid)[1]);
    await act(() => list.archive());
    await waitFor(() => expect(mail.emails.get("m1")!.mailboxIds).toEqual({ h: true }));
    expect(await list.undoLast()).toBe(true);
    await waitFor(() => expect(mail.emails.get("m1")!.mailboxIds).toEqual({ a: true }));
    vi.restoreAllMocks();
  });
});

describe("conversation view off (brief 22)", () => {
  /** A conversation of three messages in the Inbox (one read, one from me in Sent), and a single message. */
  const mail3 = () => [
    fakeEmail({ id: "1", threadId: "T1", receivedAt: "2026-10-01T09:00:00Z", subject: "Plans", preview: "first" }),
    fakeEmail({ id: "2", threadId: "T1", receivedAt: "2026-10-02T09:00:00Z", subject: "Re: Plans", preview: "second", keywords: { $seen: true } }),
    fakeEmail({ id: "3", threadId: "T1", receivedAt: "2026-10-04T09:00:00Z", subject: "Re: Plans", preview: "third" }),
    fakeEmail({ id: "4", threadId: "T1", receivedAt: "2026-10-03T09:00:00Z", mailboxIds: { e: true }, from: [{ name: "Alice Archer", email: "alice@postern.test" }] }),
    fakeEmail({ id: "s", threadId: "T2", receivedAt: "2026-09-30T09:00:00Z", subject: "Single" }),
  ];

  beforeEach(() => setPrefs({ conversationView: false }));
  afterEach(() => resetPrefs());

  it("shows each message as its own row, newest first, with no message count", async () => {
    const { grid } = await renderList(mail3());
    expect(grid.getAttribute("aria-rowcount")).toBe("4");
    const rows = rowsOf(grid);
    expect(rows.map((r) => r.getAttribute("data-row-id"))).toEqual(["3", "2", "1", "s"]);
    expect(rows[0]!.textContent).toContain("third");
    expect(rows[1]!.textContent).toContain("second");
    expect(rows.map((r) => r.textContent).some((t) => /\(\d\)/.test(t ?? ""))).toBe(false);
    expect(rows.map((r) => r.hasAttribute("data-unread"))).toEqual([true, false, true, true]);
  });

  it("archives one message and leaves the others; Undo brings it back", async () => {
    const { mail, user, grid } = await renderList(mail3());
    await user.click(within(rowsOf(grid)[1]!).getByRole("button", { name: "Archive" }));
    expect(rowsOf(grid).map((r) => r.getAttribute("data-row-id"))).toEqual(["3", "1", "s"]);
    expect(await screen.findByText("Conversation archived.")).toBeTruthy();
    await waitFor(() => expect(mail.emails.get("2")!.mailboxIds).toEqual({ h: true }));
    expect(mail.emails.get("1")!.mailboxIds).toEqual({ a: true });
    expect(mail.emails.get("3")!.mailboxIds).toEqual({ a: true });
    expect(mail.emails.get("4")!.mailboxIds).toEqual({ e: true });

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(rowsOf(screen.getByRole("grid")).map((r) => r.getAttribute("data-row-id"))).toEqual(["3", "2", "1", "s"]));
    expect(mail.emails.get("2")!.mailboxIds).toEqual({ a: true });
  });

  it("selects, stars, marks read and deletes one message of a conversation", async () => {
    const { mail, user, grid } = await renderList(mail3());
    await user.click(within(rowsOf(grid)[2]!).getByRole("checkbox", { name: "Select" }));
    expect(getActiveList()!.selectedIds).toEqual(new Set(["1"]));
    expect(screen.getByText("1 conversation selected")).toBeTruthy();
    await user.click(within(toolbar()).getByRole("button", { name: "Mark as read" }));
    await waitFor(() => expect(mail.emails.get("1")!.keywords).toEqual({ $seen: true }));
    expect(mail.emails.get("3")!.keywords).toEqual({});

    await user.click(within(rowsOf(grid)[0]!).getByRole("button", { name: "Not starred" }));
    await waitFor(() => expect(mail.emails.get("3")!.keywords).toEqual({ $flagged: true }));
    expect(mail.emails.get("4")!.keywords).toEqual({});

    await user.click(within(rowsOf(grid)[0]!).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mail.emails.get("3")!.mailboxIds).toEqual({ b: true }));
    expect(mail.emails.get("2")!.mailboxIds).toEqual({ a: true });
  });

  it("hands the label menus the selected message alone", async () => {
    const { client, user, grid } = await renderList(mail3());
    await user.click(within(rowsOf(grid)[1]!).getByRole("checkbox", { name: "Select" }));
    const picked = await resolveConversations(client, [...getActiveList()!.selectedIds]);
    expect(picked.map((c) => c.messages.map((m) => m.id))).toEqual([["2"]]);
  });

  it("opens a message row's conversation", async () => {
    const { user, grid } = await renderList(mail3());
    await user.click(within(rowsOf(grid)[2]!).getByText("first"));
    expect(window.location.hash).toBe("#inbox/T1");
  });

  it("shows one row per conversation again when switched back on, without a reload", async () => {
    const { grid } = await renderList(mail3());
    expect(rowsOf(grid)).toHaveLength(4);
    act(() => setPrefs({ conversationView: true }));
    await waitFor(() => expect(rowsOf(screen.getByRole("grid")).map((r) => r.getAttribute("data-row-id"))).toEqual(["T1", "T2"]));
    expect(rowsOf(screen.getByRole("grid"))[0]!.textContent).toContain("(4)");
    act(() => setPrefs({ conversationView: false }));
    await waitFor(() => expect(rowsOf(screen.getByRole("grid"))).toHaveLength(4));
  });
});
