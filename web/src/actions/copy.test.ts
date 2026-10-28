// Brief 26: the toasts' tokens, and what they count.

import { describe, expect, it } from "vitest";
import { actionCopy, nounFor, rowNoun } from "./copy";
import { COPY } from "./runner";
import { NOT_SPAM_COPY, REPORT_SPAM_COPY } from "./spam";
import { snoozeCopy, UNSNOOZE_COPY } from "./snooze";
import { addedCopy, movedCopy } from "../labels/useLabelOps";

describe("actionCopy", () => {
  it("fills the count and the noun, singular and plural, conversation by default", () => {
    const copy = actionCopy("{Thing} archived.", "{n} {things} archived.", "Couldn't archive the {thing}.", "Couldn't archive {n} {Things}.");
    expect(copy.done(1)).toBe("Conversation archived.");
    expect(copy.done(2_500)).toBe(`${(2_500).toLocaleString()} conversations archived.`);
    expect(copy.done(1, "message")).toBe("Message archived.");
    expect(copy.done(3, "message")).toBe("3 messages archived.");
    expect(copy.failed(1, "message")).toBe("Couldn't archive the message.");
    expect(copy.failed(2, "message")).toBe("Couldn't archive 2 Messages.");
  });

  it("leaves copy without tokens as it is", () => {
    expect(actionCopy("Message moved to Trash.", "Messages moved to Trash.", "x", "y").done(1, "conversation")).toBe("Message moved to Trash.");
  });

  it("names the row", () => {
    expect(rowNoun(true)).toBe("conversation");
    expect(rowNoun(false)).toBe("message");
    expect(nounFor(1, "message")).toBe("message");
    expect(nounFor(0, "message")).toBe("messages");
    expect(nounFor(2)).toBe("conversations");
  });
});

describe("every toast says message with conversation view off", () => {
  it.each([
    ["archive", COPY.archive, "Message archived.", "2 messages archived."],
    ["trash", COPY.trash, "Message moved to Trash.", "2 messages moved to Trash."],
    ["delete forever", COPY.deleteForever, "Message deleted forever.", "2 messages deleted forever."],
    ["read", COPY.read, "Message marked as read.", "2 messages marked as read."],
    ["unread", COPY.unread, "Message marked as unread.", "2 messages marked as unread."],
    ["star", COPY.star, "Message starred.", "2 messages starred."],
    ["unstar", COPY.unstar, "Star removed.", "Stars removed from 2 messages."],
    ["important", COPY.important, "Message marked as important.", "2 messages marked as important."],
    ["report spam", REPORT_SPAM_COPY, "Message reported as spam. Your mail server learns from this.", "2 messages reported as spam. Your mail server learns from this."],
    ["not spam", NOT_SPAM_COPY, "Message marked as not spam and moved to Inbox. Your mail server learns from this.", "2 messages marked as not spam and moved to Inbox. Your mail server learns from this."],
    ["unsnooze", UNSNOOZE_COPY, "Message unsnoozed.", "2 messages unsnoozed."],
    ["move", movedCopy("Work"), 'Message moved to "Work".', '2 messages moved to "Work".'],
    ["label", addedCopy("Work"), 'Label "Work" added.', 'Label "Work" added to 2 messages.'],
  ])("%s", (_, copy, one, two) => {
    expect(copy.done(1, "message")).toBe(one);
    expect(copy.done(2, "message")).toBe(two);
    expect(copy.failed(2, "message")).toMatch(/2 messages/);
  });

  it("snooze, with its time", () => {
    const now = new Date(2026, 9, 28, 9, 0);
    expect(snoozeCopy(new Date(2026, 9, 28, 18, 0), now).done(2, "message")).toMatch(/^2 messages snoozed until /);
  });

  it("a label's name is never read as a token", () => {
    expect(movedCopy("{things}").done(2, "message")).toBe('2 messages moved to "{things}".');
  });
});
