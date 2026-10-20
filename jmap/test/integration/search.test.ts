// Read-only: the filter parseSearch builds returns what Email/query returns
// for the same filter written by hand, and Stalwart honours every condition
// the parser emits.

import { beforeAll, describe, expect, it } from "vitest";
import { createLabelResolver, findByRole, JmapClient, mailboxPath, parseSearch, type EmailFilter, type Mailbox } from "../../src/index.js";
import { devClient, live } from "./live.js";

describe.skipIf(!live)("against the dev Stalwart: search", () => {
  let alice: JmapClient;
  let mailboxes: Mailbox[];
  let junk: string;
  let trash: string;
  let work: string;
  const now = new Date("2026-10-20T12:00:00Z");

  const parse = (q: string) =>
    parseSearch(q, {
      now,
      labels: createLabelResolver(mailboxes.filter((m) => !m.role).map((m) => ({ id: m.id, path: mailboxPath(m, mailboxes) }))),
      roles: {
        inbox: findByRole(mailboxes, "inbox")?.id,
        sent: findByRole(mailboxes, "sent")?.id,
        drafts: findByRole(mailboxes, "drafts")?.id,
        junk,
        trash,
        archive: findByRole(mailboxes, "archive")?.id,
      },
    });

  async function ids(filter: EmailFilter | null): Promise<string[]> {
    const r = await alice.email.query({ filter, collapseThreads: true, limit: 500, sort: [{ property: "receivedAt", isAscending: false }, { property: "size", isAscending: true }] });
    return r.ids;
  }

  beforeAll(async () => {
    alice = devClient("alice");
    await alice.connect();
    mailboxes = await alice.mailbox.all();
    junk = findByRole(mailboxes, "junk")!.id;
    trash = findByRole(mailboxes, "trash")!.id;
    work = mailboxes.find((m) => m.name === "Work" && !m.parentId)!.id;
  });

  it("from:bob has:attachment equals the hand-built filter", async () => {
    const hand: EmailFilter = { operator: "AND", conditions: [{ from: "bob" }, { hasAttachment: true }, { inMailboxOtherThan: [junk, trash] }] };
    const parsed = parse("from:bob has:attachment");
    expect(parsed.warnings).toEqual([]);
    expect(parsed.filter).toEqual(hand);
    const expected = await ids(hand);
    expect(expected.length).toBeGreaterThan(0);
    expect(await ids(parsed.filter)).toEqual(expected);
  });

  it("is:unread label:Work equals the hand-built filter", async () => {
    const hand: EmailFilter = { operator: "AND", conditions: [{ notKeyword: "$seen" }, { inMailbox: work }, { inMailboxOtherThan: [junk, trash] }] };
    const parsed = parse("is:unread label:work");
    expect(parsed.warnings).toEqual([]);
    expect(parsed.filter).toEqual(hand);
    const expected = await ids(hand);
    expect(expected.length).toBeGreaterThan(0);
    expect(await ids(parsed.filter)).toEqual(expected);
  });

  it("the default scope leaves out Spam and Trash; in:anywhere and in:trash bring them back", async () => {
    const everywhere = await alice.email.query({ filter: parse("in:anywhere").filter, calculateTotal: true, limit: 1 });
    const scoped = await alice.email.query({ filter: parse("").filter, calculateTotal: true, limit: 1 });
    const inTrash = await alice.email.query({ filter: parse("in:trash").filter, calculateTotal: true, limit: 1 });
    expect(everywhere.total).toBeGreaterThan(scoped.total!);
    expect(inTrash.total).toBeGreaterThan(0);
  });

  it("honours OR, NOT, text, sizes, dates and the address conditions", async () => {
    const total = async (q: string) => (await alice.email.query({ filter: parse(`${q} in:anywhere`).filter, calculateTotal: true, limit: 1 })).total!;
    const bob = await total("from:bob");
    const toBob = await total("to:bob");
    const either = await total("from:bob OR to:bob");
    expect(either).toBeGreaterThanOrEqual(Math.max(bob, toBob));
    expect(either).toBeLessThanOrEqual(bob + toBob);
    expect(await total("-from:bob")).toBe((await total("")) - bob);
    expect(await total("roadmap")).toBeGreaterThan(0);
    expect(await total("{from:bob to:bob}")).toBe(either);
    expect(await total("cc:carol")).toBeGreaterThan(0);
    expect(await total("larger:100K")).toBeGreaterThan(0);
    expect(await total("smaller:100K")).toBeGreaterThan(0);
    expect((await total("after:2025/06/01")) + (await total("before:2025/06/01"))).toBe(await total(""));
    expect(await total("nonexistentlabel label:nope")).toBe(0);
  });
});
