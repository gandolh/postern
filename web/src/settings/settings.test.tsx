// @vitest-environment jsdom
// The settings forms against a stub client: General (prefs, vacation, image
// senders, notifications), Accounts (identities, quota, links), the tabs.

import type { JmapClient } from "@postern/jmap";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionContext } from "../auth/context";
import { getPrefs, resetPrefs, setPrefsAccount } from "../prefs/prefs";
import { clearMemory } from "../prefs/storage";
import { allowImagesFrom, imageAllowanceList } from "../render/allowance";
import { getUndoSendDelay } from "../send/undoDelay";
import { ThemeProvider, getDisplaySettings } from "../theme";
import { resetDisplaySettings } from "../theme/displaySettings";
import { SettingsRoutes } from "./SettingsRoutes";
import { QuotaBar, formatBytes, pickStorageQuota } from "./QuotaBar";
import { dateOnly, toUtc } from "./VacationForm";

vi.mock("../labels/LabelManager", () => ({ LabelManager: () => <p>label manager</p> }));
vi.mock("../filters/FiltersSettings", () => ({ FiltersSettings: () => <p>filters page</p> }));
vi.mock("../notify", () => ({
  useDesktopNotifications: () => ({ enabled: false, permission: "default", setEnabled: async () => true }),
}));

const ME = "alice@postern.test";

interface Stub {
  client: JmapClient;
  vacationSet: ReturnType<typeof vi.fn>;
  identitySet: ReturnType<typeof vi.fn>;
}

function stub(options: { quota?: unknown[]; caps?: string[] } = {}): Stub {
  const caps = new Set(options.caps ?? ["urn:ietf:params:jmap:vacationresponse", "urn:ietf:params:jmap:quota"]);
  const vacation = { id: "singleton", isEnabled: false, fromDate: null, toDate: null, subject: null, textBody: null, htmlBody: null };
  const vacationSet = vi.fn(async () => undefined);
  const identitySet = vi.fn(async () => ({ updated: { I1: null } }));
  const client = {
    session: { hasCapability: (c: string) => caps.has(c) },
    vacationResponse: { get: async () => ({ ...vacation }), set: vacationSet },
    identity: {
      get: async () => ({
        list: [
          { id: "I1", name: "Alice Archer", email: ME, replyTo: null, bcc: null, textSignature: "", htmlSignature: "", mayDelete: false },
          { id: "I2", name: "Alice Work", email: "alice+work@postern.test", replyTo: null, bcc: null, textSignature: "", htmlSignature: "", mayDelete: true },
        ],
      }),
      set: identitySet,
    },
    quota: { get: async () => ({ list: options.quota ?? [] }) },
  } as unknown as JmapClient;
  return { client, vacationSet, identitySet };
}

function renderSettings(section: string, s: Stub = stub()) {
  return {
    s,
    ...render(
      <ThemeProvider>
        <SessionContext.Provider value={{ client: s.client, account: { username: ME }, signOut: async () => {} }}>
          <SettingsRoutes section={section} />
        </SessionContext.Provider>
      </ThemeProvider>,
    ),
  };
}

beforeEach(() => {
  localStorage.clear();
  clearMemory();
  resetPrefs();
  resetDisplaySettings();
  setPrefsAccount(ME);
});
afterEach(cleanup);

describe("tabs", () => {
  it("links the four sections and marks the current one", () => {
    renderSettings("accounts");
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["General", "Accounts", "Labels", "Filters"]);
    expect(within(nav).getByRole("link", { name: "Accounts" }).getAttribute("aria-current")).toBe("page");
  });
  it("renders the label manager and the filters page", () => {
    const { unmount } = renderSettings("labels");
    expect(screen.getByText("label manager")).toBeTruthy();
    unmount();
    renderSettings("filters");
    expect(screen.getByText("filters page")).toBeTruthy();
  });
});

