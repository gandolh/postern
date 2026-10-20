// Brief 10 replaces this stub with the search results: the list with
// highlighted snippets. The shell renders it for #search/<query>, and beside
// an open conversation when the reading pane is on.

import { Search } from "lucide-react";
import type { SearchResultsRoute } from "../shell/router";
import { EmptyState } from "../shell/states";

export interface SearchRouteProps {
  /** The query, and `conversationId` when a result is open beside the list. */
  route: SearchResultsRoute;
}

export function SearchRoute({ route }: SearchRouteProps) {
  return (
    <section className="shell-page" aria-labelledby="search-title">
      <header className="shell-page-header">
        <h1 id="search-title" className="shell-page-title">
          Search results
        </h1>
        <p className="shell-page-meta">for “{route.query}”</p>
      </header>
      <EmptyState icon={Search} title="Search results appear here" />
    </section>
  );
}
