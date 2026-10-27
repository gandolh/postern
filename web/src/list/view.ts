// Which conversations a label route lists, as an Email/query filter plus the
// same test on the client (so a row can leave at once when it no longer
// belongs), and how the view presents them. Pure.
//
//   Inbox, Sent, Spam, Trash           inMailbox: the role's mailbox
//   Drafts                             inMailbox, less messages waiting to be sent
//                                      ($scheduled, brief 23: they are in Scheduled)
//   Inbox                              woken conversations first ($woken, brief 24),
//                                      then newest first
//   Snoozed                            inMailbox: the Snoozed label (brief 24)
//   Starred                            $flagged, outside Spam and Trash
//   All Mail                           everything outside Spam and Trash (Gmail's meaning,
//                                      not just the archive-role mailbox)
//   a user label                       inMailbox: the label

import type { EmailFilter, EmailFilterCondition, Id } from "@postern/jmap";
import { FLAGGED, type ConversationScope, type MailboxRoles } from "../actions/conversation";
import { WOKEN } from "../snooze/keyword";
import type { ResolvedLabel } from "../labels/labelsStore";
import type { ListPresentation, ListQuery, RowMessage } from "./types";

/** A draft the server is holding to send later (send/schedule.ts SCHEDULED; not imported, to keep this module pure). */
const SCHEDULED = "$scheduled";

export interface LabelListView {
  query: ListQuery;
  presentation: ListPresentation;
}

const outside = (roles: MailboxRoles): Id[] => [roles.junk, roles.trash].filter((id): id is Id => id !== undefined);

function inSome(message: RowMessage, ids: readonly Id[]): boolean {
  return Object.keys(message.mailboxIds).some((id) => !ids.includes(id));
}

/** The list for a label, or null when its mailbox is missing (an account without Sent, say). */
export function labelListView(label: Pick<ResolvedLabel, "view" | "mailboxId">, roles: MailboxRoles): LabelListView | null {
  const view = label.view;
  const scope: ConversationScope = { kind: view === "trash" ? "trash" : view === "spam" ? "spam" : "normal", roles };
  const presentation: ListPresentation = {
    currentLabelId: label.mailboxId,
    senderMode: view === "sent" || view === "drafts" ? "to" : "from",
    // Nothing in Snoozed is in the Inbox to archive (Unsnooze is in the snooze menu).
    canArchive: view !== "trash" && view !== "spam" && view !== "snoozed",
    deleteForever: view === "trash" || view === "spam",
    notSpam: view === "spam",
  };

  if (view === "starred" || view === "all") {
    const others = outside(roles);
    const notJunkOrTrash: EmailFilterCondition | null = others.length ? { inMailboxOtherThan: others } : null;
    if (view === "starred") {
      const starred: EmailFilterCondition = { hasKeyword: FLAGGED };
      const filter: EmailFilter = notJunkOrTrash ? { operator: "AND", conditions: [starred, notJunkOrTrash] } : starred;
      return {
        query: { filter, scope, matches: (m) => m.keywords[FLAGGED] === true && inSome(m, others) },
        presentation: { ...presentation, currentLabelId: undefined },
      };
    }
    return {
      query: { filter: notJunkOrTrash, scope, matches: (m) => inSome(m, others) },
      // All Mail's own mailbox is a system label: chips never show it anyway.
      presentation,
    };
  }

  const mailboxId = label.mailboxId;
  if (mailboxId === undefined) return null;
  if (view === "inbox") {
    // A woken conversation comes back on top, as Gmail's does: receivedAt can't move, so $woken sorts first.
    return {
      query: {
        filter: { inMailbox: mailboxId },
        sort: [
          { property: "hasKeyword", keyword: WOKEN, isAscending: false },
          { property: "receivedAt", isAscending: false },
        ],
        scope,
        matches: (m) => m.mailboxIds[mailboxId] === true,
      },
      presentation,
    };
  }
  if (view === "drafts") {
    return {
      query: {
        filter: { operator: "AND", conditions: [{ inMailbox: mailboxId }, { notKeyword: SCHEDULED }] },
        scope,
        matches: (m) => m.mailboxIds[mailboxId] === true && m.keywords[SCHEDULED] !== true,
      },
      presentation,
    };
  }
  return { query: { filter: { inMailbox: mailboxId }, scope, matches: (m) => m.mailboxIds[mailboxId] === true }, presentation };
}
