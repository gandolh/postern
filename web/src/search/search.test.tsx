// @vitest-environment jsdom
// The search box (suggestions, keyboard, advanced form) and the results, over
// the fake JMAP server.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeEmail, FakeMail, MAILBOXES, type FakeEmail } from "../actions/fakeMail";
import { clearUndo } from "../actions/undo";
import { SessionContext } from "../auth/context";
import { LabelsStore } from "../labels/labelsStore";
import { LabelsStoreProvider } from "../labels/useLabels";
import { ToastProvider } from "../shell/toast";
import type { SearchResultsRoute } from "../shell/router";
import { SearchBox } from "./SearchBox";
import { SearchRoute } from "./SearchRoute";

const EMAILS: FakeEmail[] = [
  fakeEmail({ id: "m1", threadId: "t1", subject: "Roadmap review", from: [{ name: "Bob Baker", email: "bob@postern.test" }] }),
  fakeEmail({ id: "m2", threadId: "t2", subject: "Lunch plans", from: [{ name: "Carol Chen", email: "carol@northwind.example.com" }] }),
  fakeEmail({ id: "m3", threadId: "t3", subject: "Roadmap budget", from: [{ name: "Carol Chen", email: "carol@northwind.example.com" }] }),
  fakeEmail({ id: "m4", threadId: "t4", subject: "Roadmap in the trash", mailboxIds: { b: true } }),
];

async function setup(ui: (query: string | undefined) => React.ReactNode, emails = EMAILS) {
  const mail = new FakeMail({ mailboxes: MAILBOXES, emails });
  const client = await mail.connect();
  const labels = new LabelsStore(client, () => "A");
  const user = userEvent.setup();
  const view = render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <LabelsStoreProvider store={labels}>
        <ToastProvider>{ui(undefined)}</ToastProvider>
      </LabelsStoreProvider>
    </SessionContext.Provider>,
  );
  return { mail, client, user, view };
}

beforeEach(() => {
  window.history.replaceState(null, "", "#inbox");
  clearUndo();
});
afterEach(cleanup);

