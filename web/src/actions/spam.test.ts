// "Delete all spam messages now" / "Empty Trash now" against the fake server,
// and the copy that says the server learns from Report spam.

import { describe, expect, it } from "vitest";
import { fakeEmail, FakeMail, MAILBOXES, ROLES } from "./fakeMail";
import type { Conversation } from "./conversation";
import { COPY, createMailActions } from "./runner";
import { emptyConfirmText, emptyDoneText, emptyLabel, listEmptyable, LEARNS, NOT_SPAM_COPY, REPORT_SPAM_COPY, REPORT_SPAM_MESSAGE_COPY } from "./spam";

function server() {
  return new FakeMail({
    mailboxes: MAILBOXES,
    emails: [
      fakeEmail({ id: "s1", threadId: "t1", mailboxIds: { c: true } }),
      fakeEmail({ id: "s2", threadId: "t2", mailboxIds: { c: true }, keywords: { $junk: true } }),
      // In Spam and a label: only taken out of Spam.
      fakeEmail({ id: "s3", threadId: "t3", mailboxIds: { c: true, i: true } }),
      fakeEmail({ id: "x1", threadId: "t4", mailboxIds: { b: true } }),
      fakeEmail({ id: "x2", threadId: "t5", mailboxIds: { b: true, c: true } }),
      fakeEmail({ id: "i1", threadId: "t6", mailboxIds: { a: true } }),
    ],
    maxObjectsInSet: 2,
  });
}

describe("emptying Spam and Trash", () => {
  it("deletes forever what is only in Spam (or Spam and Trash), and only takes the rest out", async () => {
    const mail = server();
    const client = await mail.connect();
    const plan = await listEmptyable(client, ROLES, "junk");
    expect(plan.destroy.sort()).toEqual(["s1", "s2", "x2"]);
    expect(plan.release).toEqual(["s3"]);
    const result = await emptyLabel(client, plan);
    expect(result).toEqual({ destroyed: 3, released: 1, failed: 0 });
    expect([...mail.emails.keys()].sort()).toEqual(["i1", "s3", "x1"]);
    expect(mail.emails.get("s3")!.mailboxIds).toEqual({ i: true });
  });

  it("empties Trash the same way and leaves the Inbox alone", async () => {
    const mail = server();
    const client = await mail.connect();
    const plan = await listEmptyable(client, ROLES, "trash");
    expect(plan.destroy.sort()).toEqual(["x1", "x2"]);
    await emptyLabel(client, plan);
    expect(mail.emails.has("i1")).toBe(true);
    expect(mail.emails.has("x1")).toBe(false);
  });

  it("pages through a large label", async () => {
    const emails = Array.from({ length: 1203 }, (_, i) => fakeEmail({ id: `j${i}`, threadId: `t${i}`, mailboxIds: { c: true } }));
    const mail = new FakeMail({ mailboxes: MAILBOXES, emails, maxObjectsInGet: 2000, maxObjectsInSet: 5000 });
    const client = await mail.connect();
    const plan = await listEmptyable(client, ROLES, "junk");
    expect(plan.destroy).toHaveLength(1203);
    expect((await emptyLabel(client, plan)).destroyed).toBe(1203);
    expect(mail.emails.size).toBe(0);
  });

  it("keeps paging when the server returns fewer ids than asked", async () => {
    const all = ["a", "b", "c", "d", "e", "f", "g"];
    const calls: number[] = [];
    const caller = {
      call: async (name: string, args: { position?: number; ids?: string[] }) => {
        if (name === "Email/query") {
          calls.push(args.position ?? 0);
          const at = args.position ?? 0;
          return { ids: all.slice(at, at + 3), total: all.length };
        }
        return { list: (args.ids ?? []).map((id) => ({ id, mailboxIds: { c: true } })) };
      },
    } as unknown as Parameters<typeof listEmptyable>[0];
    const plan = await listEmptyable(caller, ROLES, "junk");
    expect(plan.destroy).toEqual(all);
    expect(calls).toEqual([0, 3, 6]);
  });

  it("does nothing for an empty label", async () => {
    const mail = new FakeMail({ mailboxes: MAILBOXES, emails: [] });
    const client = await mail.connect();
    const plan = await listEmptyable(client, ROLES, "junk");
    expect(plan).toMatchObject({ destroy: [], release: [] });
    expect(await emptyLabel(client, plan)).toEqual({ destroyed: 0, released: 0, failed: 0 });
  });

  it("says what will happen and what happened", () => {
    const text = emptyConfirmText({ label: "junk", mailboxId: "c", destroy: ["a", "b"], release: ["c"] });
    expect(text.title).toBe("Delete all spam messages?");
    expect(text.body).toBe("2 messages in Spam will be deleted forever. You can't undo this. One message that also has another label will only be taken out of Spam.");
    expect(emptyConfirmText({ label: "trash", mailboxId: "b", destroy: ["a"], release: [] }).confirm).toBe("Empty Trash");
    expect(emptyDoneText("trash", { destroyed: 1, released: 0, failed: 0 })).toBe("1 message deleted forever.");
    expect(emptyDoneText("junk", { destroyed: 1, released: 0, failed: 2 })).toBe("Couldn't empty Spam: 2 messages were left.");
  });
});

describe("Report spam copy", () => {
  it("says the server learns, because Stalwart 0.16.25 trains on it", () => {
    expect(REPORT_SPAM_COPY.done(1)).toBe(`Conversation reported as spam. ${LEARNS}`);
    expect(REPORT_SPAM_COPY.done(3)).toBe(`3 conversations reported as spam. ${LEARNS}`);
    expect(REPORT_SPAM_MESSAGE_COPY.done(1)).toContain(LEARNS);
    expect(NOT_SPAM_COPY.done(2)).toBe(`2 conversations marked as not spam and moved to Inbox. ${LEARNS}`);
    expect(REPORT_SPAM_COPY.failed(2)).toBe("Couldn't report 2 conversations as spam.");
  });

  it("is what every Report spam / Not spam toast says, the list's included", async () => {
    expect(COPY.reportSpam).toBe(REPORT_SPAM_COPY);
    expect(COPY.notSpam).toBe(NOT_SPAM_COPY);
    const mail = new FakeMail({ mailboxes: MAILBOXES, emails: [fakeEmail({ id: "m1", threadId: "t1" })] });
    const client = await mail.connect();
    const toasts: string[] = [];
    const actions = createMailActions({
      caller: client,
      roles: () => ROLES,
      ensureAllMail: async () => "h",
      syncLabels: () => {},
      toast: { show: (o) => toasts.push(o.message) },
    });
    const conversation: Conversation = { id: "t1", messages: [{ id: "m1", threadId: "t1", receivedAt: "2026-10-01T12:00:00Z", mailboxIds: { a: true }, keywords: {} }] };
    expect(await actions.reportSpam([conversation], { kind: "normal", roles: ROLES })).toBe("done");
    expect(toasts.at(-1)).toBe(`Conversation reported as spam. ${LEARNS}`);
    expect(mail.emails.get("m1")!.mailboxIds).toEqual({ c: true });
  });
});
