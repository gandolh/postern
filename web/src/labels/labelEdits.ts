// Creating, renaming, nesting, subscribing and deleting labels (JMAP
// mailboxes). Framework-free so it is testable; useLabelEdits wires it to the
// session and the labels store. Every change ends in a labels `sync()`.
//
// Deleting a label never loses mail (corpus/wiki/decisions-mail.md: a message is
// always in at least one mailbox). The messages in it are first taken out of
// it; those that would be left in no label go to All Mail (the archive-role
// mailbox, made if the account has none) in the same patch. Only then is the
// emptied mailbox destroyed, with onDestroyRemoveEmails: false so a mistake
// could never take messages with it. Sublabels are kept and move up to the
// deleted label's parent (Gmail deletes only the label, not its sublabels).

import { JmapSetError, type Id, type MethodCaller, type SetError } from "@postern/jmap";
import { ensureAllMail, type AllMailLabels } from "../actions/allMail";
import {
  cleanLabelName,
  isEditable,
  planLabelRemoval,
  planPromoteChildren,
  validateLabelName,
  validateNesting,
  type LabelShape,
} from "../actions/labels";

/** A rule or a refusal the user should read; `message` is shown as is. */
export class LabelEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabelEditError";
  }
}

export interface LabelEditDeps {
  caller: MethodCaller;
  labels: AllMailLabels & { getSnapshot(): { labels: readonly LabelShape[] } };
}

const CHUNK = 200;

function shapes(deps: LabelEditDeps): readonly LabelShape[] {
  return deps.labels.getSnapshot().labels;
}

function refusal(error: SetError | undefined, fallback: string): LabelEditError {
  switch (error?.type) {
    case "alreadyExists":
      return new LabelEditError("A label with that name already exists there.");
    case "forbidden":
      return new LabelEditError("The server doesn't allow that change.");
    default:
      return new LabelEditError(error?.description ? `${fallback} (${error.description})` : fallback);
  }
}

async function setMailbox(deps: LabelEditDeps, args: Parameters<MethodCaller["call"]>[1], fallback: string, id: Id): Promise<void> {
  const res = await deps.caller.call("Mailbox/set", args as never);
  const error = res.notCreated?.[id] ?? res.notUpdated?.[id] ?? res.notDestroyed?.[id];
  if (error) throw refusal(error, fallback);
}

/** Make a label (optionally under a parent); returns its id. */
export async function createLabel(deps: LabelEditDeps, name: string, parentId: Id | null = null): Promise<Id> {
  const labels = shapes(deps);
  const problem = validateLabelName(name, parentId, labels);
  if (problem) throw new LabelEditError(problem);
  if (parentId !== null) {
    const parent = labels.find((l) => l.id === parentId);
    if (!parent || !isEditable(parent)) throw new LabelEditError("Labels can only be nested under other labels.");
  }
  const res = await deps.caller.call("Mailbox/set", {
    create: { new: { name: cleanLabelName(name), parentId, isSubscribed: true } },
  });
  const id = res.created?.["new"]?.id;
  if (!id) throw refusal(res.notCreated?.["new"], "Couldn't create the label.");
  await deps.labels.sync();
  return id;
}

export async function renameLabel(deps: LabelEditDeps, id: Id, name: string): Promise<void> {
  const labels = shapes(deps);
  const self = labels.find((l) => l.id === id);
  if (!self) throw new LabelEditError("That label doesn't exist.");
  if (!isEditable(self)) throw new LabelEditError("System labels can't be renamed.");
  const problem = validateLabelName(name, self.parentId, labels, id);
  if (problem) throw new LabelEditError(problem);
  if (cleanLabelName(name) !== self.name) {
    await setMailbox(deps, { update: { [id]: { name: cleanLabelName(name) } } }, "Couldn't rename the label.", id);
  }
  await deps.labels.sync();
}

