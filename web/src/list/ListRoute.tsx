// Brief 06 replaces this stub with the conversation list.
//
// The shell renders it for every label route (#inbox, #starred, #sent,
// #drafts, #spam, #trash, #all, #label/<id>), keyed by the list, so it
// remounts when the label changes. With the reading pane on (brief 12), it
// also renders beside an open conversation, and `route.conversationId` is the
// one open.

import type { ResolvedLabel } from "../labels/labelsStore";
import type { LabelRoute } from "../shell/router";
import { EmptyState, ListSkeleton, emptyLabelMessage } from "../shell/states";

export interface ListRouteProps {
  /** The route, with `conversationId` when a conversation is open beside the list. */
  route: LabelRoute;
  /**
   * The label it shows, resolved by role: `mailboxId` is undefined for Starred
   * (filter by `keyword: "$flagged"`) and for All Mail while the account has no
   * archive-role mailbox (brief 06 decides what #all queries).
   */
  label: ResolvedLabel;
}

export function ListRoute({ label }: ListRouteProps) {
  const counts = label.label;
  const empty = counts !== undefined && counts.totalThreads === 0;
  return (
    <section className="shell-page" aria-labelledby="list-title">
      <header className="shell-page-header">
        <h1 id="list-title" className="shell-page-title">
          {label.title}
        </h1>
        {counts && !empty ? (
          <p className="shell-page-meta">
            {counts.totalThreads.toLocaleString()} conversations, {counts.unreadThreads.toLocaleString()} unread
          </p>
        ) : null}
      </header>
      {empty ? (
        <EmptyState title={emptyLabelMessage(label.title)} />
      ) : (
        <ListSkeleton rows={10} animated={false} />
      )}
    </section>
  );
}
