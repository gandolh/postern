// Every mail action, run the same way:
//
//   1. plan the per-message patches (./plans), with All Mail created first if
//      archiving needs it;
//   2. apply them locally at once (the bus: every list and conversation view);
//   3. send one Email/set; on failure, put the local state back and say so;
//   4. offer Undo (toast and `z`), which sends the inverse patch;
//   5. sync the label counts and tell the screens to refresh.
//
// Framework-free so it is testable; useMailActions() wires it to the session,
// the labels store and the shell's toast.

import { isAbortError, SessionExpiredError, SignedOutError, type Id, type MethodCaller, type PatchObject } from "@postern/jmap";
import { publishMailChange } from "./bus";
import { shownMessages, type Conversation, type ConversationScope, type MailboxRoles } from "./conversation";
import { destroyMessages, sendPlan, type SendResult } from "./execute";
import { isEmptyPlan, reversePlan, type MessagePlan } from "./patches";
import {
  archiveNeedsAllMail,
  destroyIds,
  planArchive,
  planImportant,
  planLabels,
  planMove,
  planRead,
  planStar,
  planTrash,
  type LabelChange,
} from "./plans";
import { planNotSpam, planReportSpam } from "./spam";
import { runUndo, setUndo, type UndoEntry } from "./undo";

/** The part of the shell's toast API the actions use. */
export interface ActionToast {
  show(options: { message: string; action?: { label: string; onClick: () => void }; duration?: number | null }): unknown;
}

export interface MailActionDeps {
  caller: MethodCaller;
  /** The account's system labels now (the labels store's answer). */
  roles: () => MailboxRoles;
  /** All Mail's id, creating it when the account has none (ensureAllMail). */
  ensureAllMail: () => Promise<Id>;
  /** Bring the label counts up to date (labels store sync). */
  syncLabels: () => void;
  toast: ActionToast | null;
}

/** What the toast says about an action. */
export interface ActionCopy {
  /** "Conversation archived." / "3 conversations archived." */
  done: (count: number) => string;
  /** "Couldn't archive the conversation." / "Couldn't archive 3 conversations." */
  failed: (count: number) => string;
}

export type ActionOutcome = "done" | "partial" | "nothing" | "failed";

export interface ActionOptions {
  /** Show the toast (default true). The row's star toggle turns it off, as Gmail does; undo stays on `z`. */
  toast?: boolean;
}

type Scoped = (conversations: readonly Conversation[], scope: ConversationScope, options?: ActionOptions) => Promise<ActionOutcome>;

export interface MailActions {
  archive: Scoped;
  /** Delete: move to Trash. */
  trash: Scoped;
  /** Delete forever (Trash and Spam): destroys the messages shown. No undo; confirm first. */
  deleteForever: Scoped;
  reportSpam: Scoped;
  notSpam: Scoped;
  markRead: Scoped;
  markUnread: Scoped;
  star: Scoped;
  unstar: Scoped;
  markImportant: Scoped;
  markNotImportant: Scoped;
  /** Brief 09: apply and remove labels, with the same optimistic update, toast and undo. */
  applyLabels(conversations: readonly Conversation[], scope: ConversationScope, change: LabelChange, copy: ActionCopy, options?: ActionOptions): Promise<ActionOutcome>;
  /** Brief 09: Gmail's "Move to" (out of `from`, into `to`). */
  moveTo(conversations: readonly Conversation[], scope: ConversationScope, from: Id | undefined, to: Id, copy: ActionCopy, options?: ActionOptions): Promise<ActionOutcome>;
  /** Run any plan the same way. `make` may throw (MissingLabelError): that is reported as a failure. */
  run(make: MessagePlan | (() => MessagePlan), copy: ActionCopy, options?: ActionOptions): Promise<ActionOutcome>;
}

const n = (count: number) => count.toLocaleString();

/** Gmail's toast wording, singular and plural. */
export function actionCopy(oneDone: string, manyDone: string, oneFailed: string, manyFailed: string): ActionCopy {
  return {
    done: (count) => (count === 1 ? oneDone : manyDone.replace("{n}", n(count))),
    failed: (count) => (count === 1 ? oneFailed : manyFailed.replace("{n}", n(count))),
  };
}

