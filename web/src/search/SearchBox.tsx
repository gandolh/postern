// The search box in the top bar: a combobox with suggestions (recent
// searches, labels, people), and the advanced-search form under it.
//
//   Enter            search (the chosen suggestion, if one is highlighted)
//   Up / Down        move through the suggestions
//   Escape           close the list; then clear the box; then leave it
//   focusSearch()    from ./focus: the keyboard shortcuts' `/`

import { Popover } from "../components/ui/Popover";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { iconButtonClass } from "../shell/IconButton";
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { navigate } from "../shell/router";
import { AdvancedSearch } from "./AdvancedSearch";
import { registerSearchInput } from "./focus";
import { suggestionQuery, type Suggestion, type SuggestionSource } from "./suggestions";
import { useSuggestionSources } from "./suggestionSources";

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
    if (!rootRef.current?.contains(event.relatedTarget)) {
      setFocused(false);
      setAdvanced(false);
    }
  }

  const activeId = open && active >= 0 ? `${listId}-opt-${active}` : undefined;
  let optionIndex = -1;

  return (
    <div className="relative" ref={rootRef} onFocus={() => setFocused(true)} onBlur={onBlur}>
      <Popover.Root
        open={advanced}
        onOpenChange={(next, details) => {
          // A press in the search box itself leaves the form open, as before; anywhere else closes it.
          const target = details.event.target;
          if (
            !next &&
            details.reason === "outside-press" &&
            target instanceof Node &&
            rootRef.current?.contains(target)
          )
            return;
          setAdvanced(next);
        }}
      >
        <div
          className="flex h-12 items-center gap-1 rounded-lg border border-transparent bg-hover pr-3 pl-1 transition-[background-color,box-shadow] duration-(--duration-fast) ease-out focus-within:border-border focus-within:bg-surface focus-within:shadow-md has-[input:focus-visible]:[outline:var(--focus-ring)] has-[input:focus-visible]:outline-offset-0 max-sm:pr-1"
          role="search"
        >
          <button
            type="button"
            className={iconButtonClass("max-sm:flex-none", false)}
            aria-label="Search"
            onClick={() => search(value)}
          >
            <Search aria-hidden="true" />
          </button>
          <input
            ref={setInput}
            className="h-full min-w-0 flex-[1_1_auto] bg-transparent p-0 text-lg text-text placeholder:text-text-muted focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
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
              className={iconButtonClass("max-sm:flex-none", false)}
              aria-label="Clear search"
              onClick={() => {
                setValue("");
                inputRef.current?.focus();
              }}
            >
              <X aria-hidden="true" />
            </button>
          )}
          <Popover.Trigger
            className={iconButtonClass("max-sm:flex-none", false)}
            aria-label="Search options"
            onClick={() => setDismissed(true)}
          >
            <SlidersHorizontal aria-hidden="true" />
          </Popover.Trigger>
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute top-[calc(100%+0.25rem)] right-0 left-0 z-overlay m-0 max-h-[min(28rem,70vh)] list-none overflow-y-auto rounded-lg border border-border bg-surface-raised py-2 shadow-lg"
          hidden={!open}
        >
          {open &&
            groups.map((g) => (
              <li key={g.source.id} role="presentation" className="list-none">
                <div
                  className="px-4 pt-2 pb-1 text-xs font-semibold tracking-[0.04em] text-text-muted uppercase"
                  role="presentation"
                >
                  {g.source.heading}
                </div>
                <ul role="group" aria-label={g.source.heading} className="m-0 list-none p-0">
                  {g.items.map((item) => {
                    optionIndex++;
                    const index = optionIndex;
                    return (
                      <li
                        key={item.key}
                        id={`${listId}-opt-${index}`}
                        role="option"
                        aria-selected={index === active}
                        className="flex min-h-9 cursor-pointer items-baseline gap-3 px-4 py-1 text-md text-text aria-selected:bg-hover aria-selected:shadow-[inset_2px_0_0_var(--color-accent)]"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseMove={() => setActive(index)}
                        onClick={() => choose(item)}
                      >
                        <span className="min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap">
                          {item.label}
                        </span>
                        {item.detail && (
                          <span className="min-w-0 flex-[1_1_auto] overflow-hidden text-sm text-ellipsis whitespace-nowrap text-text-muted">
                            {item.detail}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
        </ul>
        {/* Portalled into the search root, so focus in the form still counts as in the search. */}
        <Popover.Popup
          container={rootRef}
          positionerClassName="z-overlay w-(--anchor-width)"
          anchor={rootRef}
          collisionPadding={5}
          className="rounded-lg border border-border bg-surface-raised p-4 shadow-lg"
          aria-label="Advanced search"
          finalFocus={inputRef}
        >
          <AdvancedSearch onSearch={search} onClose={() => setAdvanced(false)} />
        </Popover.Popup>
      </Popover.Root>
    </div>
  );
}
