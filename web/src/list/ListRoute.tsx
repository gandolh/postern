// The conversation list for a label route (#inbox, #starred, #sent, #drafts,
// #spam, #trash, #all, #label/<id>). The shell keys it by the list, so it
// remounts when the label changes; with the reading pane on it renders beside
// the open conversation (`route.conversationId`, highlighted).

import { useMemo } from "react";
import type { MailboxRoles } from "../actions/conversation";
import { rolesFrom } from "../actions/useMailActions";
import type { ResolvedLabel } from "../labels/labelsStore";
import { useLabels } from "../labels/useLabels";
import type { LabelRoute } from "../shell/router";
import { EmptyState, emptyLabelMessage } from "../shell/states";
import { ConversationList } from "./ConversationList";
import { labelListView } from "./view";
import "./list.css";

export interface ListRouteProps {
  /** The route, with `conversationId` when a conversation is open beside the list. */
  route: LabelRoute;
  /**
   * The label it shows, resolved by role: `mailboxId` is undefined for Starred
   * (the $flagged keyword) and for All Mail while the account has no
   * archive-role mailbox. All Mail lists everything outside Spam and Trash.
   */
  label: ResolvedLabel;
}

export function ListRoute({ route, label }: ListRouteProps) {
  const labels = useLabels();
  // A new object only when a role's mailbox changes, not on every count change.
  const rolesKey = JSON.stringify(rolesFrom(labels.store));
  const roles = useMemo(() => JSON.parse(rolesKey) as MailboxRoles, [rolesKey]);
  const view = useMemo(() => labelListView({ view: label.view, mailboxId: label.mailboxId }, roles), [label.view, label.mailboxId, roles]);
  const emptyMessage = label.view === "starred" ? "No starred conversations" : emptyLabelMessage(label.title);

  // A label whose own count says it is empty needs no query. Not All Mail or
  // Starred: their mailbox count is not the list's.
  const countable = label.view !== "all" && label.view !== "starred";
  if (!view || (countable && label.label?.totalThreads === 0)) {
    return (
      <section className="list-page" aria-labelledby="list-heading">
        <h1 id="list-heading" className="visually-hidden">
          {label.title}
        </h1>
        <EmptyState title={emptyMessage} />
      </section>
    );
  }

  return (
    <ConversationList
      query={view.query}
      presentation={view.presentation}
      title={label.title}
      route={route}
      labelRoute={route}
      emptyMessage={emptyMessage}
    />
  );
}
