import { describe, expect, it } from "vitest";
import type { Conversation, ConversationMessage, ConversationScope } from "./conversation";
import { isStarred, isUnread, shownMessages } from "./conversation";
import { applyPatch } from "./patches";
import { archiveNeedsAllMail, destroyIds, MissingLabelError, planArchive, planLabels, planMove, planRead, planStar, planTrash } from "./plans";
import { planNotSpam, planReportSpam } from "./spam";

const roles = { inbox: "a", trash: "b", junk: "c", sent: "e", archive: "h" };
const normal: ConversationScope = { kind: "normal", roles };
const trashScope: ConversationScope = { kind: "trash", roles };
const spamScope: ConversationScope = { kind: "spam", roles };

let clock = 0;
function m(id: string, mailboxIds: string[], keywords: string[] = [], receivedAt?: string): ConversationMessage {
  clock++;
  return {
    id,
    threadId: "T",
    receivedAt: receivedAt ?? `2026-10-0${Math.min(9, clock)}T00:00:00Z`,
    mailboxIds: Object.fromEntries(mailboxIds.map((x) => [x, true as const])),
    keywords: Object.fromEntries(keywords.map((k) => [k, true as const])),
  };
}
const conv = (id: string, ...messages: ConversationMessage[]): Conversation => ({ id, messages });

/** Apply a plan to conversations, as the server would. */
function after(conversations: Conversation[], update: Record<string, Record<string, unknown>>): Conversation[] {
  return conversations.map((c) => ({ ...c, messages: c.messages.map((x) => (update[x.id] ? applyPatch(x, update[x.id]!) : x)) }));
}

describe("archive", () => {
  it("takes every Inbox message out of the Inbox; one with no other label goes to All Mail", () => {
    const c = conv("T", m("1", ["a"]), m("2", ["e"]), m("3", ["a", "i"]));
    const plan = planArchive([c], normal);
    expect(plan.update).toEqual({
      "1": { "mailboxIds/a": null, "mailboxIds/h": true },
      "3": { "mailboxIds/a": null },
    });
    const [archived] = after([c], plan.update);
    expect(archived!.messages.map((x) => Object.keys(x.mailboxIds))).toEqual([["h"], ["e"], ["i"]]);
  });

  it("keeps a conversation's other label (Work) and lands a label-less one in All Mail", () => {
    const work = conv("W", m("1", ["a", "i"]));
    const plain = conv("P", m("2", ["a"]));
    const plan = planArchive([work, plain], normal);
    const [w, p] = after([work, plain], plan.update);
    expect(w!.messages[0]!.mailboxIds).toEqual({ i: true });
    expect(p!.messages[0]!.mailboxIds).toEqual({ h: true });
    expect(plan.conversationIds).toEqual(["W", "P"]);
  });

  it("undoes exactly", () => {
    const c = conv("T", m("1", ["a"], ["$seen"]), m("2", ["a", "i"]));
    const plan = planArchive([c], normal);
    expect(after(after([c], plan.update), plan.inverse)).toEqual([c]);
  });

  it("does nothing to a conversation not in the Inbox", () => {
    expect(planArchive([conv("T", m("1", ["i"]))], normal).update).toEqual({});
  });

  it("asks for All Mail only when a message would be left in no label", () => {
    const noAllMail = { kind: "normal" as const, roles: { ...roles, archive: undefined } };
    expect(archiveNeedsAllMail([conv("T", m("1", ["a", "i"]))], noAllMail)).toBe(false);
    expect(archiveNeedsAllMail([conv("T", m("1", ["a"]))], noAllMail)).toBe(true);
    expect(() => planArchive([conv("T", m("1", ["a"]))], noAllMail)).toThrow(MissingLabelError);
    expect(planArchive([conv("T", m("1", ["a", "i"]))], noAllMail).update).toEqual({ "1": { "mailboxIds/a": null } });
  });

  it("leaves trashed messages of the conversation alone", () => {
    const c = conv("T", m("1", ["a"]), m("2", ["b"]));
    expect(Object.keys(planArchive([c], normal).update)).toEqual(["1"]);
  });
});

