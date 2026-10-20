// Brief 10 replaces this stub with the search box, its suggestions and the
// advanced-search dropdown. The shell renders it in the top bar.
//
// Until then it only goes to #search/<query> on Enter.

import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { navigate } from "../shell/router";
import "./search.css";

export interface SearchBoxProps {
  /** The query on screen when the route is search results; undefined elsewhere. */
  query?: string;
}

export function SearchBox({ query }: SearchBoxProps) {
  return <SearchField key={query ?? ""} initial={query ?? ""} />;
}

function SearchField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);

  function submit(event: FormEvent): void {
    event.preventDefault();
    const q = value.trim();
    if (q) navigate({ kind: "search", query: q });
  }

  return (
    <form className="search-box" role="search" onSubmit={submit}>
      <button type="submit" className="icon-btn search-box-submit" aria-label="Search">
        <Search aria-hidden="true" />
      </button>
      <input
        className="search-box-input"
        type="search"
        name="q"
        aria-label="Search mail"
        placeholder="Search mail"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </form>
  );
}
