// @vitest-environment jsdom
// The shell over a scripted Mailbox/get: labels and counts, the layout states,
// routes, the account menu, the toast and the theme attributes.

import { JmapNetworkError, type JmapClient, type Mailbox } from "@postern/jmap";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionContext, type SignedInSession } from "../auth/context";
import { ThemeProvider, setDensity, setTheme } from "../theme";
import { resetDisplaySettings } from "../theme/displaySettings";
import { Shell } from "./Shell";
import { ToastProvider, useToast } from "./toast";

const RIGHTS = {
  mayReadItems: true,
  mayAddItems: true,
  mayRemoveItems: true,
  maySetSeen: true,
  maySetKeywords: true,
  mayCreateChild: true,
  mayRename: true,
  mayDelete: true,
  maySubmit: true,
};

function mailbox(m: Partial<Mailbox> & Pick<Mailbox, "id" | "name">): Mailbox {
  return { parentId: null, role: null, sortOrder: 0, totalEmails: 0, unreadEmails: 0, totalThreads: 0, unreadThreads: 0, myRights: RIGHTS, isSubscribed: true, ...m };
}

const MAILBOXES: Mailbox[] = [
  mailbox({ id: "a", name: "Inbox", role: "inbox", unreadThreads: 127, totalThreads: 2035, totalEmails: 2144 }),
  mailbox({ id: "e", name: "Sent Items", role: "sent", totalThreads: 157, totalEmails: 224 }),
  mailbox({ id: "d", name: "Drafts", role: "drafts", totalThreads: 2, totalEmails: 2 }),
  mailbox({ id: "c", name: "Junk Mail", role: "junk" }),
  mailbox({ id: "b", name: "Deleted Items", role: "trash", unreadThreads: 1, totalThreads: 3 }),
  mailbox({ id: "i", name: "Work", unreadThreads: 14, totalThreads: 225 }),
  mailbox({ id: "j", name: "Clients", parentId: "i", unreadThreads: 1, totalThreads: 2 }),
  mailbox({ id: "z", name: "Old stuff", isSubscribed: false, totalThreads: 9 }),
];

function session(get: () => unknown, signOut = vi.fn(async () => {})): SignedInSession {
  const client = {
    accountId: "A",
    call: vi.fn(async (name: string) => {
      if (name === "Mailbox/get") return get();
      throw new Error(`unexpected ${name}`);
    }),
    request: () => {
      throw new Error("not used");
    },
  } as unknown as JmapClient;
  return { client, account: { username: "alice@postern.test", name: "Alice Archer" }, signOut };
}

function renderShell(s: SignedInSession) {
  return render(
    <ThemeProvider>
      <SessionContext.Provider value={s}>
        <Shell />
      </SessionContext.Provider>
    </ThemeProvider>,
  );
}

const loaded = () => ({ accountId: "A", state: "s1", list: MAILBOXES, notFound: [] });

beforeEach(() => {
  window.history.replaceState(null, "", "#inbox");
});

afterEach(() => {
  cleanup();
  resetDisplaySettings();
});

