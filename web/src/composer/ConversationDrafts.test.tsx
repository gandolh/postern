// @vitest-environment jsdom
// Drafts inside a conversation, with brief 07's view and the composer
// together: a reply draft in Drafts is the inline composer, not also a card;
// any other `$draft` stays a card; the conversation's actions leave the reply
// draft alone; a reply whose original was deleted opens in a window.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeEmail, FakeMail, MAILBOXES, type FakeEmail } from "../actions/fakeMail";
import { clearUndo } from "../actions/undo";
import { SessionContext } from "../auth/context";
import { ConversationView } from "../conversation/ConversationView";
import { LabelsStore, resolveLabelRoute } from "../labels/labelsStore";
import { LabelsStoreProvider, useLabels } from "../labels/useLabels";
import type { LabelRoute } from "../shell/router";
import { ToastProvider } from "../shell/toast";
import { ComposerHost, ComposerProvider } from ".";

beforeAll(() => {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
});

const BOB = [{ name: "Bob Baker", email: "bob@postern.test" }];
const ALICE = [{ name: "Alice Archer", email: "alice@postern.test" }];

function msg(id: string, extra: Partial<FakeEmail>): FakeEmail {
  return {
    ...fakeEmail({ id, threadId: "T1", subject: "Plans", keywords: { $seen: true }, ...extra }),
    blobId: `raw-${id}`,
    size: 100,
    htmlBody: [],
    textBody: [],
    attachments: [],
    bodyValues: {},
  } as unknown as FakeEmail;
}

const original = msg("o1", { from: BOB, receivedAt: "2026-10-01T10:00:00Z", mailboxIds: { a: true } });
const replyDraft = msg("d1", { from: ALICE, to: BOB, receivedAt: "2026-10-02T10:00:00Z", mailboxIds: { d: true }, keywords: { $seen: true, $draft: true } });

function Screen({ route }: { route: LabelRoute }) {
  const labels = useLabels();
  if (labels.status !== "ready") return null;
  return <ConversationView route={route} conversationId="T1" label={resolveLabelRoute(route, labels)} />;
}

async function renderConversation(emails: FakeEmail[]) {
  const mail = new FakeMail({ mailboxes: MAILBOXES, emails });
  const client = await mail.connect();
  const labels = new LabelsStore(client, () => "A");
  const user = userEvent.setup();
  render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <LabelsStoreProvider store={labels}>
        <ToastProvider>
          <ComposerProvider>
            <Screen route={{ kind: "system", view: "inbox", conversationId: "T1" }} />
            <ComposerHost />
          </ComposerProvider>
        </ToastProvider>
      </LabelsStoreProvider>
    </SessionContext.Provider>,
  );
  return { mail, user };
}

const cards = () => Array.from(document.querySelectorAll("article[id^='conv-message-']"), (a) => a.id.replace("conv-message-", ""));

beforeEach(() => {
  window.history.replaceState(null, "", "#inbox/T1");
  clearUndo();
});
afterEach(() => cleanup());

describe("drafts in a conversation", () => {
  it("shows a reply draft in Drafts as the inline composer only, not also as a card", async () => {
    await renderConversation([original, replyDraft]);
    await screen.findByRole("heading", { level: 1, name: "Plans" });
    await screen.findByRole("region", { name: "Reply" });
    expect(cards()).toEqual(["o1"]);
  });

  it("keeps any other $draft message as a card, and does not open it inline", async () => {
    const imported = msg("d2", { from: ALICE, receivedAt: "2026-10-02T10:00:00Z", mailboxIds: { a: true }, keywords: { $seen: true, $draft: true } });
    await renderConversation([original, imported]);
    await screen.findByRole("heading", { level: 1, name: "Plans" });
    await waitFor(() => expect(cards()).toEqual(["o1", "d2"]));
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole("region", { name: "Reply" })).toBeNull();
  });

  it("leaves the reply draft alone when the conversation is deleted", async () => {
    const { mail, user } = await renderConversation([original, replyDraft]);
    await screen.findByRole("region", { name: "Reply" });
    await user.click(within(screen.getByRole("toolbar", { name: "Conversation actions" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(Object.keys(mail.emails.get("o1")!.mailboxIds)).toEqual(["b"]));
    expect(mail.emails.get("d1")!.mailboxIds).toEqual({ d: true });
  });

  it("opens a reply whose original was deleted in a window, and goes back to the list", async () => {
    const trashed = { ...original, mailboxIds: { b: true } } as FakeEmail;
    await renderConversation([trashed, replyDraft]);
    const window_ = await screen.findByRole("dialog", { name: "Plans" });
    expect(window_.getAttribute("data-placement")).toBe("docked");
    expect(window.location.hash).toBe("#inbox");
    expect(screen.queryByRole("region", { name: "Reply" })).toBeNull();
  });
});