describe("General", () => {
  it("applies display settings at once and groups radios in labelled fieldsets", async () => {
    renderSettings("general");
    const user = userEvent.setup();
    const theme = screen.getByRole("group", { name: "Theme" });
    await user.click(within(theme).getByRole("radio", { name: "Dark" }));
    expect(getDisplaySettings().theme).toBe("dark");
    await user.click(within(screen.getByRole("group", { name: "Reading pane" })).getByRole("radio", { name: "Right of inbox" }));
    expect(getDisplaySettings().readingPane).toBe("right");
    expect(JSON.parse(localStorage.getItem("postern.display")!)).toMatchObject({ theme: "dark", readingPane: "right" });
  });

  it("the undo-send choice reaches the send lane", async () => {
    renderSettings("general");
    await userEvent.setup().selectOptions(screen.getByLabelText("Undo send: cancellation period"), "20");
    expect(getUndoSendDelay()).toBe(20_000);
    expect(getPrefs().undoSendSeconds).toBe(20);
  });

  it("images and shortcuts are saved", async () => {
    renderSettings("general");
    const user = userEvent.setup();
    expect(within(screen.getByRole("group", { name: "Images" })).getByRole("radio", { name: /Ask before/ })).toHaveProperty("checked", true);
    await user.click(screen.getByRole("radio", { name: "Always display external images" }));
    await user.click(screen.getByRole("checkbox", { name: "Keyboard shortcuts on" }));
    expect(getPrefs()).toMatchObject({ images: "always", shortcuts: false });
  });

  it("lists allowed senders and removes one", async () => {
    allowImagesFrom(ME, "news@shop.test");
    renderSettings("general");
    expect(screen.getByText("news@shop.test")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Remove news@shop.test" }));
    expect(imageAllowanceList(ME)).toEqual([]);
    expect(screen.queryByText("news@shop.test")).toBeNull();
  });

  it("saves the vacation responder: switch and dates on change, text on blur", async () => {
    const { s } = renderSettings("general");
    const user = userEvent.setup();
    await screen.findByLabelText("Subject");
    await user.click(screen.getByRole("checkbox", { name: "Vacation responder on" }));
    expect(s.vacationSet).toHaveBeenLastCalledWith({ isEnabled: true });
    await user.type(screen.getByLabelText("Subject"), "Away");
    expect(s.vacationSet).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(s.vacationSet).toHaveBeenLastCalledWith({ subject: "Away" });
    await user.type(screen.getByLabelText("Message"), "Back soon");
    await user.tab();
    expect(s.vacationSet).toHaveBeenLastCalledWith({ textBody: "Back soon" });
    expect((await screen.findAllByRole("status")).some((n) => n.textContent === "Saved")).toBe(true);
  });

  it("shows a failed save", async () => {
    const s = stub();
    s.vacationSet.mockRejectedValueOnce(new Error("nope"));
    renderSettings("general", s);
    await screen.findByLabelText("Subject");
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Vacation responder on" }));
    await waitFor(() => expect(screen.getAllByRole("status").some((n) => n.textContent === "Could not save: nope")).toBe(true));
  });

  it("omits the vacation form when the server has no such capability", () => {
    renderSettings("general", stub({ caps: [] }));
    expect(screen.queryByText("Vacation responder")).toBeNull();
  });

  it("date helpers", () => {
    expect(toUtc("2026-10-21", "start")).toBe("2026-10-21T00:00:00Z");
    expect(toUtc("2026-10-21", "end")).toBe("2026-10-21T23:59:59Z");
    expect(toUtc("", "start")).toBeNull();
    expect(dateOnly("2026-10-21T23:59:59Z")).toBe("2026-10-21");
    expect(dateOnly(null)).toBe("");
  });
});

describe("Accounts", () => {
  it("saves a signature through Identity/set and picks the default identity", async () => {
    const { s } = renderSettings("accounts");
    const user = userEvent.setup();
    const sig = (await screen.findAllByLabelText("Signature (plain text)"))[0]!;
    await user.type(sig, "Alice");
    await user.tab();
    expect(s.identitySet).toHaveBeenCalledWith({ update: { I1: { textSignature: "Alice" } } });
    await user.selectOptions(screen.getByLabelText("Default identity on this device"), "I2");
    expect(getPrefs().defaultIdentityId).toBe("I2");
  });

  it("rejects a bad reply-to without calling the server", async () => {
    const { s } = renderSettings("accounts");
    const user = userEvent.setup();
    const reply = (await screen.findAllByLabelText("Reply-to address"))[0]!;
    await user.type(reply, "not an address");
    await user.tab();
    expect(screen.getAllByRole("alert")[0]!.textContent).toMatch(/one email address/);
    expect(s.identitySet).not.toHaveBeenCalled();
  });

  it("previews an HTML signature only inside a sandboxed iframe", async () => {
    renderSettings("accounts");
    const user = userEvent.setup();
    const html = (await screen.findAllByLabelText("Signature (HTML, optional)"))[0]!;
    await user.click(html);
    await user.paste('<b>Hi</b><script>alert(1)</script><img src="https://x.test/p.png">');
    await user.tab();
    const frame = await screen.findByTitle(/Preview of the HTML signature for alice@/);
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("<b>Hi</b>");
    expect(frame.getAttribute("srcdoc")).not.toMatch(/<script/i);
    expect(document.querySelector("b")).toBeNull();
  });

  it("links to the account page", () => {
    renderSettings("accounts");
    expect(screen.getByRole("link", { name: "App passwords" }).getAttribute("href")).toMatch(/account/);
  });
});

describe("QuotaBar", () => {
  const wrap = (s: Stub) =>
    render(
      <SessionContext.Provider value={{ client: s.client, account: { username: ME }, signOut: async () => {} }}>
        <QuotaBar />
      </SessionContext.Provider>,
    );

  it("shows used of limit as a meter", async () => {
    wrap(stub({ quota: [{ id: "q", resourceType: "octets", used: 250_000_000, hardLimit: 1_000_000_000, scope: "account", name: "a", types: ["Email"] }] }));
    const meter = await screen.findByRole("meter");
    expect(meter.getAttribute("aria-valuenow")).toBe("250000000");
    expect(screen.getByText(/250 MB of 1\.0? ?GB used \(25%\)|250 MB of 1 GB used \(25%\)/)).toBeTruthy();
  });
  it("says there is no limit when no quota is set", async () => {
    wrap(stub({ quota: [] }));
    expect(await screen.findByText("No storage limit.")).toBeTruthy();
  });
  it("formats and picks", () => {
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1_500_000)).toBe("1.5 MB");
    expect(pickStorageQuota([{ resourceType: "count" } as never, { resourceType: "octets", scope: "domain" } as never, { resourceType: "octets", scope: "account" } as never])?.scope).toBe("account");
  });
});

void act;
