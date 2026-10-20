// @vitest-environment jsdom
// The inline reply moving to a window keeps every word typed (even before
// the next autosave), and HTML dropped on the body is sanitised as a paste:
// no pasted quote or signature markers.

import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SessionContext } from "../auth/context";
import { inlineReplySlotId } from "../conversation/inlineReply";
import { LabelsStore } from "../labels/labelsStore";
import { LabelsStoreProvider } from "../labels/useLabels";
import { ComposeTestServer, MAILBOXES } from "../send/testServer";
import { ToastProvider } from "../shell/toast";
import { ComposerHost, ComposerProvider, useCompose } from ".";
import { InlineReplySlot } from "./InlineReply";

beforeAll(() => {
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Opener() {
  const compose = useCompose();
  return (
    <button type="button" onClick={() => compose.open({ display: "inline", threadId: "T1", to: [{ name: "Bob Baker", email: "bob@postern.test" }] })}>
      Reply here
    </button>
  );
}

async function renderInline() {
  const server = new ComposeTestServer();
  const client = await server.connect();
  const labels = new LabelsStore(client, () => "A");
  const user = userEvent.setup();
  render(
    <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
      <LabelsStoreProvider store={labels}>
        <ToastProvider>
          <ComposerProvider>
            <Opener />
            <div id={inlineReplySlotId("T1")}>
              <InlineReplySlot context={{ threadId: "T1", lastMessageId: "x", messageIds: [], subject: "" }} />
            </div>
            <ComposerHost />
          </ComposerProvider>
        </ToastProvider>
      </LabelsStoreProvider>
    </SessionContext.Provider>,
  );
  await labels.sync();
  await user.click(screen.getByRole("button", { name: "Reply here" }));
  const inline = await screen.findByRole("region", { name: "Reply" });
  const body = await within(inline).findByRole("textbox", { name: "Message body" });
  return { server, user, inline, body };
}

function type(body: HTMLElement, text: string) {
  const line = document.createElement("div");
  line.textContent = text;
  body.replaceChildren(line);
  fireEvent.input(body);
}

describe("the inline reply", () => {
  it("keeps what was typed since the last save when it pops out to a window", async () => {
    const { server, user, inline, body } = await renderInline();
    type(body, "Typed just now");
    await act(async () => {
      await user.click(within(inline).getByRole("button", { name: "Pop out reply" }));
    });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Message body" }).textContent).toBe("Typed just now");
    expect(screen.queryByRole("region", { name: "Reply" })).toBeNull();
    // The next autosave writes what is on screen.
    await waitFor(() => expect([...server.emails.values()].some((e) => e.mailboxIds[MAILBOXES.drafts])).toBe(true), { timeout: 5000 });
    const draft = [...server.emails.values()].find((e) => e.mailboxIds[MAILBOXES.drafts])!;
    expect((draft["bodyValues"] as Record<string, { value: string }>)["text"]?.value).toBe("Typed just now");
  }, 10_000);

  it("sanitises dropped HTML as a paste: nothing that runs, and no quote or signature markers", async () => {
    const { body } = await renderInline();
    const html = `<div class="gmail_quote">I attached it<img src="x" onerror="window.__POSTERN_PWNED=1"></div><div class="postern_signature">-- <br>Mallory</div><script>window.__POSTERN_PWNED=2</script>`;
    const drop = createEvent.drop(body, {
      dataTransfer: { types: ["text/html", "text/plain"], files: [], getData: (type: string) => (type === "text/html" ? html : "") },
    });
    fireEvent(body, drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(body.querySelector("[class], script, [onerror]")).toBeNull();
    expect(body.textContent).toContain("I attached it");
    expect((window as { __POSTERN_PWNED?: number }).__POSTERN_PWNED).toBeUndefined();
  });

  it("says it will close once the files are up when closed during an upload", async () => {
    const { user, inline } = await renderInline();
    await act(async () => {
      await user.click(within(inline).getByRole("button", { name: "Pop out reply" }));
    });
    const dialog = await screen.findByRole("dialog");
    // An upload that never finishes.
    vi.stubGlobal(
      "XMLHttpRequest",
      class {
        upload = {};
        open() {}
        setRequestHeader() {}
        send() {}
        abort() {}
      },
    );
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]:not([accept])')!;
    await user.upload(input, new File(["abc"], "report.pdf", { type: "application/pdf" }));
    await user.click(within(dialog).getByRole("button", { name: "Save & close" }));
    expect(within(dialog).getByText(/The draft will be saved and closed when the files finish/)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBe(dialog);
  });
});