/** Nest a label under another (`parentId`), or make it top-level with null. */
export async function nestLabel(deps: LabelEditDeps, id: Id, parentId: Id | null): Promise<void> {
  const problem = validateNesting(shapes(deps), id, parentId);
  if (problem) throw new LabelEditError(problem);
  await setMailbox(deps, { update: { [id]: { parentId } } }, "Couldn't move the label.", id);
  await deps.labels.sync();
}

/** Show or hide a label in the navigation (the mailbox's isSubscribed, so IMAP clients agree). */
export async function setLabelSubscribed(deps: LabelEditDeps, id: Id, subscribed: boolean): Promise<void> {
  const self = shapes(deps).find((l) => l.id === id);
  if (!self) throw new LabelEditError("That label doesn't exist.");
  if (!isEditable(self)) throw new LabelEditError("System labels can't be hidden.");
  await setMailbox(deps, { update: { [id]: { isSubscribed: subscribed } } }, "Couldn't change the label.", id);
  await deps.labels.sync();
}

export interface DeleteLabelResult {
  /** Messages that had only this label and went to All Mail. */
  archived: number;
  /** Messages that were in it. */
  emptied: number;
}

async function messagesIn(caller: MethodCaller, labelId: Id): Promise<{ id: Id; mailboxIds: Record<Id, true> }[]> {
  const ids: Id[] = [];
  for (let position = 0; ; ) {
    const res = await caller.call("Email/query", { filter: { inMailbox: labelId }, position, limit: 500 });
    ids.push(...res.ids);
    position += res.ids.length;
    if (res.ids.length === 0 || (res.total !== undefined && position >= res.total) || res.ids.length < 500) break;
  }
  const out: { id: Id; mailboxIds: Record<Id, true> }[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const res = await caller.call("Email/get", { ids: ids.slice(i, i + CHUNK), properties: ["id", "mailboxIds"] });
    for (const m of res.list) out.push({ id: m.id, mailboxIds: m.mailboxIds as Record<Id, true> });
  }
  return out;
}

/**
 * Delete a label. Its messages stay (see the header); sublabels move up one
 * level. Nothing is changed when a rule fails (a system label, a name clash
 * one level up); the order after that is the safe one: empty the label, move
 * the sublabels, destroy the mailbox.
 */
export async function deleteLabel(deps: LabelEditDeps, id: Id): Promise<DeleteLabelResult> {
  const labels = shapes(deps);
  const self = labels.find((l) => l.id === id);
  if (!self) throw new LabelEditError("That label doesn't exist.");
  if (!isEditable(self)) throw new LabelEditError("System labels can't be deleted.");
  const promote = planPromoteChildren(labels, id);
  if ("error" in promote) throw new LabelEditError(promote.error);

  const messages = await messagesIn(deps.caller, id);
  const needsArchive = messages.some((m) => Object.keys(m.mailboxIds).every((mb) => mb === id));
  const archiveId = needsArchive ? await ensureAllMail(deps.caller, deps.labels) : undefined;
  const removal = planLabelRemoval(messages, id, archiveId);
  const ids = Object.keys(removal.update);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const update = Object.fromEntries(ids.slice(i, i + CHUNK).map((m) => [m, removal.update[m]!]));
    const res = await deps.caller.call("Email/set", { update });
    const [failedId, failed] = Object.entries(res.notUpdated ?? {})[0] ?? [];
    if (failedId && failed) throw new JmapSetError("Email/set", failedId, failed);
  }

  if (Object.keys(promote.update).length > 0) {
    const res = await deps.caller.call("Mailbox/set", { update: promote.update });
    const [failedId, failed] = Object.entries(res.notUpdated ?? {})[0] ?? [];
    if (failedId && failed) throw refusal(failed, "Couldn't keep the sublabels.");
  }
  await setMailbox(deps, { destroy: [id], onDestroyRemoveEmails: false }, "Couldn't delete the label.", id);
  await deps.labels.sync();
  return { archived: removal.orphans.length, emptied: messages.length };
}