describe("trash", () => {
  it("moves every message shown out of all its labels into Trash, and back on undo", () => {
    const c = conv("T", m("1", ["a", "i"], ["$flagged"]), m("2", ["e"]), m("3", ["c"]));
    const plan = planTrash([c], normal);
    const [trashed] = after([c], plan.update);
    expect(trashed!.messages.map((x) => Object.keys(x.mailboxIds))).toEqual([["b"], ["b"], ["c"]]);
    expect(after([trashed!], plan.inverse)).toEqual([c]);
  });

  it("delete forever in Trash destroys only what is in Trash", () => {
    const c = conv("T", m("1", ["a"]), m("2", ["b"]), m("3", ["b"]));
    expect(destroyIds([c], trashScope)).toEqual(["2", "3"]);
    expect(destroyIds([conv("S", m("4", ["c"]), m("5", ["a"]))], spamScope)).toEqual(["4"]);
  });
});

describe("star", () => {
  it("stars the latest message shown", () => {
    const c = conv("T", m("1", ["a"], [], "2026-10-01T00:00:00Z"), m("2", ["e"], [], "2026-10-03T00:00:00Z"), m("3", ["b"], [], "2026-10-05T00:00:00Z"));
    expect(planStar([c], normal, true).update).toEqual({ "2": { "keywords/$flagged": true } });
  });

  it("leaves a starred conversation alone, and unstar clears every star shown", () => {
    const c = conv("T", m("1", ["a"], ["$flagged"]), m("2", ["a"]), m("3", ["i"], ["$flagged"]));
    expect(planStar([c], normal, true).update).toEqual({});
    expect(planStar([c], normal, false).update).toEqual({ "1": { "keywords/$flagged": null }, "3": { "keywords/$flagged": null } });
    expect(isStarred(after([c], planStar([c], normal, false).update)[0]!, normal)).toBe(false);
  });
});

describe("read and unread", () => {
  it("marks every message shown, and the conversation reads as read", () => {
    const c = conv("T", m("1", ["a"]), m("2", ["e"], ["$seen"]), m("3", ["b"]));
    const plan = planRead([c], normal, true);
    expect(Object.keys(plan.update)).toEqual(["1"]);
    expect(isUnread(after([c], plan.update)[0]!, normal)).toBe(false);
    // The trashed message is not part of the conversation outside Trash.
    expect(isUnread(c, trashScope)).toBe(true);
    expect(Object.keys(planRead([c], normal, false).update)).toEqual(["2"]);
  });
});

describe("labels and move (brief 09)", () => {
  it("adds and removes labels, sending a message with none left to All Mail", () => {
    const c = conv("T", m("1", ["i"]), m("2", ["a", "i"]));
    const plan = planLabels([c], normal, { add: ["x"], remove: ["i"] });
    expect(plan.update).toEqual({ "1": { "mailboxIds/x": true, "mailboxIds/i": null }, "2": { "mailboxIds/x": true, "mailboxIds/i": null } });
    const removeOnly = planLabels([c], normal, { remove: ["i"] });
    expect(removeOnly.update["1"]).toEqual({ "mailboxIds/i": null, "mailboxIds/h": true });
    expect(after(after([c], removeOnly.update), removeOnly.inverse)).toEqual([c]);
  });

  it("moves out of the label viewed into another", () => {
    const c = conv("T", m("1", ["a", "i"]));
    expect(planMove([c], normal, "a", "x").update).toEqual({ "1": { "mailboxIds/x": true, "mailboxIds/a": null } });
    expect(planMove([c], normal, undefined, "x").update).toEqual({ "1": { "mailboxIds/x": true } });
    expect(planMove([c], normal, "a", "b").update).toEqual({ "1": { "mailboxIds/b": true, "mailboxIds/a": null, "mailboxIds/i": null } });
  });

  it("moves out of Trash keeping nothing of Trash", () => {
    const c = conv("T", m("1", ["b"]));
    expect(planMove([c], trashScope, "b", "a").update).toEqual({ "1": { "mailboxIds/a": true, "mailboxIds/b": null } });
  });
});

