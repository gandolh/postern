// @vitest-environment jsdom
// Settings → Filters over a fake account of scripts and the fake mail server:
// create, edit and delete a filter, "Filter messages like these", unblock,
// the vacation responder holding the active slot, and a hand-written script.

import { emptyActions, emptyCriteria, generateSieve, parseFilterScript, type MailFilter } from "@postern/jmap";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeEmail, FakeMail, MAILBOXES } from "../actions/fakeMail";
import { clearUndo } from "../actions/undo";
import { SessionContext } from "../auth/context";
import { LabelsStore } from "../labels/labelsStore";
import { LabelsStoreProvider } from "../labels/useLabels";
import { ToastProvider } from "../shell/toast";
import { FakeScripts } from "./fakeScripts";
import { FiltersSettings } from "./FiltersSettings";
import { filterMessagesLike } from "./likeThese";
import { FiltersStore, provideFiltersStore } from "./store";

async function renderPage(io: FakeScripts, mail = new FakeMail({ mailboxes: MAILBOXES, emails: [] })) {
  const client = await mail.connect();
  provideFiltersStore(client, new FiltersStore(io));
  const labels = new LabelsStore(client, () => "A");
  await labels.sync();
  const user = userEvent.setup();
  render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <LabelsStoreProvider store={labels}>
        <ToastProvider>
          <FiltersSettings />
        </ToastProvider>
      </LabelsStoreProvider>
    </SessionContext.Provider>,
  );
  await screen.findByRole("heading", { name: "Filters" });
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  return { user, mail };
}

const bob: MailFilter = { criteria: { ...emptyCriteria(), from: ["bob@postern.test"] }, actions: { ...emptyActions(), star: true } };

beforeEach(() => {
  window.history.replaceState(null, "", "#settings/filters");
  clearUndo();
});
afterEach(() => cleanup());