export const COPY = {
  archive: actionCopy("Conversation archived.", "{n} conversations archived.", "Couldn't archive the conversation.", "Couldn't archive {n} conversations."),
  trash: actionCopy("Conversation moved to Trash.", "{n} conversations moved to Trash.", "Couldn't delete the conversation.", "Couldn't delete {n} conversations."),
  deleteForever: actionCopy(
    "Conversation deleted forever.",
    "{n} conversations deleted forever.",
    "Couldn't delete the conversation.",
    "Couldn't delete {n} conversations.",
  ),
  reportSpam: actionCopy(
    "Conversation reported as spam.",
    "{n} conversations reported as spam.",
    "Couldn't report the conversation as spam.",
    "Couldn't report {n} conversations as spam.",
  ),
  notSpam: actionCopy(
    "Conversation marked as not spam and moved to Inbox.",
    "{n} conversations marked as not spam and moved to Inbox.",
    "Couldn't move the conversation out of Spam.",
    "Couldn't move {n} conversations out of Spam.",
  ),
  read: actionCopy("Conversation marked as read.", "{n} conversations marked as read.", "Couldn't mark the conversation as read.", "Couldn't mark {n} conversations as read."),
  unread: actionCopy(
    "Conversation marked as unread.",
    "{n} conversations marked as unread.",
    "Couldn't mark the conversation as unread.",
    "Couldn't mark {n} conversations as unread.",
  ),
  star: actionCopy("Conversation starred.", "{n} conversations starred.", "Couldn't star the conversation.", "Couldn't star {n} conversations."),
  unstar: actionCopy("Star removed.", "Stars removed from {n} conversations.", "Couldn't remove the star.", "Couldn't remove the stars from {n} conversations."),
  important: actionCopy(
    "Conversation marked as important.",
    "{n} conversations marked as important.",
    "Couldn't mark the conversation as important.",
    "Couldn't mark {n} conversations as important.",
  ),
  notImportant: actionCopy(
    "Conversation marked as not important.",
    "{n} conversations marked as not important.",
    "Couldn't mark the conversation as not important.",
    "Couldn't mark {n} conversations as not important.",
  ),
} as const satisfies Record<string, ActionCopy>;

export const UNDONE_MESSAGE = "Action undone.";
export const UNDO_FAILED_MESSAGE = "Couldn't undo that. Try again.";

/** Session and abort errors are the sign-in layer's to show (brief 04), never a toast here. */
export function isQuietError(err: unknown): boolean {
  return isAbortError(err) || err instanceof SessionExpiredError || err instanceof SignedOutError;
}

function conversationsIn(plan: MessagePlan, messageIds: Iterable<Id>): number {
  const ids = new Set<Id>();
  for (const id of messageIds) {
    const c = plan.conversationOf[id];
    if (c !== undefined) ids.add(c);
  }
  return ids.size;
}