describe("spam", () => {
  it("report spam moves every message shown to Spam with $junk, and undoes exactly", () => {
    const c = conv("T", m("1", ["a", "i"], ["$notjunk"]));
    const plan = planReportSpam([c], normal);
    expect(plan.update["1"]).toEqual({ "mailboxIds/c": true, "mailboxIds/a": null, "mailboxIds/i": null, "keywords/$junk": true, "keywords/$notjunk": null });
    expect(after(after([c], plan.update), plan.inverse)).toEqual([c]);
  });

  it("not spam moves what is in Spam to the Inbox with $notjunk", () => {
    const c = conv("T", m("1", ["c"], ["$junk"]), m("2", ["e"]));
    const plan = planNotSpam([c], spamScope);
    expect(plan.update).toEqual({ "1": { "mailboxIds/c": null, "mailboxIds/a": true, "keywords/$junk": null, "keywords/$notjunk": true } });
  });
});

describe("the conversation as shown", () => {
  it("is everything but Trash and Spam, or only those in Trash and Spam", () => {
    const c = conv("T", m("1", ["a"]), m("2", ["b"]), m("3", ["c"]), m("4", ["b", "i"]));
    expect(shownMessages(c, normal).map((x) => x.id)).toEqual(["1", "4"]);
    expect(shownMessages(c, trashScope).map((x) => x.id)).toEqual(["2", "4"]);
    expect(shownMessages(c, spamScope).map((x) => x.id)).toEqual(["3"]);
  });

  it("falls back to every message when none fits (a search hit in Trash)", () => {
    const c = conv("T", m("1", ["b"]));
    expect(shownMessages(c, normal).map((x) => x.id)).toEqual(["1"]);
  });
});

describe("a reply draft in the conversation (brief 08 review)", () => {
  // Drafts is "d": a reply being written sits there with $draft, next to the messages it answers.
  const withDrafts = { ...roles, drafts: "d" };
  const scope: ConversationScope = { kind: "normal", roles: withDrafts };
  const thread = () => conv("T", m("1", ["a"]), m("2", ["a", "i"]), m("draft", ["d"], ["$draft", "$seen"]));

  it("delete moves the messages to Trash and leaves the open reply draft in Drafts", () => {
    const plan = planTrash([thread()], scope);
    expect(Object.keys(plan.update).sort()).toEqual(["1", "2"]);
    const [after1] = after([thread()], plan.update);
    expect(after1!.messages.find((x) => x.id === "draft")!.mailboxIds).toEqual({ d: true });
  });

  it("report spam, move and archive leave it too", () => {
    expect(Object.keys(planReportSpam([thread()], scope).update).sort()).toEqual(["1", "2"]);
    expect(Object.keys(planMove([thread()], scope, "a", "i").update).sort()).toEqual(["1", "2"]);
    expect(Object.keys(planMove([thread()], scope, undefined, "b").update).sort()).toEqual(["1", "2"]);
    const archive = conv("T", m("1", ["a"]), m("draft", ["d", "a"], ["$draft"]));
    expect(Object.keys(planArchive([archive], scope).update)).toEqual(["1"]);
  });

  it("acts on a conversation that is nothing but drafts", () => {
    const only = conv("D", m("draft", ["d"], ["$draft"]));
    expect(planTrash([only], scope).update).toEqual({ draft: { "mailboxIds/d": null, "mailboxIds/b": true } });
    expect(Object.keys(planReportSpam([only], scope).update)).toEqual(["draft"]);
  });

  it("acts on a $draft message that is not in Drafts, and on a Drafts message without $draft", () => {
    const odd = conv("T", m("1", ["a"]), m("2", ["i"], ["$draft"]), m("3", ["d"]));
    expect(Object.keys(planTrash([odd], scope).update).sort()).toEqual(["1", "2", "3"]);
  });

  it("still marks it read and stars as before (only moves skip it)", () => {
    const c = conv("T", m("1", ["a"]), m("draft", ["d"], ["$draft"]));
    expect(Object.keys(planRead([c], scope, true).update).sort()).toEqual(["1", "draft"]);
  });

  it("undoes exactly", () => {
    const c = thread();
    const plan = planTrash([c], scope);
    expect(after(after([c], plan.update), plan.inverse)).toEqual([c]);
  });
});
