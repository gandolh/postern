// A conversation opened from search results. It shows what the search's own
// scope shows, as the results list does: `in:trash` and `in:spam` only those
// messages, every other search leaves them out. Both the scope and which
// messages are reply drafts or in Trash come from the labels, so it waits for
// them, as a conversation opened from a label does (shell/MainArea.tsx).

import { ConversationLoading, ConversationView } from "../conversation/ConversationView";
import { useLabels } from "../labels/useLabels";
import { formatRoute, withoutConversation, type SearchResultsRoute } from "../shell/router";
import { ConnectionLost } from "../shell/states";
import { useParsedSearch } from "./useParsedSearch";

export function SearchConversation({ route, conversationId }: { route: SearchResultsRoute; conversationId: string }) {
  const labels = useLabels();
  const parsed = useParsedSearch(route.query);
  if (labels.status === "error") {
    return (
      <ConnectionLost title="Your labels didn't load" onRetry={() => void labels.store.sync()}>
        <p>Something went wrong on the way. Try again in a moment.</p>
      </ConnectionLost>
    );
  }
  if (!parsed) return <ConversationLoading backHref={formatRoute(withoutConversation(route))} backLabel="Back to search results" />;
  return <ConversationView route={route} conversationId={conversationId} label={null} scope={parsed.scope} />;
}
