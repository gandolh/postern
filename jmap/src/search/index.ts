// Gmail-style search: the operator parser and the Email/query filter builder.
// Pure: no network, no DOM, no clock (`now` is passed in).

export { parseSearch } from "./parse.js";
export { formatSearch } from "./format.js";
export { createLabelResolver, normalizeLabelName } from "./labels.js";
export { parseSearchDate, parseSize, subtractAge } from "./dates.js";
export type {
  AdvancedSearchFields,
  ParsedSearch,
  ParseSearchOptions,
  SearchRoles,
  SearchWarning,
  SearchWarningKind,
} from "./types.js";
