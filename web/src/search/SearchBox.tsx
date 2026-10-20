// The search box in the top bar: a combobox with suggestions (recent
// searches, labels, people), and the advanced-search form under it.
//
//   Enter            search (the chosen suggestion, if one is highlighted)
//   Up / Down        move through the suggestions
//   Escape           close the list; then clear the box; then leave it
//   focusSearch()    from ./focus: brief 14's `/`

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { navigate } from "../shell/router";
import { AdvancedSearch } from "./AdvancedSearch";
import { registerSearchInput } from "./focus";
import { suggestionQuery, type Suggestion, type SuggestionSource } from "./suggestions";
import { useSuggestionSources } from "./suggestionSources";
import "./search.css";

export interface SearchBoxProps {
  /** The query on screen when the route is search results; undefined elsewhere. */
  query?: string;
}

interface Group {
  source: SuggestionSource;
  items: Suggestion[];
}

export function SearchBox({ query }: SearchBoxProps) {
  const { sources, session } = useSuggestionSources();
  const listId = useId();
  const [value, setValue] = useState(query ?? "");
  const [shownQuery, setShownQuery] = useState(query);
  const [focused, setFocused] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // The box shows the search on screen: follow the route, not every render.
  if (shownQuery !== query) {
    setShownQuery(query);
    setValue(query ?? "");
  }

  const setInput = useCallback((el: HTMLInputElement | null) => {
    inputRef.current = el;
    registerSearchInput(el);
  }, []);

  // Ask the sources whenever the text changes (each may answer later).
  useEffect(() => {
    if (!focused) return;
    const controller = new AbortController();
    const q = suggestionQuery(value);
    void Promise.all(
      sources.map(async (source) => {
        try {
          return { source, items: await source.suggest(q, controller.signal) };
        } catch {
          return { source, items: [] as Suggestion[] };
        }
      }),
    ).then((all) => {
      if (controller.signal.aborted) return;
      setGroups(all.filter((g) => g.items.length > 0));
      setActive(-1);
    });
    return () => controller.abort();
  }, [value, sources, focused]);

  const flat = groups.flatMap((g) => g.items.map((item) => ({ item, source: g.source })));
  const open = focused && !advanced && !dismissed && flat.length > 0;

  function search(text: string): void {
    const q = text.trim();
    if (!q) return;
    session.recent.add(q);
    setValue(q);
    setAdvanced(false);
    setDismissed(true);
    inputRef.current?.blur();
    navigate({ kind: "search", query: q });
  }

  function choose(item: Suggestion): void {
    if (item.submit) {
      search(item.text);
      return;
    }
    // Leave the box open for more: a space after what was completed.
    setValue(`${item.text} `);
    setDismissed(false);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (flat.length === 0) return;
        setDismissed(false);
        setActive((a) => (a + 1) % flat.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (flat.length === 0) return;
        setDismissed(false);
        setActive((a) => (a <= 0 ? flat.length - 1 : a - 1));
        break;
      case "Enter":
        event.preventDefault();
        if (open && active >= 0 && flat[active]) choose(flat[active].item);
        else search(value);
        break;
      case "Escape":
        event.preventDefault();
        if (open) setDismissed(true);
        else if (value !== "") setValue("");
        else inputRef.current?.blur();
        break;
    }
  }

  function onBlur(event: FocusEvent<HTMLDivElement>): void {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
      setFocused(false);
      setAdvanced(false);
    }
  }

  const activeId = open && active >= 0 ? `${listId}-opt-${active}` : undefined;
  let optionIndex = -1;

  return (
    <div className="search-root" ref={rootRef} onFocus={() => setFocused(true)} onBlur={onBlur}>
      <div className="search-box" role="search">
        <button type="button" className="icon-btn search-box-submit" aria-label="Search" onClick={() => search(value)}>
          <Search aria-hidden="true" />
        </button>
        <input
          ref={setInput}
          className="search-box-input"
          type="text"
          name="q"
          role="combobox"
          aria-label="Search mail"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          placeholder="Search mail"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setDismissed(false);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setDismissed(false)}
        />
        {value !== "" && (
          <button
            type="button"
            className="icon-btn search-box-clear"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              inputRef.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="icon-btn search-box-options"
          aria-label="Search options"
          aria-expanded={advanced}
          aria-haspopup="dialog"
          onClick={() => {
            setAdvanced((a) => !a);
            setDismissed(true);
          }}
        >
          <SlidersHorizontal aria-hidden="true" />
        </button>
      </div>
      <ul id={listId} role="listbox" aria-label="Search suggestions" className="search-suggestions" hidden={!open}>
        {open &&
          groups.map((g) => (
            <li key={g.source.id} role="presentation" className="search-group">
              <div className="search-group-heading" role="presentation">
                {g.source.heading}
              </div>
              <ul role="group" aria-label={g.source.heading} className="search-group-items">
                {g.items.map((item) => {
                  optionIndex++;
                  const index = optionIndex;
                  return (
                    <li
                      key={item.key}
                      id={`${listId}-opt-${index}`}
                      role="option"
                      aria-selected={index === active}
                      className="search-option"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => setActive(index)}
                      onClick={() => choose(item)}
                    >
                      <span className="search-option-label">{item.label}</span>
                      {item.detail && <span className="search-option-detail">{item.detail}</span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
      </ul>
      {advanced && (
        <div
          className="search-advanced-wrap"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setAdvanced(false);
              inputRef.current?.focus();
            }
          }}
        >
          <AdvancedSearch
            onSearch={search}
            onClose={() => {
              setAdvanced(false);
              inputRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