describe("the navigation", () => {
  it("shows the system labels in Gmail's words with their counts, then the nested labels", async () => {
    renderShell(session(loaded));
    const nav = screen.getByRole("navigation", { name: "Mail" });
    await within(nav).findByRole("link", { name: /Work/ });

    expect(within(nav).getByRole("link", { name: "Inbox 127 unread" })).toHaveProperty("hash", "#inbox");
    expect(within(nav).getByRole("link", { name: "Drafts 2 drafts" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Spam" })).toHaveProperty("hash", "#spam");
    expect(within(nav).getByRole("link", { name: "Trash" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "All Mail" })).toHaveProperty("hash", "#all");
    expect(within(nav).getByRole("link", { name: "Starred" })).toBeTruthy();
    expect(within(nav).queryByText("Junk Mail")).toBeNull();
    expect(within(nav).queryByText("Deleted Items")).toBeNull();
    expect(within(nav).getByRole("link", { name: "Inbox 127 unread" }).getAttribute("aria-current")).toBe("page");

    expect(within(nav).getByRole("link", { name: "Work 14 unread" })).toHaveProperty("hash", "#label/i");
    expect(within(nav).getByRole("link", { name: "Clients 1 unread" })).toHaveProperty("hash", "#label/j");
  });

  it("collapses sublabels and keeps unsubscribed labels under More", async () => {
    const user = userEvent.setup();
    renderShell(session(loaded));
    const nav = screen.getByRole("navigation", { name: "Mail" });
    const toggle = await within(nav).findByRole("button", { name: "Work sublabels" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await user.click(toggle);
    expect(within(nav).queryByRole("link", { name: /Clients/ })).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    expect(within(nav).queryByRole("link", { name: /Old stuff/ })).toBeNull();
    await user.click(within(nav).getByRole("button", { name: "More" }));
    expect(within(nav).getByRole("link", { name: "Old stuff" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Less" })).toBeTruthy();
  });

  it("calls the composer from Compose", async () => {
    const user = userEvent.setup();
    renderShell(session(loaded));
    await user.click(screen.getByRole("button", { name: "Compose" }));
  });
});

describe("the main area", () => {
  it("shows a loading skeleton until the labels arrive", async () => {
    let resolve: (v: unknown) => void = () => {};
    renderShell(session(() => new Promise((r) => (resolve = r))));
    expect(screen.getByRole("status", { name: "Loading conversations" })).toBeTruthy();
    await act(async () => resolve(loaded()));
    expect(await screen.findByRole("heading", { level: 1, name: "Inbox" })).toBeTruthy();
  });

  it("says a label is empty in Gmail's words", async () => {
    window.history.replaceState(null, "", "#spam");
    renderShell(session(loaded));
    expect(await screen.findByText("No conversations in Spam")).toBeTruthy();
  });

  it("shows connection lost when the server cannot be reached", async () => {
    renderShell(
      session(() => {
        throw new JmapNetworkError("fetch failed");
      }),
    );
    expect(await screen.findByText("Can't reach the mail server")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("renders every route's screen", async () => {
    renderShell(session(loaded));
    await screen.findByRole("heading", { level: 1, name: "Inbox" });
    const cases: [string, string][] = [
      ["#starred", "Starred"],
      ["#sent", "Sent"],
      ["#drafts", "Drafts"],
      ["#trash", "Trash"],
      ["#all", "All Mail"],
      ["#label/i", "Work"],
      ["#label/i/T1", "Conversation"],
      ["#inbox/T2", "Conversation"],
      ["#search/from%3Abob", "Search results"],
      ["#search/from%3Abob/T3", "Conversation"],
      ["#settings/general", "Settings"],
      ["#contacts", "Contacts"],
    ];
    for (const [hash, heading] of cases) {
      await act(async () => {
        window.location.hash = hash;
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
      expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeTruthy();
    }
    await act(async () => {
      window.location.hash = "#label/nope";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(await screen.findByText("This label doesn't exist")).toBeTruthy();
  });

  it("rewrites an unknown hash to the Inbox", async () => {
    window.history.replaceState(null, "", "#nonsense");
    renderShell(session(loaded));
    await waitFor(() => expect(window.location.hash).toBe("#inbox"));
  });
});

describe("the top bar", () => {
  it("has the search box, help, settings and the account menu with sign-out", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn(async () => {});
    renderShell(session(loaded, signOut));
    expect(screen.getByRole("searchbox", { name: "Search mail" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveProperty("hash", "#settings/general");
    expect(screen.getByRole("button", { name: "Main menu" }).getAttribute("aria-controls")).toBe("shell-nav");

    const account = screen.getByRole("button", { name: "Account: Alice Archer (alice@postern.test)" });
    await user.click(account);
    const card = screen.getByRole("dialog", { name: "Alice Archer" });
    expect(within(card).getByText("alice@postern.test")).toBeTruthy();
    expect(within(card).getByRole("link", { name: /Manage your account/ }).getAttribute("target")).toBe("_blank");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Alice Archer" })).toBeNull();
    expect(document.activeElement).toBe(account);

    await user.click(account);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("goes to search results from the search box", async () => {
    const user = userEvent.setup();
    renderShell(session(loaded));
    await user.type(screen.getByRole("searchbox", { name: "Search mail" }), "from:bob/x{Enter}");
    expect(window.location.hash).toBe("#search/from%3Abob%2Fx");
  });

  it("opens the help sheet", async () => {
    const user = userEvent.setup();
    renderShell(session(loaded));
    await user.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("heading", { name: "Keyboard shortcuts" })).toBeTruthy();
  });
});

describe("the toast", () => {
  function Trigger({ onUndo }: { onUndo: () => void }) {
    const toast = useToast();
    return (
      <button type="button" onClick={() => toast.show({ message: "Conversation archived.", action: { label: "Undo", onClick: onUndo } })}>
        Archive
      </button>
    );
  }

  it("announces in a live region, runs its action and closes", async () => {
    const user = userEvent.setup();
    const undo = vi.fn();
    render(
      <ToastProvider>
        <Trigger onUndo={undo} />
      </ToastProvider>,
    );
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(within(region).getByText("Conversation archived.")).toBeTruthy();
    await user.click(within(region).getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledOnce();
    expect(region.textContent).toBe("");
  });

  it("goes by itself after its duration", async () => {
    vi.useFakeTimers();
    try {
      function Auto() {
        const toast = useToast();
        return (
          <button type="button" onClick={() => toast.show({ message: "Saved", duration: 1000 })}>
            Go
          </button>
        );
      }
      render(
        <ToastProvider>
          <Auto />
        </ToastProvider>,
      );
      act(() => screen.getByRole("button", { name: "Go" }).click());
      expect(screen.getByText("Saved")).toBeTruthy();
      act(() => vi.advanceTimersByTime(1001));
      expect(screen.queryByText("Saved")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the theme", () => {
  it("puts the display settings on <html> and follows the setters", () => {
    render(
      <ThemeProvider>
        <p>hi</p>
      </ThemeProvider>,
    );
    const root = document.documentElement;
    expect(root.dataset["theme"]).toBe("system");
    expect(root.dataset["density"]).toBe("default");
    act(() => {
      setTheme("dark");
      setDensity("compact");
    });
    expect(root.dataset["theme"]).toBe("dark");
    expect(root.dataset["density"]).toBe("compact");
  });
});
