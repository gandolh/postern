// The pure parts of label work (brief 09): which labels a selection carries,
// label-name and nesting rules, and the patches that take a label out of
// every message before it is deleted. No client, no React.
//
// Applying and moving labels themselves is brief 06's planLabels / planMove;
// this file only decides what to ask them for.

import type { Id, PatchObject } from "@postern/jmap";
import { escapePointer } from "@postern/jmap";
import { shownMessages, type Conversation, type ConversationScope } from "./conversation";
import type { LabelChange } from "./plans";

// ---- What the selection carries ---------------------------------------------

/** A label's checkbox for a selection: every conversation has it, none, or only some. */
export type LabelCheck = "checked" | "unchecked" | "indeterminate";

/**
 * Per label, whether the selected conversations carry it. A conversation
 * carries a label when any message it shows is in it, as Gmail counts.
 */
export function labelChecks(conversations: readonly Conversation[], scope: ConversationScope, labelIds: readonly Id[]): Map<Id, LabelCheck> {
  const counts = new Map<Id, number>(labelIds.map((id) => [id, 0]));
  for (const conversation of conversations) {
    const carried = new Set<Id>();
    for (const message of shownMessages(conversation, scope)) for (const id of Object.keys(message.mailboxIds)) carried.add(id);
    for (const id of carried) if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const total = conversations.length;
  return new Map(
    labelIds.map((id) => {
      const n = counts.get(id) ?? 0;
      return [id, total > 0 && n === total ? "checked" : n === 0 ? "unchecked" : "indeterminate"] as const;
    }),
  );
}

/** Clicking a checkbox: a checked label comes off; an unchecked or indeterminate one goes on everything. */
export function toggleChange(check: LabelCheck, labelId: Id): LabelChange {
  return check === "checked" ? { remove: [labelId] } : { add: [labelId] };
}

/** The labels a menu offers for a search text: case-insensitive match on the path, in the given order. */
export function filterLabels<T extends { title: string; path: string }>(labels: readonly T[], query: string): T[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [...labels];
  return labels.filter((l) => l.path.toLocaleLowerCase().includes(q) || l.title.toLocaleLowerCase().includes(q));
}

// ---- Names and nesting --------------------------------------------------------

/** What the rules need to know about a label. */
export interface LabelShape {
  id: Id;
  name: string;
  parentId: Id | null;
  role: string | null;
}

export const MAX_LABEL_NAME = 255;

/** Clean a typed name: trimmed, inner runs of whitespace collapsed. */
export function cleanLabelName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * Why a name cannot be used for a label under `parentId`, or null if it can.
 * Nesting is by parentId, so a name never contains "/". Siblings (labels with
 * the same parent, system ones included) must differ, ignoring case.
 * `selfId` is the label being renamed or moved.
 */
export function validateLabelName(name: string, parentId: Id | null, labels: readonly LabelShape[], selfId?: Id): string | null {
  const clean = cleanLabelName(name);
  if (clean === "") return "Enter a name.";
  if (clean.includes("/")) return "A label name can't contain a slash. Nest it under another label instead.";
  if (clean.length > MAX_LABEL_NAME) return `A label name can have at most ${MAX_LABEL_NAME} characters.`;
  const lower = clean.toLocaleLowerCase();
  const clash = labels.find((l) => l.id !== selfId && l.parentId === parentId && l.name.toLocaleLowerCase() === lower);
  if (clash) return parentId === null ? `A label called "${clash.name}" already exists.` : `A label called "${clash.name}" already exists there.`;
  return null;
}

/** A label's own id plus every label below it. */
export function descendantIds(labels: readonly LabelShape[], id: Id): Set<Id> {
  const out = new Set<Id>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of labels) {
      if (l.parentId !== null && out.has(l.parentId) && !out.has(l.id)) {
        out.add(l.id);
        grew = true;
      }
    }
  }
  return out;
}

/** System labels (any role) cannot be renamed, moved or deleted. */
export function isEditable(label: Pick<LabelShape, "role">): boolean {
  return label.role === null;
}

/** The labels a label may be nested under: user labels other than itself and its own sublabels. */
export function nestTargets<T extends LabelShape>(labels: readonly T[], id: Id): T[] {
  const below = descendantIds(labels, id);
  return labels.filter((l) => l.role === null && !below.has(l.id));
}

/** Why `id` cannot go under `parentId`, or null. Combines the cycle rule, the system-label rule and the name rule. */
export function validateNesting(labels: readonly LabelShape[], id: Id, parentId: Id | null): string | null {
  const self = labels.find((l) => l.id === id);
  if (!self) return "That label doesn't exist.";
  if (!isEditable(self)) return "System labels can't be moved.";
  if (parentId !== null) {
    const parent = labels.find((l) => l.id === parentId);
    if (!parent || !isEditable(parent)) return "Labels can only be nested under other labels.";
    if (descendantIds(labels, id).has(parentId)) return "A label can't go inside itself.";
  }
  return validateLabelName(self.name, parentId, labels, id);
}

// ---- Deleting a label ----------------------------------------------------------

/** A message as the deletion needs it. */
export interface MessageMailboxes {
  id: Id;
  mailboxIds: Readonly<Record<Id, true>>;
}

export interface LabelRemoval {
  /** Email/set patches taking `labelId` off each message that has it (and putting orphans in All Mail). */
  update: Record<Id, PatchObject>;
  /** Messages that had only this label: they go to All Mail. */
  orphans: Id[];
}

/**
 * The patches that empty a label before it is destroyed. A message left with
 * no label would be lost, so it gets `archiveId` (All Mail) in the same patch.
 * `archiveId` may be undefined while there are no orphans.
 * @throws Error if there are orphans and no archiveId.
 */
export function planLabelRemoval(messages: readonly MessageMailboxes[], labelId: Id, archiveId: Id | undefined): LabelRemoval {
  const update: Record<Id, PatchObject> = {};
  const orphans: Id[] = [];
  for (const m of messages) {
    if (m.mailboxIds[labelId] !== true) continue;
    const others = Object.keys(m.mailboxIds).filter((id) => id !== labelId);
    const patch: PatchObject = { [`mailboxIds/${escapePointer(labelId)}`]: null };
    if (others.length === 0) {
      if (archiveId === undefined) throw new Error("Messages would be left in no label and there is no All Mail");
      patch[`mailboxIds/${escapePointer(archiveId)}`] = true;
      orphans.push(m.id);
    }
    update[m.id] = patch;
  }
  return { update, orphans };
}

/**
 * Deleting a label with sublabels: the sublabels stay and move up to the
 * deleted label's parent (Gmail deletes only the label). Returns the
 * Mailbox/set updates, or the first name clash at the new level.
 */
export function planPromoteChildren(labels: readonly LabelShape[], id: Id): { update: Record<Id, { parentId: Id | null }> } | { error: string } {
  const self = labels.find((l) => l.id === id);
  if (!self) return { error: "That label doesn't exist." };
  const children = labels.filter((l) => l.parentId === id);
  const taken = new Set(labels.filter((l) => l.parentId === self.parentId && l.id !== id).map((l) => l.name.toLocaleLowerCase()));
  const update: Record<Id, { parentId: Id | null }> = {};
  for (const child of children) {
    const key = child.name.toLocaleLowerCase();
    if (taken.has(key)) return { error: `Can't keep "${child.name}": a label with that name already exists one level up.` };
    taken.add(key);
    update[child.id] = { parentId: self.parentId };
  }
  return { update };
}
