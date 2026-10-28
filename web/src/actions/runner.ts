// Every mail action, run the same way:
//
//   1. plan the per-message patches (./plans), with All Mail created first if
//      archiving needs it;
//   2. apply them locally at once (the bus: every list and conversation view);
//   3. send one Email/set; on failure, put the local state back and say so;
//   4. offer Undo (toast and `z`, ./undo), which sends the inverse patch;
//      a quiet action (no toast) is still on `z`;
//   5. sync the label counts and tell the screens to refresh.
//
// Framework-free so it is testable; useMailActions() wires it to the session,
// the labels store and the shell's toast.

import { isAbortError, SessionExpiredError, SignedOutError, type Id, type MethodCaller, type PatchObject } from "@postern/jmap";
import { publishMailChange, publishPending } from "./bus";
import { shownMessages, type Conversation, type ConversationScope, type MailboxRoles } from "./conversation";
import { actionCopy, type ActionCopy, type RowNoun } from "./copy";
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
import { planSnooze, planUnsnooze, snoozeCopy, UNSNOOZE_COPY } from "./snooze";
import { NOT_SPAM_COPY, planNotSpam, planReportSpam, REPORT_SPAM_COPY } from "./spam";
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
  /** Brief 24: the Snoozed label's id, creating it on first use (snooze/label.ts). Without it, snooze fails. */
  ensureSnoozed?: () => Promise<Id>;
  /** Brief 24: the Snoozed label's id if it exists (for unsnooze). */
  snoozedId?: () => Id | undefined;
  /** Bring the label counts up to date (labels store sync). */
  syncLabels: () => void;
  toast: ActionToast | null;
  /** Brief 26: what the toasts count, "conversation" (the default) or "message" with conversation view off. */
  noun?: () => RowNoun;
}

export { actionCopy, type ActionCopy, type RowNoun };

export type ActionOutcome = "done" | "partial" | "nothing" | "failed";

export interface ActionOptions {
  /** Show the toast (default true). The row's star toggle turns it off, as Gmail does; undo stays on `z`. */
  toast?: boolean;
  /** What the toast counts, when not what the list's rows are (deps.noun): the open conversation says what it shows (brief 26). */
  noun?: RowNoun;
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
  /** Brief 24: snooze until `at` (the Snoozed label is made on first use). */
  snooze(conversations: readonly Conversation[], scope: ConversationScope, at: Date, options?: ActionOptions): Promise<ActionOutcome>;
  /** Brief 24: back to the Inbox now. */
  unsnooze: Scoped;
  /** Run any plan the same way. `make` may throw (MissingLabelError): that is reported as a failure. */
  run(make: MessagePlan | (() => MessagePlan), copy: ActionCopy, options?: ActionOptions): Promise<ActionOutcome>;
}

