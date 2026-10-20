// The search results: the conversation list (brief 06) over the filter the
// parser builds, with SearchSnippet highlights, every list action, and the
// parser's warnings as a quiet hint above the rows.
//
// The shell renders it for #search/<query>, and beside an open conversation
// when the reading pane is on.

import { useMemo } from "react";
import type { ConversationScope } from "../actions/conversation";
import { ConversationList } from "../list/ConversationList";
import type { ListPresentation, ListQuery } from "../list/types";
import { rolesFrom } from "../actions/useMailActions";
import { useLabelsStore } from "../labels/useLabels";
import type { SearchResultsRoute } from "../shell/router";
import { ListSkeleton } from "../shell/states";
import { useParsedSearch } from "./useParsedSearch";
import "./search.css";

export interface SearchRouteProps {
  /** The query, and `conversationId` when a result is open beside the list. */
  route: SearchResultsRoute;
}

export function SearchRoute({ route }: SearchRouteProps) {
  const parsed = useParsedSearch(route.query);
  const store = useLabelsStore();
  const scope = parsed?.scope ?? "normal";
  const query = useMemo<ListQuery | null>(() => {
    if (!parsed) return null;
    // Roles are read when the parse (which depends on them) changes.
    const scopeInfo: ConversationScope = { kind: scope, roles: rolesFrom(store) };
    // No `matches`: full-text search cannot be decided on the client, so a
    // row leaves when the server says so, a moment after an action.
    return { filter: parsed.filter, scope: scopeInfo, searchSnippets: true };
  }, [parsed, scope, store]);

  if (!parsed || !query) {
    return (
      <section className="shell-page" aria-labelledby="search-title">
        <h1 id="search-title" className="visually-hidden">
          Search results
        </h1>
        <ListSkeleton label="Loading search results" />
      </section>
    );
  }

  const presentation: ListPresentation = {
    currentLabelId: undefined,
    senderMode: "from",
    canArchive: scope === "normal",
    deleteForever: scope !== "normal",
    notSpam: scope === "spam",
  };

  return (
    <div className="search-page">
      {parsed.warnings.length > 0 && (
        <ul className="search-hints" aria-label="Notes about this search">
          {parsed.warnings.map((w, i) => (
            <li key={`${w.kind}-${i}`} className="search-hint">
              {w.message}
            </li>
          ))}
        </ul>
      )}
      <div className="search-results">
        <ConversationList
          query={query}
          presentation={presentation}
          title="Search results"
          heading="Search results"
          allLabel="that match this search"
          route={route}
          labelRoute={null}
          emptyMessage="No conversations match this search"
        />
      </div>
    </div>
  );
}
