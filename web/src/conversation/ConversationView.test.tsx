// @vitest-environment jsdom
// The conversation view over the fake JMAP server: message HTML only ever in
// sandboxed srcdoc frames, never in the app's DOM; collapsed and open
// messages, the fold, mark read on open (without an undo), images on
// request, plain text with links and its quote, the keyboard controller.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EmailBodyPart } from "@postern/jmap";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeEmail, FakeMail, MAILBOXES, type FakeEmail } from "../actions/fakeMail";
import { clearUndo, peekUndo } from "../actions/undo";
import { SessionContext } from "../auth/context";
import { LabelsStore, resolveLabelRoute } from "../labels/labelsStore";
import { LabelsStoreProvider, useLabels } from "../labels/useLabels";
import { MESSAGE_FRAME_SANDBOX } from "../render/srcdoc";
import type { LabelRoute } from "../shell/router";
import { ToastProvider } from "../shell/toast";
import { ConversationView } from "./ConversationView";
import { getActiveConversation } from "./registry";

function part(partId: string, type: string): EmailBodyPart {
  return { partId, blobId: `blob-${partId}`, size: 100, name: null, type, charset: "utf-8", disposition: null, cid: null, location: null };
}

/** A message with a body, as Email/get returns it with the body properties. */
function message(id: string, threadId: string, receivedAt: string, body: { html?: string; text?: string }, extra: Partial<FakeEmail> = {}): FakeEmail {
  const html = body.html !== undefined ? [part("1", "text/html")] : [];
  const text = body.text !== undefined ? [part("2", "text/plain")] : [];
  return {
    ...fakeEmail({ id, threadId, receivedAt, keywords: { $seen: true }, subject: "Plans", ...extra }),
    blobId: `raw-${id}`,
    size: 1000,
    htmlBody: html.length ? html : text,
    textBody: text.length ? text : html,
    attachments: [],
    bodyValues: {
      ...(body.html !== undefined ? { "1": { value: body.html, isEncodingProblem: false, isTruncated: false } } : {}),
      ...(body.text !== undefined ? { "2": { value: body.text, isEncodingProblem: false, isTruncated: false } } : {}),
    },
  } as unknown as FakeEmail;
}

const BOB = [{ name: "Bob Baker", email: "bob@postern.test" }];
const FORGED = [{ name: "security@bank.example.com", email: "attacker@evil.test" }];

const T1 = [
  message(
    "e1",
    "T1",
    "2026-10-01T10:00:00Z",
    { html: '<p>OLDEST_HTML_TEXT <img src="https://t.test/pixel.png" width="1" height="1"></p><script>window.__POSTERN_PWNED=1</script>' },
    { from: BOB, preview: "oldest preview" },
  ),
  message("e2", "T1", "2026-10-02T10:00:00Z", { text: "See https://example.test/x for details.\n\nOn Thu, Bob <bob@postern.test> wrote:\n> QUOTED_PLAIN_TEXT\n" }, { from: BOB }),
  message(
    "e3",
    "T1",
    "2026-10-03T10:00:00Z",
    { html: '<div>NEWEST_HTML_TEXT</div><div class="gmail_quote">On Fri, Bob wrote:<blockquote>QUOTED_HTML_TEXT</blockquote></div>' },
    { from: FORGED, keywords: {} },
  ),
];

const INBOX: LabelRoute = { kind: "system", view: "inbox", conversationId: "T1" };

function Screen({ route, conversationId }: { route: LabelRoute; conversationId: string }) {
  const labels = useLabels();
  if (labels.status !== "ready") return null;
  const label = resolveLabelRoute(route, labels);
  return <ConversationView route={route} conversationId={conversationId} label={label} />;
}

async function renderConversation(emails: FakeEmail[], conversationId = "T1") {
  const mail = new FakeMail({ mailboxes: MAILBOXES, emails });
  const client = await mail.connect();
  const labels = new LabelsStore(client, () => "A");
  const user = userEvent.setup();
  const route: LabelRoute = { ...INBOX, conversationId };
  render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <LabelsStoreProvider store={labels}>
        <ToastProvider>
          <Screen route={route} conversationId={conversationId} />
        </ToastProvider>
      </LabelsStoreProvider>
    </SessionContext.Provider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Plans" });
  return { mail, user };
}

const frames = () => Array.from(document.querySelectorAll("iframe"));

