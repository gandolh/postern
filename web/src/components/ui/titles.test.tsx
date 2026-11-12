// @vitest-environment jsdom
// Every dialog in the app is named by its Title (base-ui rule 12): each of the
// eight sites is rendered and found by role and name.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionExpiredDialog } from "../../auth/SessionExpiredDialog";
import { ImageViewer } from "../../attachments/ImageViewer";
import { Question } from "../../composer/Question";
import { ScheduleDialog } from "../../composer/ScheduleDialog";
import type { ConvMessage } from "../../conversation/conversationStore";
import { ShowOriginal } from "../../conversation/ShowOriginal";
import { HelpSheet } from "../../keys/HelpSheet";
import { KeysProvider, useHelpSheet } from "../../keys/helpSheet";
import { SnoozeDialog } from "../../snooze/SnoozeMenu";
import { ConfirmDialog } from "./ConfirmDialog";

// The two viewers fetch through the client: a request that never answers is enough here.
vi.mock("../../auth", () => ({
  useJmap: () => ({ blob: { download: () => new Promise(() => undefined) } }),
}));

afterEach(cleanup);

const noop = () => undefined;

function OpenHelp() {
  const help = useHelpSheet();
  return (
    <button type="button" onClick={help.open}>
      open
    </button>
  );
}

describe("a Title on every dialog", () => {
  it("Question", () => {
    render(<Question title="Send without a subject?" body="b" confirmLabel="Send" onConfirm={noop} onCancel={noop} />);
    expect(screen.getByRole("alertdialog", { name: "Send without a subject?" })).toBeTruthy();
  });

  it("ConfirmDialog", () => {
    render(<ConfirmDialog title="Delete forever?" body="b" confirmLabel="Delete" onConfirm={noop} onCancel={noop} />);
    expect(screen.getByRole("alertdialog", { name: "Delete forever?" })).toBeTruthy();
  });

  it("ScheduleDialog", () => {
    render(<ScheduleDialog maxMs={1e9} onSchedule={noop} onCancel={noop} />);
    expect(screen.getByRole("dialog", { name: "Schedule send" })).toBeTruthy();
  });

  it("SnoozeDialog", () => {
    render(<SnoozeDialog onSnooze={noop} onCancel={noop} />);
    expect(screen.getByRole("dialog", { name: "Snooze until" })).toBeTruthy();
  });

  it("ShowOriginal", () => {
    const message = { blobId: "b1", subject: "Hello", authResults: [] } as unknown as ConvMessage;
    render(<ShowOriginal message={message} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: "Original message" })).toBeTruthy();
  });

  it("HelpSheet", async () => {
    render(
      <KeysProvider>
        <OpenHelp />
        <HelpSheet />
      </KeysProvider>,
    );
    screen.getByRole("button", { name: "open" }).click();
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
  });

  it("SessionExpiredDialog", () => {
    render(
      <SessionExpiredDialog
        username="alice@postern.test"
        onSignIn={() => Promise.reject(new Error("x"))}
        onSignOut={noop}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Session expired" })).toBeTruthy();
  });

  it("ImageViewer", () => {
    render(<ImageViewer part={{ blobId: "b1", name: "cat.png", type: "image/png" }} onClose={noop} />);
    expect(screen.getByRole("dialog", { name: "cat.png" })).toBeTruthy();
  });
});
