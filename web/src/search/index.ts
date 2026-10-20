// Search (brief 10): the top-bar box, its suggestions, the advanced-search
// form and the results. The parser itself is in @postern/jmap (parseSearch).
//
//   <SearchBox query? />, <SearchRoute route />   the shell renders them
//   focusSearch()                                 brief 14's `/`
//   useParsedSearch(query)                        a query parsed against the account's labels (null while they load)
//   SuggestionSource, Suggestion, suggestionQuery, replaceToken   the suggestion-source interface (contacts plug in from ../contacts/searchSource)

export { SearchBox, type SearchBoxProps } from "./SearchBox";
export { SearchRoute, type SearchRouteProps } from "./SearchRoute";
export { focusSearch } from "./focus";
export { useParsedSearch } from "./useParsedSearch";
export { useSuggestionSources } from "./suggestionSources";
export {
  quoteArg,
  replaceToken,
  suggestionQuery,
  type Sender,
  type Suggestion,
  type SuggestionQuery,
  type SuggestionSource,
} from "./suggestions";
