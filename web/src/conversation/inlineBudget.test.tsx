// @vitest-environment jsdom
// Inline images past the per-message budget wait for "Load images"
// (security review 2026-10-20): the store defers them, the body offers the
// control, and loading them fills the frame.

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DownloadParams, EmailBodyPart } from "@postern/jmap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeEmail, FakeMail, MAILBOXES, type FakeEmail } from "../actions/fakeMail";
import { ConversationStore } from "./conversationStore";
import { MessageBody } from "./MessageBody";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MB = 1_000_000;

function image(cid: string, size: number): EmailBodyPart {
  return { partId: cid, blobId: `blob-${cid}`, size, name: `${cid}.png`, type: "image/png", charset: null, disposition: "inline", cid, location: null };
}

const html = '<p>Photos</p><img src="cid:a" alt="a"><img src="cid:b" alt="b"><img src="cid:c" alt="c">';
const EMAIL = {
  ...fakeEmail({ id: "x", threadId: "T", receivedAt: "2026-10-01T10:00:00Z", keywords: { $seen: true } }),
  htmlBody: [{ partId: "1", blobId: "h", size: 100, name: null, type: "text/html", charset: "utf-8", disposition: null, cid: null, location: null }],
  textBody: [],
  attachments: [image("a", 10 * MB), image("b", 5 * MB), image("c", 4 * MB)],
  bodyValues: { "1": { value: html, isEncodingProblem: false, isTruncated: false } },
} as unknown as FakeEmail;

afterEach(() => cleanup());

describe("the inline image budget", () => {
  it("fetches up to 16 MB on open and the rest on request", async () => {
    const mail = new FakeMail({ mailboxes: MAILBOXES, emails: [EMAIL] });
    const client = await mail.connect();
    const fetched: string[] = [];
    const fetchBlob = async (params: DownloadParams) => {
      fetched.push(params.blobId);
      return new Blob([PNG]);
    };
    const store = new ConversationStore(client, "T", { fetchBlob });
    store.activate();
    await store.refresh();
    await store.loadBodies(["x"]);
    let state = store.getSnapshot().bodies.get("x");
    if (state?.status !== "ready" || state.body.kind !== "html") throw new Error("no body");
    // a (10 MB) is past the 8 MB per-image limit; b fits; c would pass 16 MB? 5 + 4 = 9: fits.
    expect(fetched.sort()).toEqual(["blob-b", "blob-c"]);
    expect([...state.body.deferredCids]).toEqual(["a"]);
    expect(state.body.deferredBytes).toBe(10 * MB);

    await store.loadInlineImages("x");
    state = store.getSnapshot().bodies.get("x");
    if (state?.status !== "ready" || state.body.kind !== "html") throw new Error("no body");
    expect(state.body.deferredCids.size).toBe(0);
    expect([...state.body.cidUrls.keys()].sort()).toEqual(["a", "b", "c"]);
    store.dispose();
  });

  it("offers 'Load images' for what was left out", async () => {
    const onLoad = vi.fn();
    render(
      <MessageBody
        state={{
          status: "ready",
          body: { kind: "html", html, cidUrls: new Map(), inlineCids: new Set(), deferredCids: new Set(["a", "b"]), deferredBytes: 18 * MB, truncated: false, encodingProblem: false },
        }}
        senderAddress="bob@postern.test"
        senderName="Bob"
        theme="light"
        allowRemote={false}
        onDisplayImages={() => {}}
        onAlwaysDisplayImages={null}
        onShowOriginal={() => {}}
        onLoadInlineImages={onLoad}
      />,
    );
    expect(screen.getByText(/2 images in this message aren't loaded \(17 MB\)/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Load images" }));
    expect(onLoad).toHaveBeenCalledOnce();
  });
});
