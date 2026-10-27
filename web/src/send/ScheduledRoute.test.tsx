// @vitest-environment jsdom
// The Scheduled page (brief 23): what waits, soonest first with its time,
// Cancel send, and a message that went out leaving for Sent.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SessionContext } from "../auth/context";
import { ComposerProvider } from "../composer/compose";
import { LabelsStore } from "../labels/labelsStore";
import { LabelsStoreProvider } from "../labels/useLabels";
import { ToastProvider } from "../shell/toast";
import { formatSendTime, scheduleDraft } from "./schedule";
import { ScheduledRoute } from "./ScheduledRoute";
import { ComposeTestServer, MAILBOXES } from "./testServer";

afterEach(cleanup);

async function renderPage(setup: (server: ComposeTestServer, client: Awaited<ReturnType<ComposeTestServer["connect"]>>) => Promise<void>) {
  const server = new ComposeTestServer({ maxDelayedSend: 2_592_000 });
  const client = await server.connect();
  await setup(server, client);
  const labels = new LabelsStore(client, () => "A");
  await labels.sync();
  render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <LabelsStoreProvider store={labels}>
        <ToastProvider>
          <ComposerProvider>
            <ScheduledRoute />
          </ComposerProvider>
        </ToastProvider>
      </LabelsStoreProvider>
    </SessionContext.Provider>,
  );
  return { server, user: userEvent.setup() };
}

function draft(server: ComposeTestServer, id: string, subject: string) {
  server.add({ id, mailboxIds: { [MAILBOXES.drafts]: true }, keywords: { $draft: true, $seen: true }, subject, preview: `About ${subject}`, to: [{ name: "Bob Baker", email: "bob@postern.test" }] });
}

const SOON = "2026-11-03T08:00:00Z";
const LATER = "2026-11-05T13:00:00Z";

describe("the Scheduled page", () => {
  it("lists what waits, soonest first, and Cancel send leaves a draft", async () => {
    const { server, user } = await renderPage(async (server, client) => {
      draft(server, "M1", "Later one");
      draft(server, "M2", "Sooner one");
      await scheduleDraft(client, { emailId: "M1", identityId: "I1", from: "alice@postern.test", at: new Date(LATER) });
      await scheduleDraft(client, { emailId: "M2", identityId: "I1", from: "alice@postern.test", at: new Date(SOON) });
    });
    const list = await screen.findByRole("list", { name: "Scheduled" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      `To: Bob BakerSooner one – About Sooner one${formatSendTime(SOON)}`,
      `To: Bob BakerLater one – About Later one${formatSendTime(LATER)}`,
    ]);

    const first = within(items[0]!).getByRole("button", { expanded: false });
    await user.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("true");
    await user.click(within(items[0]!).getByRole("button", { name: "Cancel send" }));
    expect(await screen.findByText("Send canceled. The message is in Drafts.")).toBeTruthy();
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Scheduled" })).getAllByRole("listitem")).toHaveLength(1));
    expect(server.emails.get("M2")!.keywords).toEqual({ $draft: true, $seen: true });
    expect(server.emails.get("M2")!.mailboxIds).toEqual({ [MAILBOXES.drafts]: true });
  });

  it("files a message that went out in Sent, and says when nothing waits", async () => {
    const { server } = await renderPage(async (server, client) => {
      draft(server, "M1", "Gone");
      const s = await scheduleDraft(client, { emailId: "M1", identityId: "I1", from: "alice@postern.test", at: new Date(SOON) });
      server.release(s.submissionId);
    });
    expect(await screen.findByText("No scheduled messages")).toBeTruthy();
    expect(server.emails.get("M1")!.mailboxIds).toEqual({ [MAILBOXES.sent]: true });
    expect(server.emails.get("M1")!.keywords).toEqual({ $seen: true });
  });
});