// "{Thing}" and "{things}" are the conversation, or the message with conversation view off (./copy).
export const COPY = {
  archive: actionCopy("{Thing} archived.", "{n} {things} archived.", "Couldn't archive the {thing}.", "Couldn't archive {n} {things}."),
  trash: actionCopy("{Thing} moved to Trash.", "{n} {things} moved to Trash.", "Couldn't delete the {thing}.", "Couldn't delete {n} {things}."),
  deleteForever: actionCopy("{Thing} deleted forever.", "{n} {things} deleted forever.", "Couldn't delete the {thing}.", "Couldn't delete {n} {things}."),
  // Spam's own words: Stalwart trains its spam filter on both (spam.ts).
  reportSpam: REPORT_SPAM_COPY,
  notSpam: NOT_SPAM_COPY,
  read: actionCopy("{Thing} marked as read.", "{n} {things} marked as read.", "Couldn't mark the {thing} as read.", "Couldn't mark {n} {things} as read."),
  unread: actionCopy("{Thing} marked as unread.", "{n} {things} marked as unread.", "Couldn't mark the {thing} as unread.", "Couldn't mark {n} {things} as unread."),
  star: actionCopy("{Thing} starred.", "{n} {things} starred.", "Couldn't star the {thing}.", "Couldn't star {n} {things}."),
  unstar: actionCopy("Star removed.", "Stars removed from {n} {things}.", "Couldn't remove the star.", "Couldn't remove the stars from {n} {things}."),
  important: actionCopy(
    "{Thing} marked as important.",
    "{n} {things} marked as important.",
    "Couldn't mark the {thing} as important.",
    "Couldn't mark {n} {things} as important.",
  ),
  notImportant: actionCopy(
    "{Thing} marked as not important.",
    "{n} {things} marked as not important.",
    "Couldn't mark the {thing} as not important.",
    "Couldn't mark {n} {things} as not important.",
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

  /** What the toasts count: the caller's word, else the list's rows' (brief 26). */
  const nounOf = (options?: ActionOptions): RowNoun => options?.noun ?? deps.noun?.() ?? "conversation";

  const toast = (message: string, undo?: UndoEntry) => {
    deps.toast?.show(undo ? { message, action: { label: "Undo", onClick: () => void runUndo(undo) } } : { message });
  };

  const settle = () => {
    deps.syncLabels();
    publishMailChange({ kind: "settled" });
  };

  async function undoDone(done: MessagePlan): Promise<void> {
    const back = reversePlan(done);
    const answered = publishPending(back.update);
    let result: SendResult;
    try {
      result = await sendPlan(deps.caller, back);
    } catch (err) {
      answered();
      publishMailChange({ kind: "patch", update: back.inverse });
      settle();
      if (!isQuietError(err)) toast(UNDO_FAILED_MESSAGE);
      return;
    } finally {
      answered();
    }
    if (!isEmptyPlan(result.failed)) publishMailChange({ kind: "patch", update: result.failed.inverse });
    settle();
    toast(isEmptyPlan(result.failed) ? UNDONE_MESSAGE : UNDO_FAILED_MESSAGE);
  }

  async function run(make: MessagePlan | (() => MessagePlan), copy: ActionCopy, options: ActionOptions = {}): Promise<ActionOutcome> {
    const noun = nounOf(options);
    let plan: MessagePlan;
    try {
      plan = typeof make === "function" ? make() : make;
    } catch (err) {
      console.error(err);
      toast(copy.failed(1, noun));
      return "failed";
    }
    if (isEmptyPlan(plan)) return "nothing";
    const count = plan.conversationIds.length;

    const answered = publishPending(plan.update);
    let result: SendResult;
    try {
      result = await sendPlan(deps.caller, plan);
    } catch (err) {
      answered();
      publishMailChange({ kind: "patch", update: plan.inverse });
      settle();
      if (!isQuietError(err)) toast(copy.failed(count, noun));
      return "failed";
    } finally {
      answered();
    }

    const failedCount = conversationsIn(plan, Object.keys(result.failed.update));
    if (failedCount > 0) publishMailChange({ kind: "patch", update: result.failed.inverse });
    settle();

    if (isEmptyPlan(result.done)) {
      toast(copy.failed(count, noun));
      return "failed";
    }
    const entry: UndoEntry = { label: copy.done(result.done.conversationIds.length, noun), undo: () => undoDone(result.done) };
    setUndo(entry);
    if (failedCount > 0) {
      toast(copy.failed(failedCount, noun), entry);
      return "partial";
    }
    if (options.toast !== false) toast(copy.done(count, noun), entry);
    return "done";
  }

  async function deleteForever(conversations: readonly Conversation[], scope: ConversationScope, options: ActionOptions = {}): Promise<ActionOutcome> {
    const s = fresh(scope);
    const noun = nounOf(options);
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
    const answered = publishPending(hide);
    let errors: Record<Id, unknown>;
    try {
      ({ errors } = await destroyMessages(deps.caller, [...ids]));
    } catch (err) {
      answered();
      publishMailChange({ kind: "patch", update: restore });
      settle();
      if (!isQuietError(err)) toast(COPY.deleteForever.failed(count, noun));
      return "failed";
    } finally {
      answered();
    }
    const refused = Object.keys(errors);
    if (refused.length > 0) {
      publishMailChange({ kind: "patch", update: Object.fromEntries(refused.flatMap((id) => (restore[id] ? [[id, restore[id]]] : []))) });
    }
    settle();
    const failedCount = new Set(refused.map((id) => conversationOf.get(id))).size;
    if (failedCount > 0) {
      toast(COPY.deleteForever.failed(failedCount, noun));
      return failedCount === count ? "failed" : "partial";
    }
    if (options.toast !== false) toast(COPY.deleteForever.done(count, noun));
    return "done";
  }

  async function archive(conversations: readonly Conversation[], scope: ConversationScope, options?: ActionOptions): Promise<ActionOutcome> {
    let s = fresh(scope);
    if (s.roles.archive === undefined && archiveNeedsAllMail(conversations, s)) {
      try {
        s = { ...s, roles: { ...s.roles, archive: await deps.ensureAllMail() } };
      } catch (err) {
        if (!isQuietError(err)) toast(COPY.archive.failed(conversations.length, nounOf(options)));
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
          if (!isQuietError(err)) toast(copy.failed(conversations.length, nounOf(options)));
          return "failed";
        }
      }
      return run(() => planLabels(conversations, s, change), copy, options);
    },
    moveTo(conversations, scope, from, to, copy, options) {
      return run(() => planMove(conversations, fresh(scope), from, to), copy, options);
    },
    async snooze(conversations, scope, at, options) {
      const copy = snoozeCopy(at);
      let snoozedId: Id;
      try {
        if (!deps.ensureSnoozed) throw new Error("Snooze needs the Snoozed label");
        snoozedId = await deps.ensureSnoozed();
      } catch (err) {
        if (!isQuietError(err)) toast(copy.failed(conversations.length, nounOf(options)));
        return "failed";
      }
      return run(() => planSnooze(conversations, fresh(scope), snoozedId, at), copy, options);
    },
    unsnooze: (conversations, scope, options) => run(() => planUnsnooze(conversations, fresh(scope).roles, deps.snoozedId?.()), UNSNOOZE_COPY, options),
    run,
  };
}
