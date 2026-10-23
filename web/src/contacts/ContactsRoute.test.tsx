// @vitest-environment jsdom
// The Contacts page over a scripted address book: list, search, add, edit, delete.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SessionContext } from "../auth/context";
import { ToastProvider } from "../shell/toast";
import { ContactsRoute, filterCards } from "./ContactsRoute";
import { card, FakeContacts } from "./fakeContacts";

afterEach(cleanup);

function renderPage(fake: FakeContacts) {
  return render(
    <SessionContext.Provider value={fake.session}>
      <ToastProvider>
        <ContactsRoute />
      </ToastProvider>
    </SessionContext.Provider>,
  );
}

describe("filterCards", () => {
  it("sorts by name and matches name, address, phone and note", () => {
    const cards = [card("2", "Zed", ["z@x.test"]), card("1", "Ann", ["a@x.test"], { notes: { n1: { note: "met in Cluj" } } })];
    expect(filterCards(cards, "").map((c) => c.id)).toEqual(["1", "2"]);
    expect(filterCards(cards, "cluj").map((c) => c.id)).toEqual(["1"]);
    expect(filterCards(cards, "Z@X").map((c) => c.id)).toEqual(["2"]);
  });
});

describe("Contacts page", () => {
  it("shows the empty state, adds a contact with a uid in the default address book", async () => {
    const user = userEvent.setup();
    const fake = new FakeContacts();
    renderPage(fake);
    expect(await screen.findByText("No contacts yet")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Add contact/ }));
    await user.type(screen.getByLabelText("Name"), "Bob Baker");
    await user.type(screen.getByLabelText("Email addresses"), "bob@postern.test");
    await user.type(screen.getByLabelText("Phone numbers"), "+40 123");
    await user.type(screen.getByLabelText("Note"), "friend");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const list = await screen.findByRole("list", { name: "Contacts" });
    expect(within(list).getByText("Bob Baker")).toBeTruthy();
    expect(within(list).getByText("bob@postern.test")).toBeTruthy();
    const created = fake.cards[0]!;
    expect(created.uid).toMatch(/^urn:uuid:/);
    expect(created.addressBookIds).toEqual({ b: true });
    expect(created.phones).toEqual({ p1: { "@type": "Phone", number: "+40 123" } });
    expect(created.notes?.["n1"]?.note).toBe("friend");
  });

  it("searches, edits the address and note, and deletes after confirming", async () => {
    const user = userEvent.setup();
    const fake = new FakeContacts([card("1", "Ann Archer", ["ann@x.test"]), card("2", "Bob Baker", ["bob@x.test"])]);
    renderPage(fake);
    await screen.findByRole("list", { name: "Contacts" });
    await user.type(screen.getByLabelText("Search contacts"), "bak");
    expect(screen.queryByText("Ann Archer")).toBeNull();

    await user.click(screen.getByText("Bob Baker"));
    const emails = screen.getByLabelText("Email addresses");
    await user.clear(emails);
    await user.type(emails, "bobby@x.test");
    await user.type(screen.getByLabelText("Note"), "likes tea");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fake.cards.find((c) => c.id === "2")?.emails).toEqual({ e1: { "@type": "EmailAddress", address: "bobby@x.test" } }));
    expect(fake.cards.find((c) => c.id === "2")?.notes?.["n1"]?.note).toBe("likes tea");

    await user.click(await screen.findByText("Bob Baker"));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", { hidden: true });
    expect(dialog.textContent).toContain("Bob Baker will be removed");
    await user.click(within(dialog).getByRole("button", { name: "Delete", hidden: true }));
    await waitFor(() => expect(fake.cards.map((c) => c.id)).toEqual(["1"]));
  });

  it("lists a group with its member count and offers only delete", async () => {
    const user = userEvent.setup();
    const fake = new FakeContacts([card("1", "Ann", ["a@x.test"]), card("3", "Team", [], { kind: "group", uid: "urn:uuid:g", members: { "urn:uuid:1": true } })]);
    renderPage(fake);
    expect(await screen.findByText("Group, 1 members")).toBeTruthy();
    await user.click(screen.getByText("Team"));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });
});