export function createMailActions(deps: MailActionDeps): MailActions {
  // The labels store's roles now, not the ones a view captured when it mounted (All Mail may exist since).
  const fresh = (scope: ConversationScope): ConversationScope => ({ kind: scope.kind, roles: deps.roles() });

  const toast = (message: string, undo?: UndoEntry) => {
    deps.toast?.show(undo ? { message, action: { label: "Undo", onClick: () => void runUndo(undo) } } : { message });
  };

  const settle = () => {
    deps.syncLabels();
    publishMailChange({ kind: "settled" });
  };

  async function undoDone(done: MessagePlan): Promise<void> {
    const back = reversePlan(done);
    publishMailChange({ kind: "patch", update: back.update });
    let result: SendResult;
    try {
      result = await sendPlan(deps.caller, back);
    } catch (err) {
      publishMailChange({ kind: "patch", update: back.inverse });
      settle();
      if (!isQuietError(err)) toast(UNDO_FAILED_MESSAGE);
      return;
    }
    if (!isEmptyPlan(result.failed)) publishMailChange({ kind: "patch", update: result.failed.inverse });
    settle();
    toast(isEmptyPlan(result.failed) ? UNDONE_MESSAGE : UNDO_FAILED_MESSAGE);
  }

  async function run(make: MessagePlan | (() => MessagePlan), copy: ActionCopy, options: ActionOptions = {}): Promise<ActionOutcome> {
    let plan: MessagePlan;
    try {
      plan = typeof make === "function" ? make() : make;
    } catch (err) {
      console.error(err);
      toast(copy.failed(1));
      return "failed";
    }
    if (isEmptyPlan(plan)) return "nothing";
    const count = plan.conversationIds.length;

    publishMailChange({ kind: "patch", update: plan.update });
    let result: SendResult;
    try {
      result = await sendPlan(deps.caller, plan);
    } catch (err) {
      publishMailChange({ kind: "patch", update: plan.inverse });
      settle();
      if (!isQuietError(err)) toast(copy.failed(count));
      return "failed";
    }

    const failedCount = conversationsIn(plan, Object.keys(result.failed.update));
    if (failedCount > 0) publishMailChange({ kind: "patch", update: result.failed.inverse });
    settle();

    if (isEmptyPlan(result.done)) {
      toast(copy.failed(count));
      return "failed";
    }
    const entry: UndoEntry = { label: copy.done(result.done.conversationIds.length), undo: () => undoDone(result.done) };
    setUndo(entry);
    if (failedCount > 0) {
      toast(copy.failed(failedCount), entry);
      return "partial";
    }
    if (options.toast !== false) toast(copy.done(count), entry);
    return "done";
  }

  async function deleteForever(conversations: readonly Conversation[], scope: ConversationScope, options: ActionOptions = {}): Promise<ActionOutcome> {
    const s = fresh(scope);
    const ids = new Set(destroyIds(conversations, s));
    if (ids.size === 0) return "nothing";
    // Locally the messages leave every label, so every view drops them; put back if the server refuses.
    const hide: Record<Id, PatchObject> = {};
    const restore: Record<Id, PatchObject> = {};
    const conversationOf = new Map<Id, Id>();
    for (const c of conversations) {
      for (const m of shownMessages(c, s)) {
        if (!ids.has(m.id)) continue;
        hide[m.id] = { mailboxIds: {} };
        restore[m.id] = { mailboxIds: { ...m.mailboxIds } };
        conversationOf.set(m.id, c.id);
      }
    }
    const count = new Set(conversationOf.values()).size;
    publishMailChange({ kind: "patch", update: hide });
    let errors: Record<Id, unknown>;
    try {
      ({ errors } = await destroyMessages(deps.caller, [...ids]));
    } catch (err) {
      publishMailChange({ kind: "patch", update: restore });
      settle();
      if (!isQuietError(err)) toast(COPY.deleteForever.failed(count));
      return "failed";
    }
    const refused = Object.keys(errors);
    if (refused.length > 0) {
      publishMailChange({ kind: "patch", update: Object.fromEntries(refused.flatMap((id) => (restore[id] ? [[id, restore[id]]] : []))) });
    }
    settle();
    const failedCount = new Set(refused.map((id) => conversationOf.get(id))).size;
    if (failedCount > 0) {
      toast(COPY.deleteForever.failed(failedCount));
      return failedCount === count ? "failed" : "partial";
    }
    if (options.toast !== false) toast(COPY.deleteForever.done(count));
    return "done";
  }

  async function archive(conversations: readonly Conversation[], scope: ConversationScope, options?: ActionOptions): Promise<ActionOutcome> {
    let s = fresh(scope);
    if (s.roles.archive === undefined && archiveNeedsAllMail(conversations, s)) {
      try {
        s = { ...s, roles: { ...s.roles, archive: await deps.ensureAllMail() } };
      } catch (err) {
        if (!isQuietError(err)) toast(COPY.archive.failed(conversations.length));
        return "failed";
      }
    }
    return run(() => planArchive(conversations, s), COPY.archive, options);
  }

  const scoped =
    (plan: (conversations: readonly Conversation[], scope: ConversationScope) => MessagePlan, copy: ActionCopy): Scoped =>
    (conversations, scope, options) =>
      run(() => plan(conversations, fresh(scope)), copy, options);

  return {
    archive,
    trash: scoped(planTrash, COPY.trash),
    deleteForever,
    reportSpam: scoped(planReportSpam, COPY.reportSpam),
    notSpam: scoped(planNotSpam, COPY.notSpam),
    markRead: scoped((c, s) => planRead(c, s, true), COPY.read),
    markUnread: scoped((c, s) => planRead(c, s, false), COPY.unread),
    star: scoped((c, s) => planStar(c, s, true), COPY.star),
    unstar: scoped((c, s) => planStar(c, s, false), COPY.unstar),
    markImportant: scoped((c, s) => planImportant(c, s, true), COPY.important),
    markNotImportant: scoped((c, s) => planImportant(c, s, false), COPY.notImportant),
    async applyLabels(conversations, scope, change, copy, options) {
      let s = fresh(scope);
      // Removing the last label sends a message to All Mail: make sure it exists.
      if (s.roles.archive === undefined && (change.remove?.length ?? 0) > 0) {
        try {
          s = { ...s, roles: { ...s.roles, archive: await deps.ensureAllMail() } };
        } catch (err) {
          if (!isQuietError(err)) toast(copy.failed(conversations.length));
          return "failed";
        }
      }
      return run(() => planLabels(conversations, s, change), copy, options);
    },
    moveTo(conversations, scope, from, to, copy, options) {
      return run(() => planMove(conversations, fresh(scope), from, to), copy, options);
    },
    run,
  };
}