describe("the search box", () => {
  it("searches on Enter, to #search/<query>", async () => {
    const { user } = await setup(() => <SearchBox />);
    await user.type(screen.getByRole("combobox", { name: "Search mail" }), "from:bob budget{Enter}");
    expect(window.location.hash).toBe("#search/from%3Abob%20budget");
  });

  it("suggests labels as you type, moves with the arrow keys, and completes with Enter", async () => {
    const { user } = await setup(() => <SearchBox />);
    const box = screen.getByRole("combobox", { name: "Search mail" });
    await user.type(box, "budget wor");
    const list = await screen.findByRole("listbox", { name: "Search suggestions" });
    const options = within(list).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Worklabel:Work"]);
    expect(box.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{ArrowDown}");
    expect(box.getAttribute("aria-activedescendant")).toBe(options[0]!.id);
    expect(options[0]!.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Enter}");
    expect((box as HTMLInputElement).value).toBe("budget label:Work ");
    expect(window.location.hash).toBe("#inbox"); // completing does not search yet
  });

  it("suggests recent senders, fetched once, and writes from:", async () => {
    const { user, mail } = await setup(() => <SearchBox />);
    const box = screen.getByRole("combobox", { name: "Search mail" });
    await user.type(box, "caro");
    const option = await screen.findByRole("option", { name: /Carol Chen/ });
    await user.click(option);
    expect((box as HTMLInputElement).value).toBe("from:carol@northwind.example.com ");
    const fetches = () => mail.posts.filter((p) => JSON.stringify(p).includes('"Email/query"') && JSON.stringify(p).includes('"properties":["from"]')).length;
    expect(fetches()).toBe(1);
    await user.type(box, "bob");
    await screen.findByRole("option", { name: /Bob Baker/ });
    expect(fetches()).toBe(1);
  });

  it("offers this session's searches, and runs one when chosen", async () => {
    const { user } = await setup(() => <SearchBox />);
    const box = screen.getByRole("combobox", { name: "Search mail" });
    await user.type(box, "budget{Enter}");
    expect(window.location.hash).toBe("#search/budget");
    await user.click(box);
    await user.clear(box);
    await user.type(box, "bud");
    await user.click(await screen.findByRole("option", { name: "budget" }));
    expect(window.location.hash).toBe("#search/budget");
  });

  it("Escape closes the list, then clears the box, then leaves it", async () => {
    const { user } = await setup(() => <SearchBox />);
    const box = screen.getByRole("combobox", { name: "Search mail" }) as HTMLInputElement;
    await user.type(box, "wor");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(box.getAttribute("aria-expanded")).toBe("false");
    expect(box.value).toBe("wor");
    await user.keyboard("{Escape}");
    expect(box.value).toBe("");
    expect(document.activeElement).toBe(box);
    await user.keyboard("{Escape}");
    expect(document.activeElement).not.toBe(box);
  });

  it("shows the search on screen", async () => {
    await setup(() => <SearchBox query="from:bob" />);
    expect((screen.getByRole("combobox", { name: "Search mail" }) as HTMLInputElement).value).toBe("from:bob");
  });

  it("writes the advanced form back into the box and searches", async () => {
    const { user } = await setup(() => <SearchBox />);
    await user.click(screen.getByRole("button", { name: "Search options" }));
    const form = await screen.findByRole("dialog", { name: "Advanced search" });
    await user.type(within(form).getByLabelText("From"), "bob");
    await user.type(within(form).getByLabelText("Has the words"), "roadmap");
    await user.type(within(form).getByLabelText("Doesn’t have"), "draft");
    await user.selectOptions(within(form).getByLabelText("Search"), "Work");
    await user.click(within(form).getByLabelText("Has attachment"));
    await user.click(within(form).getByRole("button", { name: "Search" }));
    const expected = "from:bob roadmap -draft label:Work has:attachment";
    expect((screen.getByRole("combobox", { name: "Search mail" }) as HTMLInputElement).value).toBe(expected);
    expect(window.location.hash).toBe(`#search/${encodeURIComponent(expected)}`);
    expect(screen.queryByRole("dialog", { name: "Advanced search" })).toBeNull();
  });

  it("closes the advanced form with Escape", async () => {
    const { user } = await setup(() => <SearchBox />);
    await user.click(screen.getByRole("button", { name: "Search options" }));
    await screen.findByRole("dialog", { name: "Advanced search" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Advanced search" })).toBeNull();
  });
});

describe("the search results", () => {
  const route = (query: string): SearchResultsRoute => ({ kind: "search", query });

  it("lists what the query matches, outside Trash and Spam, with highlighted snippets", async () => {
    await setup(() => <SearchRoute route={route("subject:roadmap")} />);
    const grid = await screen.findByRole("grid", { name: /that match this search/ });
    await waitFor(() => expect(within(grid).getAllByRole("row").filter((r) => r.getAttribute("aria-busy") !== "true").length).toBe(2));
    expect(grid.querySelectorAll("mark.list-mark").length).toBeGreaterThan(0);
    expect(within(grid).queryByText(/in the trash/)).toBeNull();
  });

  it("reaches the trash with in:trash", async () => {
    await setup(() => <SearchRoute route={route("in:trash")} />);
    const grid = await screen.findByRole("grid");
    await waitFor(() => expect(within(grid).getByText(/Roadmap in the trash/)).toBeTruthy());
  });

  it("says nothing matches, and shows the parser's warnings as a hint", async () => {
    await setup(() => <SearchRoute route={route("subject:nothing-like-this rfc822msgid:x label:nope")} />);
    await screen.findByText("No conversations match this search");
    const hints = screen.getByRole("list", { name: "Notes about this search" });
    expect(within(hints).getAllByRole("listitem").length).toBe(2);
    expect(hints.textContent).toMatch(/rfc822msgid/);
    expect(hints.textContent).toMatch(/no label called/i);
  });

  it("offers the list's actions: archive, with Undo", async () => {
    const { user } = await setup(() => <SearchRoute route={route("subject:lunch")} />);
    const grid = await screen.findByRole("grid");
    const row = await within(grid).findByRole("row", { name: /Lunch plans/ });
    await user.click(within(row).getByRole("checkbox"));
    await user.click(within(screen.getByRole("toolbar", { name: "Conversation actions" })).getByRole("button", { name: "Archive" }));
    expect(await screen.findByText("Conversation archived.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Action undone.")).toBeTruthy();
  });
});
