// The one place that turns "add this label, clear that keyword" into JMAP
// `Email/set` patches, applies them locally, and inverts them for undo. Pure:
// no client, no React.
//
//   const patch = editToPatch(message, { mailboxIds: { [inbox]: false, [archive]: true } });
//   const inverse = invertPatch(message, patch);       // puts it back exactly
//   const after = applyPatch(message, patch);          // what the server will hold
//
// Patches use JSON-pointer paths (`mailboxIds/<id>`, `keywords/$seen`), so a
// patch only touches what it names: a label added elsewhere in the meantime
// survives both the action and its undo.

import { escapePointer, type Id, type PatchObject } from "@postern/jmap";

/** What a patch needs to know about a message. */
export interface MessageState {
  id: Id;
  mailboxIds: Readonly<Record<Id, true>>;
  keywords: Readonly<Record<string, true>>;
}

/** What to change on one message: `true` adds, `false` removes; anything unnamed stays as it is. */
export interface MessageEdit {
  mailboxIds?: Readonly<Record<Id, boolean>>;
  keywords?: Readonly<Record<string, boolean>>;
}

/** A patch would leave a message in no label, which JMAP forbids. A planner bug, not a user error. */
export class NoMailboxError extends Error {
  readonly messageId: Id;
  constructor(messageId: Id) {
    super(`The change would leave message ${messageId} in no label`);
    this.name = "NoMailboxError";
    this.messageId = messageId;
  }
}

function unescapePointer(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * The patch that makes `edit` true of `message`, naming only what actually
 * changes. Null when the message already looks like that.
 * @throws NoMailboxError if the result would be in no label.
 */
export function editToPatch(message: MessageState, edit: MessageEdit): PatchObject | null {
  const patch: PatchObject = {};
  for (const [id, on] of Object.entries(edit.mailboxIds ?? {})) {
    if (on !== (message.mailboxIds[id] === true)) patch[`mailboxIds/${escapePointer(id)}`] = on ? true : null;
  }
  for (const [keyword, on] of Object.entries(edit.keywords ?? {})) {
    if (on !== (message.keywords[keyword] === true)) patch[`keywords/${escapePointer(keyword)}`] = on ? true : null;
  }
  if (Object.keys(patch).length === 0) return null;
  if (Object.keys(applyPatch(message, patch).mailboxIds).length === 0) throw new NoMailboxError(message.id);
  return patch;
}

/**
 * The message as the server will hold it after `patch`. Understands the
 * pointer forms (`mailboxIds/<id>`, `keywords/<kw>`) and whole-property
 * replacement (`mailboxIds`, `keywords`); other properties are ignored.
 */
export function applyPatch<T extends MessageState>(message: T, patch: PatchObject): T {
  let mailboxIds: Record<Id, true> | null = null;
  let keywords: Record<string, true> | null = null;
  for (const [path, value] of Object.entries(patch)) {
    if (path === "mailboxIds") {
      mailboxIds = { ...((value ?? {}) as Record<Id, true>) };
    } else if (path === "keywords") {
      keywords = { ...((value ?? {}) as Record<string, true>) };
    } else if (path.startsWith("mailboxIds/")) {
      mailboxIds ??= { ...message.mailboxIds };
      const id = unescapePointer(path.slice("mailboxIds/".length));
      if (value === true) mailboxIds[id] = true;
      else delete mailboxIds[id];
    } else if (path.startsWith("keywords/")) {
      keywords ??= { ...message.keywords };
      const keyword = unescapePointer(path.slice("keywords/".length));
      if (value === true) keywords[keyword] = true;
      else delete keywords[keyword];
    }
  }
  if (!mailboxIds && !keywords) return message;
  return { ...message, ...(mailboxIds ? { mailboxIds } : {}), ...(keywords ? { keywords } : {}) };
}

/**
 * The patch that undoes `patch` on a message that was `before`: each path it
 * names goes back to its prior value, nothing else is touched.
 */
export function invertPatch(before: MessageState, patch: PatchObject): PatchObject {
  const inverse: PatchObject = {};
  for (const path of Object.keys(patch)) {
    if (path === "mailboxIds") inverse[path] = { ...before.mailboxIds };
    else if (path === "keywords") inverse[path] = { ...before.keywords };
    else if (path.startsWith("mailboxIds/")) {
      inverse[path] = before.mailboxIds[unescapePointer(path.slice("mailboxIds/".length))] === true ? true : null;
    } else if (path.startsWith("keywords/")) {
      inverse[path] = before.keywords[unescapePointer(path.slice("keywords/".length))] === true ? true : null;
    }
  }
  return inverse;
}

/** An action worked out in full before anything is sent. */
export interface MessagePlan {
  /** `Email/set` `update`: message id → patch. */
  update: Record<Id, PatchObject>;
  /** The patches that restore each message exactly as it was. */
  inverse: Record<Id, PatchObject>;
  /** The conversations (Thread ids) it changes, for the toast's count. */
  conversationIds: Id[];
  /** Message id → its conversation, to count conversations when some messages fail. */
  conversationOf: Record<Id, Id>;
}

/** A plan that changes nothing. */
export function emptyPlan(): MessagePlan {
  return { update: {}, inverse: {}, conversationIds: [], conversationOf: {} };
}

export function isEmptyPlan(plan: MessagePlan): boolean {
  return Object.keys(plan.update).length === 0;
}

/**
 * Build a plan from one edit per message. `edit` returns null to leave a
 * message alone. A conversation counts only if one of its messages changes.
 */
export function planEdits<M extends MessageState>(
  groups: readonly { id: Id; messages: readonly M[] }[],
  edit: (message: M, group: { id: Id; messages: readonly M[] }) => MessageEdit | null,
): MessagePlan {
  const plan = emptyPlan();
  for (const group of groups) {
    let touched = false;
    for (const message of group.messages) {
      if (plan.update[message.id]) continue; // the same message reached twice
      const change = edit(message, group);
      if (!change) continue;
      const patch = editToPatch(message, change);
      if (!patch) continue;
      plan.update[message.id] = patch;
      plan.inverse[message.id] = invertPatch(message, patch);
      plan.conversationOf[message.id] = group.id;
      touched = true;
    }
    if (touched) plan.conversationIds.push(group.id);
  }
  return plan;
}

/** The part of a plan for some of its messages (those that succeeded, or failed). */
export function subPlan(plan: MessagePlan, messageIds: Iterable<Id>): MessagePlan {
  const out = emptyPlan();
  const conversations = new Set<Id>();
  for (const id of messageIds) {
    const patch = plan.update[id];
    const inverse = plan.inverse[id];
    const conversation = plan.conversationOf[id];
    if (!patch || !inverse || conversation === undefined) continue;
    out.update[id] = patch;
    out.inverse[id] = inverse;
    out.conversationOf[id] = conversation;
    conversations.add(conversation);
  }
  out.conversationIds = plan.conversationIds.filter((id) => conversations.has(id));
  return out;
}

/** The plan that undoes `plan` (its inverse as the update, and back). */
export function reversePlan(plan: MessagePlan): MessagePlan {
  return { update: plan.inverse, inverse: plan.update, conversationIds: plan.conversationIds, conversationOf: plan.conversationOf };
}
