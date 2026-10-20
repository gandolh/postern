// The main panel: which screen each route shows, the reading-pane split, and
// the layout states (loading, unknown label, server unreachable).

import { SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { ContactsRoute } from "../contacts/ContactsRoute";
import { ConversationView } from "../conversation/ConversationView";
import { resolveLabelRoute } from "../labels/labelsStore";
import { useLabels } from "../labels/useLabels";
import { ListRoute } from "../list/ListRoute";
import { SearchRoute } from "../search/SearchRoute";
import { SettingsRoutes } from "../settings/SettingsRoutes";
import { useDisplaySettings, type ReadingPane } from "../theme";
import { PHONE_QUERY } from "./breakpoints";
import { formatRoute, INBOX, withoutConversation, type LabelRoute, type Route } from "./router";
import { ConnectionLost, EmptyState, ListSkeleton } from "./states";
import { useMediaQuery } from "./useMediaQuery";

export function MainArea({ route }: { route: Route }) {
  const { readingPane: chosen } = useDisplaySettings();
  // Brief 16: a phone has room for one column, so the list and the conversation
  // stack as routes (back returns to the list), whatever the reading pane setting.
  const phone = useMediaQuery(PHONE_QUERY);
  const readingPane: ReadingPane = phone ? "none" : chosen;
  switch (route.kind) {
    case "settings":
      return <SettingsRoutes section={route.section} />;
    case "contacts":
      return <ContactsRoute />;
    case "search":
      return (
        <MailSplit
          pane={readingPane}
          list={<SearchRoute key={formatRoute(withoutConversation(route))} route={route} />}
          conversation={route.conversationId ? <ConversationView route={route} conversationId={route.conversationId} label={null} /> : null}
        />
      );
    default:
      return <LabelArea route={route} pane={readingPane} />;
  }
}

function LabelArea({ route, pane }: { route: LabelRoute; pane: ReadingPane }) {
  const labels = useLabels();

  if (labels.status === "loading") return <ListSkeleton />;
  if (labels.status === "error") {
    return labels.offline ? (
      <ConnectionLost onRetry={() => void labels.store.sync()} />
    ) : (
      <ConnectionLost title="Your labels didn't load" onRetry={() => void labels.store.sync()}>
        <p>Something went wrong on the way. Try again in a moment.</p>
      </ConnectionLost>
    );
  }

  const label = resolveLabelRoute(route, labels);
  if (!label) {
    return (
      <EmptyState icon={SearchX} title="This label doesn't exist">
        <p>It may have been deleted or renamed.</p>
        <a className="btn" href={formatRoute(INBOX)}>
          Go to Inbox
        </a>
      </EmptyState>
    );
  }

  return (
    <MailSplit
      pane={pane}
      list={<ListRoute key={formatRoute(withoutConversation(route))} route={route} label={label} />}
      conversation={route.conversationId ? <ConversationView route={route} conversationId={route.conversationId} label={label} /> : null}
    />
  );
}

/** The list alone, the conversation alone (reading pane off), or both side by side or stacked. */
function MailSplit({ pane, list, conversation }: { pane: ReadingPane; list: ReactNode; conversation: ReactNode }) {
  if (pane === "none") return conversation ?? list;
  return (
    <div className="shell-split" data-pane={pane}>
      <div className="shell-split-list">{list}</div>
      <div className="shell-split-pane">{conversation ?? <EmptyState title="No conversation selected" />}</div>
    </div>
  );
}
