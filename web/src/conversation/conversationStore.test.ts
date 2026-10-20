// The open conversation's store over the fake JMAP server: a refresh never
// wipes an optimistic patch whose write is still out (the star does not
// flicker off and on), and nothing sticks once the write has settled.

import { afterEach, describe, expect, it } from "vitest";
import { publishMailChange, publishPending } from "../actions/bus";
import { fakeEmail, FakeMail, MAILBOXES } from "../actions/fakeMail";
import { ConversationStore } from "./conversationStore";

const STAR = { "keywords/$flagged": true } as const;
const UNSTAR = { "keywords/$flagged": null } as const;

let store: ConversationStore | null = null;

async function open() {
  const mail = new FakeMail({
    mailboxes: MAILBOXES,
    emails: [fakeEmail({ id: "e1", threadId: "T1", keywords: { $seen: true } }), fakeEmail({ id: "e2", threadId: "T1", keywords: { $seen: true }, receivedAt: "2026-10-09T00:00:00Z" })],
  });
  const client = await mail.connect();
  const s = new ConversationStore(client, "T1");
  store = s;
  s.activate();
  await s.refresh();
  const starred = (id: string) => s.getSnapshot().messages.find((m) => m.id === id)?.keywords["$flagged"] === true;
  return { mail, store: s, starred };
}

afterEach(() => {
  store?.dispose();
  store = null;
});

describe("optimistic patches over a refresh", () => {
  it("keeps a star whose write is still out, through a refresh that answers without it", async () => {
    const { mail, store, starred } = await open();
    const answered = publishPending({ e1: STAR });
    expect(starred("e1")).toBe(true);

    // Another action's "settled" (or a push) refreshes while the star is on the wire.
    await store.refresh();
    expect(starred("e1")).toBe(true);

    // The write lands and settles: the server's copy has it.
    mail.mutate((emails) => {
      emails.get("e1")!.keywords["$flagged"] = true;
      return { updated: ["e1"] };
    });
    answered();
    await store.refresh();
    expect(starred("e1")).toBe(true);

    // Nothing sticks: another device takes the star off later, and it goes.
    mail.mutate((emails) => {
      delete emails.get("e1")!.keywords["$flagged"];
      return { updated: ["e1"] };
    });
    await store.refresh();
    expect(starred("e1")).toBe(false);
  });

  it("keeps a patch published while a refresh's request is out", async () => {
    const { store, starred } = await open();
    const refreshing = store.refresh();
    const answered = publishPending({ e2: STAR });
    await refreshing;
    expect(starred("e2")).toBe(true);
    answered();
  });

  it("a write that fails while a refresh is out ends with the rollback", async () => {
    const { store, starred } = await open();
    const answered = publishPending({ e1: STAR });
    const refreshing = store.refresh();
    // The server refuses: release it, then publish the inverse, as the runner does.
    answered();
    publishMailChange({ kind: "patch", update: { e1: UNSTAR } });
    await refreshing;
    expect(starred("e1")).toBe(false);
  });
});
