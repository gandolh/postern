import { describe, expect, it } from "vitest";
import type { RowMessage } from "./types";
import { labelListView } from "./view";

const roles = { inbox: "a", trash: "b", junk: "c", drafts: "d", sent: "e", archive: "h" };
const msg = (mailboxIds: string[], keywords: string[] = []): RowMessage => ({
  id: "1",
  threadId: "T",
  receivedAt: "2026-10-01T00:00:00Z",
  mailboxIds: Object.fromEntries(mailboxIds.map((x) => [x, true as const])),
  keywords: Object.fromEntries(keywords.map((k) => [k, true as const])),
});

describe("labelListView", () => {
  it("lists a system label by its role's mailbox", () => {
    const inbox = labelListView({ view: "inbox", mailboxId: "a" }, roles)!;
    expect(inbox.query.filter).toEqual({ inMailbox: "a" });
    expect(inbox.query.scope.kind).toBe("normal");
    expect(inbox.query.matches!(msg(["a", "i"]))).toBe(true);
    expect(inbox.query.matches!(msg(["i"]))).toBe(false);
    expect(inbox.presentation).toEqual({ currentLabelId: "a", senderMode: "from", canArchive: true, deleteForever: false, notSpam: false });
  });

  it("lists All Mail as everything outside Spam and Trash, not the archive mailbox", () => {
    const all = labelListView({ view: "all", mailboxId: "h" }, roles)!;
    expect(all.query.filter).toEqual({ inMailboxOtherThan: ["c", "b"] });
    expect(all.query.matches!(msg(["a"]))).toBe(true);
    expect(all.query.matches!(msg(["b"]))).toBe(false);
    expect(all.query.matches!(msg(["b", "i"]))).toBe(true);
  });

  it("lists All Mail even when the account has no archive mailbox yet", () => {
    expect(labelListView({ view: "all", mailboxId: undefined }, { inbox: "a", trash: "b", junk: "c" })!.query.filter).toEqual({
      inMailboxOtherThan: ["c", "b"],
    });
  });

  it("lists Starred as starred messages outside Spam and Trash", () => {
    const starred = labelListView({ view: "starred", mailboxId: undefined }, roles)!;
    expect(starred.query.filter).toEqual({ operator: "AND", conditions: [{ hasKeyword: "$flagged" }, { inMailboxOtherThan: ["c", "b"] }] });
    expect(starred.query.matches!(msg(["a"], ["$flagged"]))).toBe(true);
    expect(starred.query.matches!(msg(["a"]))).toBe(false);
    expect(starred.query.matches!(msg(["b"], ["$flagged"]))).toBe(false);
    expect(starred.presentation.currentLabelId).toBeUndefined();
  });

  it("shows only Trash's or Spam's messages there, with Delete forever and no Archive", () => {
    const trash = labelListView({ view: "trash", mailboxId: "b" }, roles)!;
    expect(trash.query.scope.kind).toBe("trash");
    expect(trash.presentation).toMatchObject({ canArchive: false, deleteForever: true, notSpam: false });
    const spam = labelListView({ view: "spam", mailboxId: "c" }, roles)!;
    expect(spam.query.scope.kind).toBe("spam");
    expect(spam.presentation).toMatchObject({ canArchive: false, deleteForever: true, notSpam: true });
  });

  it("names recipients in Sent and Drafts", () => {
    expect(labelListView({ view: "sent", mailboxId: "e" }, roles)!.presentation.senderMode).toBe("to");
    expect(labelListView({ view: "drafts", mailboxId: "d" }, roles)!.presentation.senderMode).toBe("to");
  });

  it("lists a user label by its mailbox, and nothing for a missing one", () => {
    expect(labelListView({ view: null, mailboxId: "i" }, roles)!.query.filter).toEqual({ inMailbox: "i" });
    expect(labelListView({ view: "sent", mailboxId: undefined }, roles)).toBeNull();
  });
});
