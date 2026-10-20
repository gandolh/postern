import type { MethodCaller } from "@postern/jmap";
import { describe, expect, it, vi } from "vitest";
import type { LabelShape } from "../actions/labels";
import { createLabel, deleteLabel, LabelEditError, nestLabel, renameLabel, setLabelSubscribed, type LabelEditDeps } from "./labelEdits";

type Args = Record<string, unknown>;

/** A tiny in-memory server for the calls label edits make, recording what it was sent. */
function makeServer(initial: { labels: LabelShape[]; emails: Record<string, string[]> }) {
  const labels = initial.labels.map((l) => ({ ...l }));
  const emails = new Map(Object.entries(initial.emails).map(([id, boxes]) => [id, new Set(boxes)]));
  const sent: [string, Args][] = [];
  let nextId = 1;
  const caller = {
    async call(name: string, args: Args) {
      sent.push([name, structuredClone(args)]);
      switch (name) {
        case "Mailbox/get":
          return { list: labels.map((l) => ({ ...l })) };
        case "Mailbox/set": {
          const create = (args["create"] as Record<string, Partial<LabelShape>> | undefined) ?? {};
          const created: Record<string, { id: string }> = {};
          for (const [key, m] of Object.entries(create)) {
            const id = `n${nextId++}`;
            labels.push({ id, name: m.name ?? "", parentId: m.parentId ?? null, role: m.role ?? null });
            created[key] = { id };
          }
          for (const [id, patch] of Object.entries((args["update"] as Record<string, Partial<LabelShape>> | undefined) ?? {})) {
            Object.assign(labels.find((l) => l.id === id)!, patch);
          }
          const notDestroyed: Record<string, { type: string }> = {};
          const destroyed: string[] = [];
          for (const id of (args["destroy"] as string[] | undefined) ?? []) {
            if (labels.some((l) => l.parentId === id)) notDestroyed[id] = { type: "mailboxHasChild" };
            else if ([...emails.values()].some((boxes) => boxes.has(id))) notDestroyed[id] = { type: "mailboxHasEmail" };
            else {
              labels.splice(labels.findIndex((l) => l.id === id), 1);
              destroyed.push(id);
            }
          }
          return { created, destroyed, notDestroyed: Object.keys(notDestroyed).length ? notDestroyed : undefined };
        }
        case "Email/query": {
          const mailbox = (args["filter"] as { inMailbox: string }).inMailbox;
          const ids = [...emails].filter(([, boxes]) => boxes.has(mailbox)).map(([id]) => id);
          return { ids, total: ids.length };
        }
        case "Email/get":
          return { list: (args["ids"] as string[]).map((id) => ({ id, mailboxIds: Object.fromEntries([...emails.get(id)!].map((b) => [b, true])) })) };
        case "Email/set": {
          for (const [id, patch] of Object.entries(args["update"] as Record<string, Record<string, true | null>>)) {
            for (const [path, value] of Object.entries(patch)) {
              const box = path.replace("mailboxIds/", "");
              if (value === null) emails.get(id)!.delete(box);
              else emails.get(id)!.add(box);
            }
            if (emails.get(id)!.size === 0) throw new Error("a message would be left in no mailbox");
          }
          return {};
        }
      }
      throw new Error(`unexpected ${name}`);
    },
  };
  const sync = vi.fn(async () => {});
  const deps: LabelEditDeps = {
    caller: caller as unknown as MethodCaller,
    labels: {
      mailboxIdForRole: (role) => labels.find((l) => l.role === role)?.id,
      sync,
      getSnapshot: () => ({ labels: labels.map((l) => ({ ...l })) }),
    },
  };
  return { deps, labels, emails, sent, sync };
}

const base: LabelShape[] = [
  { id: "a", name: "Inbox", parentId: null, role: "inbox" },
  { id: "h", name: "Archive", parentId: null, role: "archive" },
  { id: "w", name: "Work", parentId: null, role: null },
  { id: "c", name: "Clients", parentId: "w", role: null },
  { id: "r", name: "Receipts", parentId: null, role: null },
];