beforeEach(() => {
  window.history.replaceState(null, "", "#inbox/T1");
  clearUndo();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("the conversation view", () => {
  it("renders message HTML only in sandboxed srcdoc frames, never in the app's DOM", async () => {
    await renderConversation(T1);
    await waitFor(() => expect(frames()).toHaveLength(1));
    for (const frame of frames()) {
      expect(frame.getAttribute("sandbox")).toBe(MESSAGE_FRAME_SANDBOX);
      expect(frame.getAttribute("srcdoc")).toContain("NEWEST_HTML_TEXT");
      expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    }
    // The text of HTML bodies is nowhere in the app's own document.
    expect(document.body.textContent).not.toContain("NEWEST_HTML_TEXT");
    expect(document.querySelector("script")).toBeNull();
    expect((window as { __POSTERN_PWNED?: unknown }).__POSTERN_PWNED).toBeUndefined();
  });

  it("collapses read messages to a line, opens the unread and the newest, and flags a forged name", async () => {
    await renderConversation(T1);
    const lines = screen.getAllByRole("button", { expanded: false }).filter((b) => b.classList.contains("conv-msg-line"));
    expect(lines).toHaveLength(2);
    expect(lines[0]!.textContent).toContain("Bob Baker");
    expect(lines[0]!.textContent).toContain("bob@postern.test");
    expect(screen.getByText(/The name says/).textContent).toContain("attacker@evil.test");
    // The real address is always next to the name.
    expect(screen.getByText("<attacker@evil.test>")).toBeTruthy();
  });

  it("marks the conversation read on open, without registering an undo", async () => {
    const { mail } = await renderConversation(T1);
    await waitFor(() => expect(mail.emails.get("e3")!.keywords["$seen"]).toBe(true));
    expect(peekUndo()).toBeNull();
  });

  it("blocks remote images until asked, then restores them for that message", async () => {
    const { user } = await renderConversation(T1);
    const lines = screen.getAllByRole("button", { expanded: false }).filter((b) => b.classList.contains("conv-msg-line"));
    await user.click(lines[0]!);
    await waitFor(() => expect(frames()).toHaveLength(2));
    const first = () => frames().find((f) => f.getAttribute("srcdoc")?.includes("OLDEST_HTML_TEXT"))!;
    expect(first().getAttribute("srcdoc")).not.toContain("t.test");
    expect(first().getAttribute("srcdoc")).not.toContain("POSTERN_PWNED");
    await user.click(await screen.findByRole("button", { name: "Display images below" }));
    await waitFor(() => expect(first().getAttribute("srcdoc")).toContain('src="https://t.test/pixel.png"'));
    expect(screen.queryByText(/Images are not displayed/)).toBeNull();
  });

  it("shows plain text as text, with safe links and a folded quote", async () => {
    const { user } = await renderConversation(T1);
    const lines = screen.getAllByRole("button", { expanded: false }).filter((b) => b.classList.contains("conv-msg-line"));
    await user.click(lines[1]!);
    const link = await screen.findByRole("link", { name: "https://example.test/x" });
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByText(/QUOTED_PLAIN_TEXT/)).toBeNull();
    const toggles = screen.getAllByRole("button", { name: "Show quoted text" });
    await user.click(toggles[0]!);
    expect(screen.getByText(/QUOTED_PLAIN_TEXT/)).toBeTruthy();
  });

  it("folds the trailing HTML quote in the frame, and shows it on request", async () => {
    const { user } = await renderConversation(T1);
    await waitFor(() => expect(frames()).toHaveLength(1));
    expect(frames()[0]!.getAttribute("srcdoc")).toContain("[data-postern-quote]{display:none!important}");
    await user.click(screen.getByRole("button", { name: "Show quoted text" }));
    expect(frames()[0]!.getAttribute("srcdoc")).not.toContain("[data-postern-quote]{display:none");
  });

  it("folds a long run of read messages behind 'N older messages'", async () => {
    const many = Array.from({ length: 7 }, (_, i) => message(`m${i}`, "T2", `2026-10-0${i + 1}T10:00:00Z`, { text: `body ${i}` }, { from: BOB }));
    const { user } = await renderConversation(many, "T2");
    const fold = screen.getByRole("button", { name: "3 older messages" });
    expect(document.querySelectorAll(".conv-msg")).toHaveLength(4);
    await user.click(fold);
    expect(document.querySelectorAll(".conv-msg")).toHaveLength(7);
  });

  it("offers brief 14 a controller for the open conversation", async () => {
    await renderConversation(T1);
    const controller = getActiveConversation();
    expect(controller?.conversationId).toBe("T1");
    expect(controller?.messageIds()).toEqual(["e1", "e2", "e3"]);
  });

  it("marks unread from a message with an undoable toast, and goes back to the list", async () => {
    const { mail, user } = await renderConversation(T1);
    await waitFor(() => expect(mail.emails.get("e3")!.keywords["$seen"]).toBe(true));
    const open = document.getElementById("conv-message-e3")!;
    await user.click(within(open).getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("menuitem", { name: "Mark unread from here" }));
    await waitFor(() => expect(mail.emails.get("e3")!.keywords["$seen"]).toBeUndefined());
    expect(mail.emails.get("e1")!.keywords["$seen"]).toBe(true);
    expect(peekUndo()?.label).toBe("Marked as unread from here.");
    expect(window.location.hash).toBe("#inbox");
  });

  it("remembers 'Always display images from' per account on this device", async () => {
    const { user } = await renderConversation(T1);
    const lines = screen.getAllByRole("button", { expanded: false }).filter((b) => b.classList.contains("conv-msg-line"));
    await user.click(lines[0]!);
    await user.click(await screen.findByRole("button", { name: "Always display images from bob@postern.test" }));
    await waitFor(() => expect(frames().some((f) => f.getAttribute("srcdoc")?.includes('src="https://t.test/pixel.png"'))).toBe(true));
    expect(JSON.parse(window.localStorage.getItem("postern.images.alice@postern.test") ?? "[]")).toEqual(["bob@postern.test"]);
  });

  it("archives from the toolbar and goes back to the list", async () => {
    const { mail, user } = await renderConversation(T1);
    await user.click(within(screen.getByRole("toolbar", { name: "Conversation actions" })).getByRole("button", { name: "Archive" }));
    expect(window.location.hash).toBe("#inbox");
    await waitFor(() => expect(Object.keys(mail.emails.get("e1")!.mailboxIds)).toEqual(["h"]));
    expect(peekUndo()?.label).toBe("Conversation archived.");
  });
});
