// Mail actions (brief 06): archive, delete, star, read, important, spam,
// labels and move, as plans of per-message patches with exact inverses.
//
//   useMailActions()          the actions with optimistic update, toast and undo
//   createMailActions(deps)   the same without React
//   plan*                     pure planners (./plans, ./spam)
//   editToPatch / applyPatch / invertPatch   the patch logic (./patches)
//   ensureAllMail             All Mail made on first need (./allMail)
//   subscribeMailChanges      hear optimistic patches and "settled" (./bus)
//   undoLast / peekUndo       the last undoable action, for `z` (./undo)

export {
  applyPatch,
  editToPatch,
  emptyPlan,
  invertPatch,
  isEmptyPlan,
  NoMailboxError,
  planEdits,
  reversePlan,
  subPlan,
  type MessageEdit,
  type MessagePlan,
  type MessageState,
} from "./patches";
export {
  DRAFT,
  FLAGGED,
  IMPORTANT,
  JUNK,
  NOT_JUNK,
  SEEN,
  inScope,
  isImportant,
  isStarred,
  isUnread,
  labelIdsOf,
  latest,
  shownMessages,
  ROLE_NAMES,
  type Conversation,
  type ConversationMessage,
  type ConversationScope,
  type MailboxRoles,
  type ScopeKind,
} from "./conversation";
export {
  archiveNeedsAllMail,
  destroyIds,
  MissingLabelError,
  planArchive,
  planImportant,
  planKeyword,
  planLabels,
  planMove,
  planRead,
  planStar,
  planTrash,
  type LabelChange,
} from "./plans";
export { notSpam, planNotSpam, planReportSpam, reportSpam } from "./spam";
export { destroyMessages, firstSetError, sendPlan, type DestroyResult, type SendResult } from "./execute";
export { ALL_MAIL_NAME, ensureAllMail, type AllMailLabels } from "./allMail";
export { publishMailChange, subscribeMailChanges, type MailChange } from "./bus";
export { clearUndo, peekUndo, runUndo, setUndo, subscribeUndo, undoLast, type UndoEntry } from "./undo";
export {
  actionCopy,
  COPY,
  createMailActions,
  isQuietError,
  UNDO_FAILED_MESSAGE,
  UNDONE_MESSAGE,
  type ActionCopy,
  type ActionOptions,
  type ActionOutcome,
  type ActionToast,
  type MailActionDeps,
  type MailActions,
} from "./runner";
export { capitalised, nounFor, rowNoun, type RowNoun } from "./copy";
export { rolesFrom, useMailActions } from "./useMailActions";
