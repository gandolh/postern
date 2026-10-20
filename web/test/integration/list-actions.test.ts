// Brief 06 against the dev Stalwart: the list loads alice's Inbox page by
// page, archive takes a conversation out of the Inbox (keeping its other
// label, or landing in All Mail), and undo puts every message back exactly.
// The account is left as dev/seed/manifest.json says; anything a failed test
// changed is put back in afterAll.

import { JmapClient, type Id, type Mailbox, type PatchObject } from "@postern/jmap";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, basicAuth, live, manifest } from "../../../jmap/test/integration/live";
import { ensureAllMail } from "../../src/actions/allMail";
import { subscribeMailChanges } from "../../src/actions/bus";
import { ROLE_NAMES, type MailboxRoles } from "../../src/actions/conversation";
import { createMailActions } from "../../src/actions/runner";
import { clearUndo, undoLast } from "../../src/actions/undo";
import { ListStore } from "../../src/list/listStore";
import type { ConversationRow } from "../../src/list/types";
import { labelListView } from "../../src/list/view";

type State = Record<Id, { mailboxIds: Record<Id, true>; keywords: Record<string, true> }>;

describe.skipIf(!live)("against the dev Stalwart: the list and archive", () => {
  let client: JmapClient;
  let roles: MailboxRoles;
  let work: Id;
  let store: ListStore;
  const touched = new Set<Id>();
  let before: State = {};
  const toasts: string[] = [];

  async function stateOf(ids: Iterable<Id>): Promise<State> {
    const list = [...ids];
    if (list.length === 0) return {};
    const res = await client.call("Email/get", { ids: list, properties: ["mailboxIds", "keywords"] });
    return Object.fromEntries(res.list.map((e) => [e.id, { mailboxIds: e.mailboxIds, keywords: e.keywords }]));
  }

  async function inboxThreads(): Promise<number> {
    const res = await client.call("Mailbox/get", { ids: [roles.inbox as Id], properties: ["totalThreads"] });
    return (res.list[0] as Mailbox).totalThreads;
  }

  beforeAll(async () => {
    client = new JmapClient({ baseUrl: BASE, auth: basicAuth("alice") });
    await client.connect();
    const mailboxes = (await client.call("Mailbox/get", { ids: null })).list;
    roles = {};
    for (const role of ROLE_NAMES) {
      const m = mailboxes.find((x) => x.role === role);
      if (m) roles[role] = m.id;
    }
    work = mailboxes.find((m) => m.name === "Work" && m.parentId === null)!.id;
    expect(await inboxThreads()).toBe(manifest.accounts.alice.labels["inbox"]!.threads);
    clearUndo();
  });

  afterAll(async () => {
    store?.dispose();
    // Put back anything a failed test left changed, then check the Inbox is whole.
    const now = await stateOf(touched);
    const update: Record<Id, PatchObject> = {};
    for (const [id, was] of Object.entries(before)) {
      const is = now[id];
      if (is && JSON.stringify(is) !== JSON.stringify(was)) update[id] = { mailboxIds: was.mailboxIds, keywords: was.keywords };
    }
    if (Object.keys(update).length) await client.call("Email/set", { update });
    expect(await inboxThreads()).toBe(manifest.accounts.alice.labels["inbox"]!.threads);
  });

  it("loads the Inbox's first page in one request, and the next page in one more", async () => {
    const view = labelListView({ view: "inbox", mailboxId: roles.inbox }, roles)!;
    store = new ListStore(client, view.query, { accountId: () => client.accountId });
    store.start();
    await expect.poll(() => store.getSnapshot().rows.length, { timeout: 10_000 }).toBe(50);
    expect(store.getSnapshot().total).toBe(manifest.accounts.alice.labels["inbox"]!.threads);
    store.ensureLoaded(60);
    await expect.poll(() => store.getSnapshot().rows.length, { timeout: 10_000 }).toBe(100);
    const ids = store.getSnapshot().rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(100);
  });

  it("archives a plain conversation to All Mail and a labelled one keeping its label, and undo restores both exactly", async () => {
    const rows = store.getSnapshot().rows;
    const plain = rows.find((r) => r.messages.every((m) => Object.keys(m.mailboxIds).join() === roles.inbox));
    const labelled = rows.find((r) => r.messages.some((m) => m.mailboxIds[roles.inbox!] && m.mailboxIds[work]));
    expect(plain, "an Inbox-only conversation on the first page").toBeDefined();
    expect(labelled, "an Inbox + Work conversation on the first page").toBeDefined();
    const targets = [plain, labelled] as ConversationRow[];
    for (const r of targets) for (const m of r.messages) touched.add(m.id);
    before = await stateOf(touched);

    const labels = { mailboxIdForRole: () => roles.archive, sync: async () => {} };
    const actions = createMailActions({
      caller: client,
      roles: () => roles,
      ensureAllMail: () => ensureAllMail(client, labels),
      syncLabels: () => {},
      toast: { show: (t) => void toasts.push(t.message) },
    });
    const seen: string[] = [];
    const stop = subscribeMailChanges((c) => seen.push(c.kind));
    try {
      expect(await actions.archive(targets, labelListView({ view: "inbox", mailboxId: roles.inbox }, roles)!.query.scope)).toBe("done");
    } finally {
      stop();
    }
    expect(seen).toEqual(["patch", "settled"]);
    expect(toasts).toEqual(["2 conversations archived."]);

    const after = await stateOf(touched);
    for (const m of plain!.messages) expect(after[m.id]!.mailboxIds).toEqual({ [roles.archive!]: true });
    for (const m of labelled!.messages) {
      expect(after[m.id]!.mailboxIds[roles.inbox!]).toBeUndefined();
      if (before[m.id]!.mailboxIds[work]) expect(after[m.id]!.mailboxIds[work]).toBe(true);
    }
    expect(await inboxThreads()).toBe(manifest.accounts.alice.labels["inbox"]!.threads - 2);

    // The list catches up with the server: both rows gone, two fewer conversations.
    await store.refresh();
    expect(store.getSnapshot().rows.some((r) => r.id === plain!.id || r.id === labelled!.id)).toBe(false);
    expect(store.getSnapshot().total).toBe(manifest.accounts.alice.labels["inbox"]!.threads - 2);

    expect(await undoLast()).toBe(true);
    expect(toasts.at(-1)).toBe("Action undone.");
    expect(await stateOf(touched)).toEqual(before);
    expect(await inboxThreads()).toBe(manifest.accounts.alice.labels["inbox"]!.threads);

    await store.refresh();
    const back = store.getSnapshot().rows.map((r) => r.id);
    expect(back).toContain(plain!.id);
    expect(back).toContain(labelled!.id);
    expect(store.getSnapshot().total).toBe(manifest.accounts.alice.labels["inbox"]!.threads);
  });
});
