// @vitest-environment jsdom
// Brief 26: a message row opens alone, and the reader's `j` / `k` step through
// the message rows the list held, on screen or not.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MailRoute } from "../shell/router";
import { forgetMessageRows, heldMessageRows, holdMessageRows, messageRowRoute, openNeighbourRow } from "./openMessage";
import { requestReturnFocus, takeReturnFocus } from "./returnFocus";

const INBOX: MailRoute = { kind: "system", view: "inbox" };
const row = (id: string, conversationId: string) => ({ id, conversationId, emailId: id });
const ROWS = [row("m3", "T1"), row("m2", "T1"), row("s1", "T2"), row("m1", "T1")];

beforeEach(() => window.history.replaceState(null, "", "#inbox"));
afterEach(() => forgetMessageRows());

describe("messageRowRoute", () => {
  it("names the conversation and the message, on the same list", () => {
    expect(messageRowRoute({ kind: "label", labelId: "i" }, row("m2", "T1"))).toEqual({ kind: "label", labelId: "i", conversationId: "T1", messageId: "m2" });
    expect(messageRowRoute({ ...INBOX, conversationId: "T9", messageId: "x" }, row("m2", "T1"))).toEqual({ ...INBOX, conversationId: "T1", messageId: "m2" });
  });
});

describe("openNeighbourRow", () => {
  it("opens the next row on j and the previous on k, and focus comes back to the last one opened", () => {
    holdMessageRows(INBOX, ROWS, () => {});
    expect(openNeighbourRow({ ...INBOX, conversationId: "T1", messageId: "m2" }, 1)).toBe(true);
    expect(window.location.hash).toBe("#inbox/T2/s1");
    expect(openNeighbourRow({ ...INBOX, conversationId: "T2", messageId: "s1" }, -1)).toBe(true);
    expect(window.location.hash).toBe("#inbox/T1/m2");
    requestReturnFocus(false);
    expect(takeReturnFocus(ROWS)).toBe("m2");
  });

  it("stops at either end", () => {
    holdMessageRows(INBOX, ROWS, () => {});
    expect(openNeighbourRow({ ...INBOX, conversationId: "T1", messageId: "m3" }, -1)).toBe(false);
    expect(openNeighbourRow({ ...INBOX, conversationId: "T1", messageId: "m1" }, 1)).toBe(false);
    expect(window.location.hash).toBe("#inbox");
  });

  it("keeps the rows when the list unmounts (reading pane off), without its loader", () => {
    const loadMore = vi.fn();
    const release = holdMessageRows(INBOX, ROWS, loadMore);
    expect(openNeighbourRow({ ...INBOX, conversationId: "T1", messageId: "m3" }, 1)).toBe(true);
    expect(loadMore).toHaveBeenCalledWith(1 + 20);
    release();
    loadMore.mockClear();
    expect(openNeighbourRow({ ...INBOX, conversationId: "T1", messageId: "m2" }, 1)).toBe(true);
    expect(window.location.hash).toBe("#inbox/T2/s1");
    expect(loadMore).not.toHaveBeenCalled();
  });

  it("does nothing for another list, a whole conversation, or with nothing held", () => {
    expect(openNeighbourRow({ ...INBOX, conversationId: "T1", messageId: "m3" }, 1)).toBe(false);
    holdMessageRows(INBOX, ROWS, () => {});
    expect(openNeighbourRow({ kind: "system", view: "starred", conversationId: "T1", messageId: "m3" }, 1)).toBe(false);
    expect(openNeighbourRow({ ...INBOX, conversationId: "T1" }, 1)).toBe(false);
    expect(openNeighbourRow({ ...INBOX, conversationId: "T1", messageId: "elsewhere" }, 1)).toBe(false);
    forgetMessageRows();
    expect(heldMessageRows()).toBeNull();
    expect(window.location.hash).toBe("#inbox");
  });

  it("follows the list it came from, with the open message", () => {
    holdMessageRows({ kind: "search", query: "from:bob" }, ROWS, () => {});
    expect(openNeighbourRow({ kind: "search", query: "from:bob", conversationId: "T1", messageId: "m3" }, 1)).toBe(true);
    expect(window.location.hash).toBe("#search/from%3Abob/T1/m2");
  });
});