describe("create, rename, nest, subscribe", () => {
  it("creates a label, trimmed, and syncs", async () => {
    const s = makeServer({ labels: base, emails: {} });
    const id = await createLabel(s.deps, "  Travel  ", "w");
    expect(s.labels.find((l) => l.id === id)).toMatchObject({ name: "Travel", parentId: "w" });
    expect(s.sync).toHaveBeenCalled();
  });

  it("refuses a bad name or a system parent before sending anything", async () => {
    const s = makeServer({ labels: base, emails: {} });
    await expect(createLabel(s.deps, "a/b")).rejects.toBeInstanceOf(LabelEditError);
    await expect(createLabel(s.deps, "Work")).rejects.toThrow(/already exists/);
    await expect(createLabel(s.deps, "X", "a")).rejects.toThrow(/nested under other labels/);
    expect(s.sent).toEqual([]);
  });

  it("renames user labels only", async () => {
    const s = makeServer({ labels: base, emails: {} });
    await renameLabel(s.deps, "r", "Bills");
    expect(s.labels.find((l) => l.id === "r")!.name).toBe("Bills");
    await expect(renameLabel(s.deps, "a", "Mail")).rejects.toThrow(/System labels/);
    await expect(renameLabel(s.deps, "r", "Work")).rejects.toThrow(/already exists/);
  });

  it("nests under another label, but never inside itself", async () => {
    const s = makeServer({ labels: base, emails: {} });
    await nestLabel(s.deps, "r", "w");
    expect(s.labels.find((l) => l.id === "r")!.parentId).toBe("w");
    await expect(nestLabel(s.deps, "w", "c")).rejects.toThrow(/inside itself/);
  });

  it("hides and shows through isSubscribed, user labels only", async () => {
    const s = makeServer({ labels: base, emails: {} });
    await setLabelSubscribed(s.deps, "r", false);
    expect(s.sent.at(-1)![1]).toEqual({ update: { r: { isSubscribed: false } } });
    await expect(setLabelSubscribed(s.deps, "a", false)).rejects.toThrow(/System labels/);
  });
});

describe("deleteLabel never leaves a message with no label", () => {
  it("moves messages that had only this label to All Mail, strips the label from the rest, then destroys with onDestroyRemoveEmails false", async () => {
    const s = makeServer({ labels: base, emails: { e1: ["r"], e2: ["r", "a"], e3: ["a"] } });
    const result = await deleteLabel(s.deps, "r");
    expect(result).toEqual({ archived: 1, emptied: 2 });
    expect([...s.emails.get("e1")!]).toEqual(["h"]);
    expect([...s.emails.get("e2")!]).toEqual(["a"]);
    expect([...s.emails.get("e3")!]).toEqual(["a"]);
    expect(s.labels.some((l) => l.id === "r")).toBe(false);
    const destroy = s.sent.find(([name, args]) => name === "Mailbox/set" && args["destroy"])!;
    expect(destroy[1]).toEqual({ destroy: ["r"], onDestroyRemoveEmails: false });
    // The emails were emptied out of the label before the destroy.
    expect(s.sent.findIndex(([n]) => n === "Email/set")).toBeLessThan(s.sent.indexOf(destroy));
    expect(s.sync).toHaveBeenCalled();
  });

  it("makes All Mail first when the account has none", async () => {
    const noArchive = base.filter((l) => l.role !== "archive");
    const s = makeServer({ labels: noArchive, emails: { e1: ["r"] } });
    const result = await deleteLabel(s.deps, "r");
    expect(result.archived).toBe(1);
    const archive = s.labels.find((l) => l.role === "archive");
    expect(archive).toBeDefined();
    expect([...s.emails.get("e1")!]).toEqual([archive!.id]);
  });

  it("keeps sublabels and moves them up a level when a parent is deleted", async () => {
    const s = makeServer({ labels: base, emails: { e1: ["w", "c"] } });
    await deleteLabel(s.deps, "w");
    expect(s.labels.find((l) => l.id === "c")).toMatchObject({ parentId: null });
    expect(s.labels.some((l) => l.id === "w")).toBe(false);
    expect([...s.emails.get("e1")!]).toEqual(["c"]);
  });

  it("changes nothing when a sublabel would clash one level up", async () => {
    const s = makeServer({ labels: [...base, { id: "x", name: "Clients", parentId: null, role: null }], emails: { e1: ["w"] } });
    await expect(deleteLabel(s.deps, "w")).rejects.toThrow(/already exists/);
    expect(s.sent).toEqual([]);
    expect([...s.emails.get("e1")!]).toEqual(["w"]);
  });

  it("refuses system labels", async () => {
    const s = makeServer({ labels: base, emails: { e1: ["a"] } });
    await expect(deleteLabel(s.deps, "a")).rejects.toThrow(/System labels/);
    expect(s.sent).toEqual([]);
  });

  it("deletes an empty label without touching any message", async () => {
    const s = makeServer({ labels: base, emails: {} });
    expect(await deleteLabel(s.deps, "r")).toEqual({ archived: 0, emptied: 0 });
    expect(s.sent.some(([n]) => n === "Email/set")).toBe(false);
  });
});
