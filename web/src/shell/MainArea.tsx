// The main panel: which screen each route shows, the reading-pane split, and
// the layout states (loading, unknown label, server unreachable).

import { SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { rowNoun } from "../actions/copy";
import { ContactsRoute } from "../contacts/ContactsRoute";
import { ConversationView } from "../conversation/ConversationView";
import { resolveLabelRoute } from "../labels/labelsStore";
import { useLabels } from "../labels/useLabels";
import { ListRoute } from "../list/ListRoute";
import { usePrefs } from "../prefs/usePrefs";
import { SearchConversation } from "../search/SearchConversation";
import { SearchRoute } from "../search/SearchRoute";
import { ScheduledRoute } from "../send/ScheduledRoute";
import { SettingsRoutes } from "../settings/SettingsRoutes";
import { useDisplaySettings, type ReadingPane } from "../theme";
import { PHONE_QUERY } from "./breakpoints";
import { formatRoute, INBOX, withoutConversation, type LabelRoute, type Route } from "./router";
import { ConnectionLost, EmptyState, ListSkeleton } from "./states";
import { useMediaQuery } from "./useMediaQuery";
import { buttonClass } from "../components/ui/Button";

/** The screens' surface: an island on the canvas, edged by a hairline. */
const ISLAND = "min-h-0 min-w-0 rounded-xl border border-border bg-surface shadow-sm";

export function Island({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return <div className={`h-full ${ISLAND} ${scroll ? "overflow-auto" : "overflow-hidden"}`}>{children}</div>;
}

export function MainArea({ route }: { route: Route }) {
  const { readingPane: chosen } = useDisplaySettings();
  // A phone has room for one column, so the list and the conversation
  // stack as routes (back returns to the list), whatever the reading pane setting.
  const phone = useMediaQuery(PHONE_QUERY);
  const readingPane: ReadingPane = phone ? "none" : chosen;
  switch (route.kind) {
    case "settings":
      return (
        <Island>
          <SettingsRoutes section={route.section} />
        </Island>
      );
    case "contacts":
      return (
        <Island>
          <ContactsRoute />
        </Island>
      );
    case "scheduled":
      return (
        <Island>
          <ScheduledRoute />
        </Island>
      );
    case "search":
      return (
        <MailSplit
          pane={readingPane}
          list={<SearchRoute key={formatRoute(withoutConversation(route))} route={route} />}
          conversation={
            route.conversationId ? <SearchConversation route={route} conversationId={route.conversationId} /> : null
          }
        />
      );
    default:
      return <LabelArea route={route} pane={readingPane} />;
  }
}

function LabelArea({ route, pane }: { route: LabelRoute; pane: ReadingPane }) {
  const labels = useLabels();

  if (labels.status === "loading")
    return (
      <Island>
        <ListSkeleton />
      </Island>
    );
  if (labels.status === "error") {
    return (
      <Island>
        {labels.offline ? (
          <ConnectionLost onRetry={() => void labels.store.sync()} />
        ) : (
          <ConnectionLost title="Your labels didn't load" onRetry={() => void labels.store.sync()}>
            <p>Something went wrong on the way. Try again in a moment.</p>
          </ConnectionLost>
        )}
      </Island>
    );
  }

  const label = resolveLabelRoute(route, labels);
  if (!label) {
    return (
      <Island>
        <EmptyState icon={SearchX} title="This label doesn't exist">
          <p>It may have been deleted or renamed.</p>
          <a className={buttonClass("default")} href={formatRoute(INBOX)}>
            Go to Inbox
          </a>
        </EmptyState>
      </Island>
    );
  }

  return (
    <MailSplit
      pane={pane}
      list={<ListRoute key={formatRoute(withoutConversation(route))} route={route} label={label} />}
      conversation={
        route.conversationId ? (
          <ConversationView route={route} conversationId={route.conversationId} label={label} />
        ) : null
      }
    />
  );
}

/** The list alone, the conversation alone (reading pane off), or both side by side or stacked. */
function MailSplit({ pane, list, conversation }: { pane: ReadingPane; list: ReactNode; conversation: ReactNode }) {
  // With conversation view off a row is a message.
  const noun = rowNoun(usePrefs().prefs.conversationView);
  if (pane === "none") return conversation ? <Island>{conversation}</Island> : <Island scroll={false}>{list}</Island>;
  return (
    <div
      className="grid h-full gap-2 data-[pane=below]:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] data-[pane=right]:grid-cols-[minmax(20rem,var(--list-width))_minmax(0,1fr)] max-sm:data-[pane=right]:grid-cols-[minmax(0,1fr)]"
      data-pane={pane}
    >
      <Island scroll={false}>{list}</Island>
      <div className="min-h-0 min-w-0 max-sm:in-data-[pane=right]:hidden">
        <Island>{conversation ?? <EmptyState title={`No ${noun} selected`} />}</Island>
      </div>
    </div>
  );
}
