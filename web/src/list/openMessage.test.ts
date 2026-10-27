// @vitest-environment jsdom
// Brief 22: opening a message row opens its conversation at that message,
// through the conversation's controller, once the conversation is on screen.

import { afterEach, describe, expect, it, vi } from "vitest";
import { messageCardId, setActiveConversation, type ConversationController } from "../conversation/registry";
import { cancelRevealMessage, revealMessageOnOpen } from "./openMessage";

const unsets: (() => void)[] = [];

afterEach(() => {
  cancelRevealMessage();
  for (const unset of unsets.splice(0)) unset();
  document.body.innerHTML = "";
});

/** A card in the DOM, as MessageCard renders it, whose scrollIntoView is recorded. */
function card(id: string, expanded: boolean): { el: HTMLElement; scrolled: ReturnType<typeof vi.fn> } {
  const el = document.createElement("article");
  el.id = messageCardId(id);
  el.dataset["expanded"] = String(expanded);
  const scrolled = vi.fn();
  el.scrollIntoView = scrolled;
  document.body.append(el);
  return { el, scrolled };
}

/** The conversation's controller; toggling a message opens its card, adding it if it was folded away. */
function conversation(conversationId: string, ids: string[]) {
  const scrolls = new Map<string, ReturnType<typeof vi.fn>>();
  const toggleMessage = vi.fn((id?: string) => {
    const el = document.getElementById(messageCardId(id!));
    if (el) el.dataset["expanded"] = el.dataset["expanded"] === "true" ? "false" : "true";
    else scrolls.set(id!, card(id!, true).scrolled);
  });
  const controller = { conversationId, messageIds: () => ids, toggleMessage } as unknown as ConversationController;
  return {
    controller,
    toggleMessage,
    mount: () => unsets.push(setActiveConversation(controller)),
    scrollOf: (id: string) => scrolls.get(id),
  };
}

describe("revealMessageOnOpen", () => {
  it("waits for the conversation to mount, then opens a collapsed message and scrolls to it", async () => {
    const { scrolled } = card("2", false);
    const other = conversation("OTHER", ["9"]);
    const conv = conversation("T1", ["1", "2", "3"]);
    revealMessageOnOpen("T1", "2");
    other.mount();
    expect(other.toggleMessage).not.toHaveBeenCalled();
    conv.mount();
    expect(conv.toggleMessage).toHaveBeenCalledWith("2");
    await vi.waitFor(() => expect(scrolled).toHaveBeenCalledWith({ block: "start" }));
  });

  it("leaves an open message open, and acts at once when the conversation is already on screen", async () => {
    const { scrolled } = card("3", true);
    const conv = conversation("T1", ["1", "2", "3"]);
    conv.mount();
    revealMessageOnOpen("T1", "3");
    expect(conv.toggleMessage).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(scrolled).toHaveBeenCalled());
  });

  it("unfolds a message folded among older ones", async () => {
    const conv = conversation("T1", ["1", "2", "3", "4", "5"]);
    revealMessageOnOpen("T1", "2");
    conv.mount();
    expect(conv.toggleMessage).toHaveBeenCalledWith("2");
    await vi.waitFor(() => expect(conv.scrollOf("2")).toHaveBeenCalled());
  });

  it("brings the message back when focus moves away a moment later (a reply draft), until the reader acts", async () => {
    const { scrolled } = card("3", true);
    const conv = conversation("T1", ["1", "2", "3"]);
    conv.mount();
    revealMessageOnOpen("T1", "3");
    await vi.waitFor(() => expect(scrolled).toHaveBeenCalledTimes(1));
    const draft = document.createElement("textarea");
    document.body.append(draft);
    draft.focus();
    await vi.waitFor(() => expect(scrolled).toHaveBeenCalledTimes(2));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    draft.blur();
    draft.focus();
    await new Promise((r) => setTimeout(r, 50));
    expect(scrolled).toHaveBeenCalledTimes(2);
  });

  it("does nothing for a message the conversation does not show as a card", () => {
    const conv = conversation("T1", ["1"]);
    revealMessageOnOpen("T1", "draft");
    conv.mount();
    expect(conv.toggleMessage).not.toHaveBeenCalled();
  });

  it("forgets an earlier request when another row opens", () => {
    const first = conversation("T1", ["1"]);
    const second = conversation("T2", ["2"]);
    card("1", false);
    card("2", false);
    revealMessageOnOpen("T1", "1");
    revealMessageOnOpen("T2", "2");
    first.mount();
    expect(first.toggleMessage).not.toHaveBeenCalled();
    second.mount();
    expect(second.toggleMessage).toHaveBeenCalledWith("2");
  });
});