describe("Settings → Filters", () => {
  it("creates a filter from bob: apply a label and skip the Inbox", async () => {
    const io = new FakeScripts();
    const { user } = await renderPage(io);
    expect(screen.getByText("No filters yet.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create a new filter" }));
    const form = screen.getByRole("form", { name: "Create a filter" });
    await user.type(within(form).getByLabelText("From"), "bob@postern.test");
    await user.click(within(form).getByLabelText("Skip the Inbox (archive it)"));
    await user.click(within(form).getByLabelText("Apply the label"));
    await user.selectOptions(within(form).getByLabelText("Label to apply"), "Work");
    await user.click(within(form).getByRole("button", { name: "Create filter" }));

    await screen.findByText("from:(bob@postern.test)");
    expect(screen.getByText(/Skip the Inbox, Apply label "Work"/)).toBeTruthy();
    expect(io.active()).toBe("postern");
    expect(parseFilterScript(io.source("postern")).filters).toEqual([
      { criteria: { ...emptyCriteria(), from: ["bob@postern.test"] }, actions: { ...emptyActions(), archive: true, label: { id: "i", name: "Work" } } },
    ]);
  });

  it("explains what is missing instead of saving", async () => {
    const io = new FakeScripts();
    const { user } = await renderPage(io);
    await user.click(screen.getByRole("button", { name: "Create a new filter" }));
    await user.click(screen.getByRole("button", { name: "Create filter" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Fill in at least one search criterion.");
    expect(alert.textContent).toContain("Choose at least one thing to do with matching messages.");
    expect(io.saves).toEqual([]);
  });

  it("edits and deletes a filter", async () => {
    const io = new FakeScripts();
    io.add("postern", generateSieve({ filters: [bob], blocked: [], includes: [] }), true);
    const { user } = await renderPage(io);
    await user.click(screen.getByRole("button", { name: "Edit filter 1" }));
    const form = screen.getByRole("form", { name: "Edit filter" });
    expect((within(form).getByLabelText("From") as HTMLInputElement).value).toBe("bob@postern.test");
    await user.click(within(form).getByLabelText("Mark as read"));
    await user.click(within(form).getByRole("button", { name: "Save filter" }));
    await screen.findByText(/Mark as read, Star it/);
    expect(parseFilterScript(io.source("postern")).filters[0]!.actions).toMatchObject({ markRead: true, star: true });

    await user.click(screen.getByRole("button", { name: "Delete filter 1" }));
    await user.click(screen.getByRole("button", { name: "Delete filter" }));
    await screen.findByText("No filters yet.");
    expect(parseFilterScript(io.source("postern")).filters).toEqual([]);
  });

  it('"Filter messages like these" opens the editor with the senders', async () => {
    const io = new FakeScripts();
    filterMessagesLike(
      [
        { from: [{ name: "Bob", email: "Bob@postern.test" }] },
        { from: [{ name: "Me", email: "alice@postern.test" }] },
        { from: [{ name: "Carol", email: "carol@postern.test" }] },
      ],
      "alice@postern.test",
    );
    expect(window.location.hash).toBe("#settings/filters");
    await renderPage(io);
    const form = screen.getByRole("form", { name: "Create a filter" });
    expect((within(form).getByLabelText("From") as HTMLInputElement).value).toBe("bob@postern.test, carol@postern.test");
  });

  it("applies a new filter to matching conversations too, with one Undo", async () => {
    const io = new FakeScripts();
    const mail = new FakeMail({
      mailboxes: MAILBOXES,
      emails: [fakeEmail({ id: "m1", threadId: "t1" }), fakeEmail({ id: "m2", threadId: "t2", mailboxIds: { c: true } })],
    });
    const { user } = await renderPage(io, mail);
    await user.click(screen.getByRole("button", { name: "Create a new filter" }));
    const form = screen.getByRole("form", { name: "Create a filter" });
    await user.type(within(form).getByLabelText("From"), "bob@postern.test");
    await user.click(within(form).getByLabelText("Star it"));
    await user.click(within(form).getByLabelText("Also apply to matching conversations"));
    // The fake server has no from: search, so the search finds what its default scope allows: m1, not the Spam one.
    await user.click(within(form).getByRole("button", { name: "Create filter" }));
    await screen.findByText("Filter applied to 1 conversation.");
    expect(mail.emails.get("m1")!.keywords).toMatchObject({ $flagged: true });
    expect(mail.emails.get("m2")!.keywords).toEqual({});
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(mail.emails.get("m1")!.keywords).toEqual({}));
  });

  it("lists blocked addresses and unblocks", async () => {
    const io = new FakeScripts();
    io.add("postern", generateSieve({ filters: [], blocked: ["spam@x.test", "junk@y.test"], includes: [] }), true);
    const { user } = await renderPage(io);
    const list = screen.getByRole("list", { name: "Blocked addresses" });
    expect(within(list).getAllByRole("listitem").map((li) => li.querySelector(".filters-address")!.textContent)).toEqual(["spam@x.test", "junk@y.test"]);
    await user.click(within(list).getByRole("button", { name: "Unblock spam@x.test" }));
    await waitFor(() => expect(parseFilterScript(io.source("postern")).blocked).toEqual(["junk@y.test"]));
  });

  it("says filters are off while the vacation responder is on, and turns them on when asked", async () => {
    const io = new FakeScripts();
    io.add("postern", generateSieve({ filters: [bob], blocked: [], includes: [] }));
    io.add("vacation", 'require "vacation";', true);
    const { user } = await renderPage(io);
    expect(screen.getByText(/Filters are off while your vacation responder is on/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Turn filters on and the vacation responder off" }));
    await waitFor(() => expect(io.active()).toBe("postern"));
    expect(screen.queryByText(/Filters are off/)).toBeNull();
  });

  it("keeps a hand-written active script running after saving", async () => {
    const io = new FakeScripts();
    io.add("my rules", 'require ["fileinto"];\r\nkeep;\r\n', true);
    const { user } = await renderPage(io);
    expect(screen.getByText(/Your own filter script “my rules” is the one running now/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create a new filter" }));
    const form = screen.getByRole("form", { name: "Create a filter" });
    await user.type(within(form).getByLabelText("Subject"), "invoice");
    await user.click(within(form).getByLabelText("Star it"));
    await user.click(within(form).getByRole("button", { name: "Create filter" }));
    await screen.findByText(/After these filters your mail server also runs your own script “my rules”./);
    expect(io.active()).toBe("postern");
    expect(io.scripts.map((s) => s.name)).toEqual(["my rules", "postern"]);
    expect(screen.getByRole("button", { name: "Stop running “my rules”" })).toBeTruthy();
  });

  it("won't touch a \"postern\" script it didn't write", async () => {
    const io = new FakeScripts();
    io.add("postern", 'require ["fileinto"];\r\nfileinto "X";\r\n', true);
    await renderPage(io);
    expect(screen.getByRole("alert").textContent).toContain("that Postern didn't write");
    expect((screen.getByRole("button", { name: "Create a new filter" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
